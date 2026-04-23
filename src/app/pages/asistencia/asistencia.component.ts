import { Component, OnDestroy, OnInit, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { EmpleadoService } from '../../services/empleado.service';
import { Empleado } from '../../models/empleado.model';
import { RegistroEmpleado } from '../../models/registro_empleado.model';
import { RoleService } from '../../services/role.service';

type Step = 'entrada' | 'inicio' | 'fin' | 'salida' | 'done';

@Component({
  selector: 'app-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asistencia.component.html',
  styleUrls: ['./asistencia.component.css']
})
export class AsistenciaComponent implements OnInit, OnDestroy {
  private empleadoService = inject(EmpleadoService);
  private roleService = inject(RoleService);
  private db = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  hoyKey = this.toFechaKey(new Date());
  fechaKey = this.hoyKey;

  role: 'admin' | 'employee' | null = null;
  empleados: Empleado[] = [];
  registros: RegistroEmpleado[] = [];

  cargando = false;
  errorMsg = '';

  empleadoSeleccionadoUid = '';

  qrEmpleado: { uid: string; nombre: string } | null = null;
  registroActual: RegistroEmpleado | null = null;
  marcacionModalOpen = false;
  marcacionError = '';

  scannerOpen = false;
  scanning = false;
  scanError = '';
  private reader: BrowserMultiFormatReader | null = null;
  private controls: IScannerControls | null = null;

  async ngOnInit(): Promise<void> {
    this.role = await firstValueFrom(this.roleService.role$.pipe(take(1)));
    try {
      const data = await firstValueFrom(this.empleadoService.getEmpleados());
      this.empleados = [...(data ?? [])].sort((a, b) =>
        (a.nombre ?? '').localeCompare(b.nombre ?? '')
      );
    } catch {
      this.empleados = [];
    }
    await this.cargarRegistrosDia();
  }

  ngOnDestroy(): void {
    this.stopScan();
  }

  async onEmpleadoListaChange(): Promise<void> {
    const uid = this.empleadoSeleccionadoUid.trim();
    if (!uid) {
      this.qrEmpleado = null;
      this.registroActual = null;
      return;
    }

    await this.onQrDecoded(uid);
  }

  async onChangeFecha(): Promise<void> {
    this.resetSeleccion();
    await this.cargarRegistrosDia();
  }

  async cargarRegistrosDia(): Promise<void> {
    this.errorMsg = '';
    this.cargando = true;
    try {
      const data = await firstValueFrom(this.empleadoService.getRegistrosByFecha(this.fechaKey));
      const list = [...(data ?? [])];
      const byEmp = new Map<string, RegistroEmpleado>();

      for (const r of list) {
        const key = (r as any)?.empleadoId ?? '';
        if (!key) continue;

        const prev = byEmp.get(key);
        if (!prev) {
          byEmp.set(key, r);
          continue;
        }

        const tPrev = new Date((prev as any)?.updatedAt ?? (prev as any)?.creadoEn ?? 0).getTime();
        const tNow = new Date((r as any)?.updatedAt ?? (r as any)?.creadoEn ?? 0).getTime();

        if (tNow >= tPrev) byEmp.set(key, r);
      }

      this.registros = Array.from(byEmp.values()).sort((a, b) =>
        (a.empleadoNombre ?? '').localeCompare(b.empleadoNombre ?? '')
      );
    } catch {
      this.registros = [];
      this.errorMsg = 'No se pudieron cargar los registros.';
    } finally {
      this.cargando = false;
    }
  }

  async openScan(): Promise<void> {
    this.scanError = '';
    this.scannerOpen = true;
    await this.startScan();
  }

  closeScan(): void {
    this.scannerOpen = false;
    this.stopScan();
  }

  async startScan(): Promise<void> {
    try {
      this.scanError = '';
      this.scanning = true;
      this.reader = this.reader ?? new BrowserMultiFormatReader();

      this.controls = await this.reader.decodeFromVideoDevice(
        undefined,
        'qrVideo',
        async (result, _err, controls) => {
          if (!result) return;
          const uid = result.getText()?.trim();
          if (!uid) return;

          controls.stop();
          this.scanning = false;
          await this.onQrDecoded(uid);
        }
      );
    } catch {
      this.scanError = 'Acceso a cámara denegado.';
      this.scanning = false;
    }
  }

  stopScan(): void {
    try { this.controls?.stop(); } catch {}
    this.controls = null;
    this.scanning = false;
  }

  async onQrDecoded(uid: string): Promise<void> {
    this.errorMsg = '';
    this.scanError = '';

    let nombre = '';
    try {
      const snap = await runInInjectionContext(
        this.injector,
        () => getDoc(doc(this.db, 'users', uid))
      );

      if (snap.exists()) {
        const data: any = snap.data();
        nombre = (data?.nombre ?? '').trim();
      }
    } catch {}

    if (!nombre) {
      nombre = this.empleados.find(e => e.id === uid)?.nombre ?? 'Empleado';
    }

    this.qrEmpleado = { uid, nombre };
    this.empleadoSeleccionadoUid = uid;
    this.scannerOpen = false;

    await this.ensureRegistroDia(uid, nombre);
    this.openMarcacionModal();
  }

  openMarcacionModal(): void {
    if (!this.qrEmpleado) return;
    this.marcacionError = '';
    this.marcacionModalOpen = true;
  }

  closeMarcacionModal(): void {
    this.marcacionModalOpen = false;
  }

  resetSeleccion(): void {
    this.qrEmpleado = null;
    this.registroActual = null;
    this.marcacionModalOpen = false;
    this.empleadoSeleccionadoUid = '';
  }

  get nextStep(): Step {
    const r: any = this.registroActual;
    if (!r?.entradaLaboral) return 'entrada';
    if (!r?.inicioComida) return 'inicio';
    if (!r?.finComida) return 'fin';
    if (!r?.salidaLaboral) return 'salida';
    return 'done';
  }

  async marcar(step: Exclude<Step, 'done'>): Promise<void> {
    this.marcacionError = '';
    if (!this.qrEmpleado) return;

    if (this.nextStep !== step) {
      this.marcacionError = `Acción inválida. Orden requerido: ${this.labelStep(this.nextStep)}.`;
      return;
    }

    const uid = this.qrEmpleado.uid;
    const id = this.registroDocId(this.fechaKey, uid);
    const nowISO = new Date().toISOString();

    const patch: any = {
      empleadoId: uid,
      empleadoNombre: this.qrEmpleado.nombre,
      fechaKey: this.fechaKey,
      updatedAt: nowISO
    };

    if (step === 'entrada') patch.entradaLaboral = nowISO;
    if (step === 'inicio') patch.inicioComida = nowISO;
    if (step === 'fin') patch.finComida = nowISO;
    if (step === 'salida') patch.salidaLaboral = nowISO;

    try {
      this.cargando = true;
      await this.empleadoService.upsertRegistroById(id, patch);
      await this.ensureRegistroDia(uid, this.qrEmpleado.nombre);
      await this.cargarRegistrosDia();
    } catch {
      this.marcacionError = 'Error al guardar.';
    } finally {
      this.cargando = false;
    }
  }

  private async ensureRegistroDia(uid: string, nombre: string): Promise<void> {
    const id = this.registroDocId(this.fechaKey, uid);
    const ref = doc(this.db, 'registroempleado', id);
    const snap = await runInInjectionContext(this.injector, () => getDoc(ref));

    if (!snap.exists()) {
      const nowISO = new Date().toISOString();
      await this.empleadoService.upsertRegistroById(id, {
        empleadoId: uid,
        empleadoNombre: nombre,
        fechaKey: this.fechaKey,
        creadoEn: nowISO,
        updatedAt: nowISO,
        entradaLaboral: null,
        inicioComida: null,
        finComida: null,
        salidaLaboral: null
      } as any);
    }

    const snap2 = await runInInjectionContext(this.injector, () => getDoc(ref));
    this.registroActual = (snap2.data() as any) ?? null;
  }

  private registroDocId(fechaKey: string, uid: string): string {
    return `${fechaKey}_${uid}`;
  }

  private labelStep(step: Step): string {
    const labels = {
      entrada: 'Entrada',
      inicio: 'Inicio comida',
      fin: 'Fin comida',
      salida: 'Salida',
      done: 'Completo'
    };
    return labels[step];
  }

  toFechaKey(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  formatHora(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  esEntradaATiempo(registro: RegistroEmpleado): boolean {
    const entrada = this.parseIsoDate(registro?.entradaLaboral);
    if (!entrada) return false;

    const limite = this.getLimiteTolerancia(this.resolveDateFromFechaKey(registro?.fechaKey || this.fechaKey));
    return entrada.getTime() <= limite.getTime();
  }

  getEstadoEntrada(registro: RegistroEmpleado): string {
    if (!registro?.entradaLaboral) return 'Sin entrada';
    return this.esEntradaATiempo(registro) ? 'En tiempo' : 'Retardo';
  }

  getHorarioJornada(fechaKey: string): string {
    const d = this.resolveDateFromFechaKey(fechaKey);
    const day = d.getDay();
    if (day === 6) return '08:00 a 14:00';
    if (day === 0) return 'Día no laborable';
    return '08:00 a 18:00';
  }

  async exportarReportePdf(): Promise<void> {
    const inicioSemana = this.getInicioSemana(this.resolveDateFromFechaKey(this.fechaKey));
    const finSemana = this.getFinSemanaLaboral(inicioSemana);
    const fechasSemana = this.getFechasSemanaLaboral(inicioSemana);

    try {
      this.cargando = true;
      const registrosSemana = await this.cargarRegistrosSemana(fechasSemana);
      const empleadosBase = this.empleados
        .filter(e => (e.role ?? 'employee') === 'employee')
        .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));

      if (!empleadosBase.length) {
        alert('No hay empleados registrados para generar el reporte semanal.');
        return;
      }

      const detallesRows: string[] = [];
      const resumenRows: string[] = [];

      let totalPuntuales = 0;
      let totalRetardos = 0;
      let totalFaltas = 0;
      let totalAsistencias = 0;

      for (const empleado of empleadosBase) {
        let asistencias = 0;
        let retardos = 0;
        let faltas = 0;

        for (const fecha of fechasSemana) {
          const key = this.toFechaKey(fecha);
          const registro = registrosSemana.get(`${key}_${empleado.id}`) ?? null;
          const tieneEntrada = !!registro?.entradaLaboral;
          const puntual = tieneEntrada ? this.esEntradaATiempo(registro as RegistroEmpleado) : false;
          const clase = !tieneEntrada ? 'na' : puntual ? 'ok' : 'late';
          const estado = !tieneEntrada ? 'Falta' : puntual ? 'En tiempo' : 'Retardo';

          if (tieneEntrada) {
            asistencias += 1;
            totalAsistencias += 1;
            if (puntual) {
              totalPuntuales += 1;
            } else {
              retardos += 1;
              totalRetardos += 1;
            }
          } else {
            faltas += 1;
            totalFaltas += 1;
          }

          detallesRows.push(`
            <tr>
              <td>${this.escapeHtml(empleado.nombre || 'Sin nombre')}</td>
              <td>${this.escapeHtml(this.getNombreDia(fecha))}</td>
              <td>${this.escapeHtml(key)}</td>
              <td class="${clase}">${this.escapeHtml(this.formatHora24(registro?.entradaLaboral))}</td>
              <td>${this.escapeHtml(this.formatHora24(registro?.salidaLaboral))}</td>
              <td class="${clase}">${this.escapeHtml(estado)}</td>
              <td>${this.escapeHtml(this.getHorarioJornada(key))}</td>
            </tr>
          `);
        }

        resumenRows.push(`
          <tr>
            <td>${this.escapeHtml(empleado.nombre || 'Sin nombre')}</td>
            <td>${asistencias}</td>
            <td class="ok">${asistencias - retardos}</td>
            <td class="late">${retardos}</td>
            <td class="na">${faltas}</td>
          </tr>
        `);
      }

      const rangoTexto = `${this.toFechaKey(inicioSemana)} al ${this.toFechaKey(finSemana)}`;
      const html = `
        <!doctype html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Reporte semanal de asistencia ${rangoTexto}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; padding: 24px; }
            .head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:24px; }
            h1 { margin:0 0 6px 0; font-size:24px; }
            h2 { margin:30px 0 10px 0; font-size:18px; }
            .meta { color:#475569; font-size:13px; margin-top:2px; }
            .box { border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; background:#fff7ed; color:#9a3412; min-width:260px; }
            table { width:100%; border-collapse:collapse; margin-top:12px; }
            th, td { border:1px solid #e2e8f0; padding:9px 10px; font-size:12px; text-align:left; }
            th { background:#111827; color:#fff; }
            .ok { color:#15803d; font-weight:700; }
            .late { color:#b91c1c; font-weight:700; }
            .na { color:#64748b; font-weight:700; }
            .legend { margin-top:16px; font-size:12px; color:#475569; }
            .legend span { margin-right:14px; }
            .legend .oktxt { color:#15803d; font-weight:700; }
            .legend .latetxt { color:#b91c1c; font-weight:700; }
            .legend .natxt { color:#64748b; font-weight:700; }
            @media print { body { padding: 0; } .box, table { break-inside: avoid; } }
          </style>
        </head>
        <body>
          <div class="head">
            <div>
              <h1>Reporte semanal de asistencia</h1>
              <div class="meta"><strong>Semana laboral:</strong> ${this.escapeHtml(rangoTexto)}</div>
              <div class="meta"><strong>Horario base lunes a viernes:</strong> 08:00 a 18:00</div>
              <div class="meta"><strong>Horario base sábado:</strong> 08:00 a 14:00</div>
              <div class="meta"><strong>Tolerancia de entrada:</strong> 10 minutos</div>
            </div>
            <div class="box">
              <div><strong>Total empleados:</strong> ${empleadosBase.length}</div>
              <div><strong>Asistencias registradas:</strong> ${totalAsistencias}</div>
              <div><strong>Entradas puntuales:</strong> <span class="ok">${totalPuntuales}</span></div>
              <div><strong>Retardos:</strong> <span class="late">${totalRetardos}</span></div>
              <div><strong>Faltas:</strong> <span class="na">${totalFaltas}</span></div>
            </div>
          </div>

          <h2>Resumen por empleado</h2>
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Asistencias</th>
                <th>Puntuales</th>
                <th>Retardos</th>
                <th>Faltas</th>
              </tr>
            </thead>
            <tbody>${resumenRows.join('')}</tbody>
          </table>

          <h2>Detalle semanal</h2>
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Día</th>
                <th>Fecha</th>
                <th>Hora de entrada</th>
                <th>Hora de salida</th>
                <th>Estado</th>
                <th>Jornada</th>
              </tr>
            </thead>
            <tbody>${detallesRows.join('')}</tbody>
          </table>

          <div class="legend">
            <span class="oktxt">Verde:</span> entrada dentro del rango de tolerancia.
            <span class="latetxt">Rojo:</span> entrada fuera del rango de tolerancia.
            <span class="natxt">Gris:</span> falta o sin marcación de entrada.
          </div>
        </body>
        </html>
      `;

      const reportWindow = window.open('', '_blank', 'width=1200,height=900');
      if (!reportWindow) {
        alert('El navegador bloqueó la ventana del reporte. Permite ventanas emergentes e inténtalo de nuevo.');
        return;
      }

      reportWindow.document.open();
      reportWindow.document.write(html);
      reportWindow.document.close();
      reportWindow.focus();
      setTimeout(() => reportWindow.print(), 300);
    } catch {
      alert('No se pudo generar el reporte semanal.');
    } finally {
      this.cargando = false;
    }
  }

  private async cargarRegistrosSemana(fechas: Date[]): Promise<Map<string, RegistroEmpleado>> {
    const registros = await Promise.all(
      fechas.map((fecha) => firstValueFrom(this.empleadoService.getRegistrosByFecha(this.toFechaKey(fecha))))
    );

    const mapa = new Map<string, RegistroEmpleado>();
    for (const grupo of registros) {
      for (const r of (grupo ?? [])) {
        const empleadoId = (r as any)?.empleadoId ?? '';
        const fechaKey = (r as any)?.fechaKey ?? '';
        if (!empleadoId || !fechaKey) continue;
        mapa.set(`${fechaKey}_${empleadoId}`, r as RegistroEmpleado);
      }
    }
    return mapa;
  }

  private getInicioSemana(baseDate: Date): Date {
    const inicio = new Date(baseDate);
    const day = inicio.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    inicio.setDate(inicio.getDate() + diff);
    inicio.setHours(0, 0, 0, 0);
    return inicio;
  }

  private getFinSemanaLaboral(inicioSemana: Date): Date {
    const fin = new Date(inicioSemana);
    fin.setDate(fin.getDate() + 5);
    fin.setHours(23, 59, 59, 999);
    return fin;
  }

  private getFechasSemanaLaboral(inicioSemana: Date): Date[] {
    return Array.from({ length: 6 }, (_, index) => {
      const fecha = new Date(inicioSemana);
      fecha.setDate(inicioSemana.getDate() + index);
      fecha.setHours(0, 0, 0, 0);
      return fecha;
    });
  }

  private getNombreDia(date: Date): string {
    return date.toLocaleDateString('es-MX', { weekday: 'long' });
  }

  private getLimiteTolerancia(baseDate: Date): Date {
    const limite = new Date(baseDate);
    limite.setHours(8, 10, 0, 0);
    return limite;
  }

  private resolveDateFromFechaKey(fechaKey: string): Date {
    const [y, m, d] = String(fechaKey || '').split('-').map((v) => Number(v));
    if (y && m && d) return new Date(y, m - 1, d);
    return new Date();
  }

  private parseIsoDate(iso?: string | null): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private formatHora24(iso?: string | null): string {
    const d = this.parseIsoDate(iso);
    if (!d) return '—';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

}
