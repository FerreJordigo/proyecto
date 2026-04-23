import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { EmpleadoService } from '../../services/empleado.service';
import { Empleado } from '../../models/empleado.model';
import { RegistroEmpleado } from '../../models/registro_empleado.model';

type TabEmpleado = 'empleados' | 'marcaciones';
type ModalMode = 'add' | 'edit';

@Component({
  selector: 'app-empleado',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './empleado.component.html',
  styleUrl: './empleado.component.css'
})
export class EmpleadoComponent implements OnInit {
  tab: TabEmpleado = 'empleados';
  empleados: Empleado[] = [];
  registros: RegistroEmpleado[] = [];

  fecha = this.hoyFechaKey();
  empleadoIdSeleccionado = '';
  loading = false;
  errorMsg = '';

  modalOpen = false;
  modalMode: ModalMode = 'add';
  modalNombre = '';
  modalEmail = '';
  modalCodigo = '';
  modalPasswordTemp = '';
  modalRole: 'admin' | 'employee' = 'employee';
  modalEditId = '';

  constructor(private empleadoService: EmpleadoService) {}

  async ngOnInit(): Promise<void> {
    await this.cargarEmpleados();
    await this.cargarRegistros();
  }

  setTab(t: TabEmpleado): void {
    this.tab = t;
    if (t === 'marcaciones') this.cargarRegistros();
  }

  // SOLUCIONA ERROR: registrosFiltrados
  get registrosFiltrados(): RegistroEmpleado[] {
    if (!this.empleadoIdSeleccionado) return this.registros;
    return this.registros.filter(r => r.empleadoId === this.empleadoIdSeleccionado);
  }

  async onFechaChange(): Promise<void> {
    await this.cargarRegistros();
  }

  async cargarEmpleados(): Promise<void> {
    try {
      const data = await firstValueFrom(this.empleadoService.getEmpleados());
      this.empleados = [...(data ?? [])].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
    } catch (e) {
      this.errorMsg = 'Error al cargar empleados.';
    }
  }

  async cargarRegistros(): Promise<void> {
    this.loading = true;
    try {
      const data = await firstValueFrom(this.empleadoService.getRegistrosByFecha(this.fecha));
      this.registros = [...(data ?? [])];
    } finally { this.loading = false; }
  }

  openAddModal(): void {
    this.modalMode = 'add';
    this.modalNombre = '';
    this.modalEmail = '';
    this.modalCodigo = '';
    this.modalPasswordTemp = '';
    this.modalRole = 'employee';
    this.modalOpen = true;
  }

  openEditModal(e: Empleado): void {
    this.modalMode = 'edit';
    this.modalNombre = e.nombre ?? '';
    this.modalEmail = e.email ?? '';
    this.modalCodigo = e.codigoAsistencia ?? '';
    this.modalRole = e.role === 'admin' ? 'admin' : 'employee';
    this.modalEditId = e.id ?? '';
    this.modalOpen = true;
  }

  // SOLUCIONA ERROR: closeModal
  closeModal(): void {
    this.modalOpen = false;
  }

  async saveModal(): Promise<void> {
    const nombre = this.modalNombre.trim();
    const codigo = this.modalCodigo.trim();
    if (!nombre) return alert('El nombre es requerido.');

    try {
      this.loading = true;
      if (this.modalMode === 'add') {
        if (codigo) {
          const existe = await this.empleadoService.getEmpleadoByCodigo(codigo);
          if (existe) return alert('El código ya está en uso.');
        }
        await this.empleadoService.crearEmpleadoConCuenta({
          nombre, email: this.modalEmail, passwordTemporal: this.modalPasswordTemp,
          role: this.modalRole, codigoAsistencia: codigo
        });
      } else {
        await this.empleadoService.actualizarEmpleado(this.modalEditId, nombre, codigo);
      }
      this.closeModal();
      await this.cargarEmpleados();
    } catch (e: any) {
      alert(this.getMensajeErrorHumano(e));
    } finally { this.loading = false; }
  }

  async confirmDelete(e: Empleado): Promise<void> {
    if (!confirm(`¿Eliminar a ${e.nombre}?`)) return;
    await this.empleadoService.eliminarEmpleadoConRegistros(e.id!);
    await this.cargarEmpleados();
  }

  // SOLUCIONA ERROR: initials
  initials(nombre?: string): string {
    if (!nombre) return '??';
    return nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  // SOLUCIONA ERROR: formatHora
  formatHora(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }


  private getMensajeErrorHumano(error: any): string {
    const code = String(error?.code || '');
    const message = String(error?.message || '');

    if (code.includes('email-already-in-use')) return 'El correo del usuario ya está en uso.';
    if (code.includes('invalid-email')) return 'El correo electrónico no es válido.';
    if (code.includes('weak-password')) return 'La contraseña temporal es demasiado débil. Debe tener al menos 6 caracteres.';
    if (code.includes('missing-password')) return 'La contraseña temporal es obligatoria.';
    if (code.includes('network-request-failed')) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    if (message.toLowerCase().includes('email')) return 'Ocurrió un problema con el correo del usuario. Verifica que no esté repetido y que sea válido.';

    return 'Ocurrió un error al guardar el empleado. Revisa los datos e inténtalo de nuevo.';
  }

  private hoyFechaKey(): string {
    return new Date().toISOString().split('T')[0];
  }
}