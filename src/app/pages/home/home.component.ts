import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { ProductoService } from '../../services/producto.service';
import { AuditLog, AuditService } from '../../services/audit.service';
import { Producto } from '../../models/producto.model';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  private productoService = inject(ProductoService);
  private auditService = inject(AuditService);
  private authService = inject(AuthService);

  productos: Producto[] = [];
  movimientos: AuditLog[] = [];
  ultimoCorte: any = null;

  cargandoProductos = true;
  cargandoMovimientos = true;
  cargandoUltimoCorte = true;
  realizandoCorte = false;
  restaurandoCorte = false;

  private subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.productoService.getProductos().subscribe({
        next: (data) => {
          this.productos = data ?? [];
          this.cargandoProductos = false;
        },
        error: () => {
          this.productos = [];
          this.cargandoProductos = false;
        }
      })
    );

    this.subs.add(
      this.auditService.getRecentLogs(30).subscribe({
        next: (data) => {
          this.movimientos = data ?? [];
          this.cargandoMovimientos = false;
        },
        error: () => {
          this.movimientos = [];
          this.cargandoMovimientos = false;
        }
      })
    );

    this.cargarUltimoCorte();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  async cargarUltimoCorte(): Promise<void> {
    this.cargandoUltimoCorte = true;
    try {
      this.ultimoCorte = await this.productoService.getUltimoCorte();
    } catch {
      this.ultimoCorte = null;
    } finally {
      this.cargandoUltimoCorte = false;
    }
  }

  get totalProductos(): number {
    return this.productos.length;
  }

  get productosCriticos(): number {
    return this.productosCriticosLista.length;
  }

  get productosCriticosLista(): Producto[] {
    return this.productos.filter((p) => !!p?.nombre && this.getSaldoTotalProducto(p) <= 10);
  }

  get movimientosHoy(): number {
    const hoy = new Date();
    return this.movimientos.filter((m) => {
      const d = this.toDate(m.fecha);
      return !!d &&
        d.getFullYear() === hoy.getFullYear() &&
        d.getMonth() === hoy.getMonth() &&
        d.getDate() === hoy.getDate();
    }).length;
  }

  getSaldoTotalProducto(p: Producto): number {
    const saldoB1 = (Number(p.b1InicialDia || 0) + Number(p.b1EntradaBodega || 0))
      - (Number(p.b1SalidaPersonal || 0) + Number(p.b1SalidaRepartos || 0));
    const saldoB2 = (Number(p.b2Existencia || 0) + Number(p.b2Entrada || 0)) - Number(p.b2Salida || 0);
    return saldoB1 + saldoB2;
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  formatFecha(value: any): string {
    const date = this.toDate(value);
    if (!date) return 'Sin fecha';
    return date.toLocaleString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getResumen(log: AuditLog): string[] {
    if (Array.isArray(log.resumen) && log.resumen.length) return log.resumen;

    const d = log.detalles ?? {};
    const resumen: string[] = [];

    if (d.b1SalidaPersonal) resumen.push(`Salida personal: ${d.b1SalidaPersonal}`);
    if (d.b1SalidaRepartos) resumen.push(`Salida repartos: ${d.b1SalidaRepartos}`);
    if (d.b1EntradaBodega) resumen.push(`Entrada B1: ${d.b1EntradaBodega}`);
    if (d.b2Entrada) resumen.push(`Entrada B2: ${d.b2Entrada}`);
    if (d.b2Salida) resumen.push(`Salida B2: ${d.b2Salida}`);

    return resumen.length ? resumen : ['Sin detalle resumido'];
  }

  getNombreUsuario(log: AuditLog): string {
    return String(log.usuarioNombre || '').trim() || 'Usuario desconocido';
  }


  async restaurarUltimoCorte(): Promise<void> {
    if (this.restaurandoCorte) return;
    if (!this.ultimoCorte) {
      alert('No hay un corte previo para restaurar.');
      return;
    }

    const confirmado = confirm(
      `Se restaurará el corte ${this.ultimoCorte.fechaCorte || this.ultimoCorte.id}. Los productos volverán a sus valores anteriores al cierre. ¿Deseas continuar?`
    );
    if (!confirmado) return;

    try {
      this.restaurandoCorte = true;
      const user = this.authService.currentUser;
      const resultado = await this.productoService.restaurarUltimoCorte({
        uid: user?.uid ?? null,
        nombre: user?.displayName ?? null,
        email: user?.email ?? null
      });

      await this.auditService.registrarMovimiento(
        'Restaurar corte',
        'Restauración de corte diario',
        {
          fechaCorte: resultado.fechaCorte,
          totalProductos: resultado.totalProductos
        },
        'admin',
        [
          `Corte restaurado: ${resultado.fechaCorte}`,
          `Productos restaurados: ${resultado.totalProductos}`
        ]
      );

      await this.cargarUltimoCorte();
      alert(`Corte restaurado correctamente. Productos restaurados: ${resultado.totalProductos}.`);
    } catch (error: any) {
      alert(error?.message || 'No se pudo restaurar el último corte.');
    } finally {
      this.restaurandoCorte = false;
    }
  }

  async realizarCorteDiario(): Promise<void> {
    if (this.realizandoCorte) return;

    const confirmado = confirm(
      'Se realizará el corte diario. Los movimientos operativos del día se reiniciarán a cero y el saldo final pasará a ser la nueva base. ¿Deseas continuar?'
    );
    if (!confirmado) return;

    try {
      this.realizandoCorte = true;

      const user = this.authService.currentUser;
      const resultado = await this.productoService.realizarCorteDiario({
        uid: user?.uid ?? null,
        nombre: user?.displayName ?? null,
        email: user?.email ?? null
      });

      await this.auditService.registrarMovimiento(
        'Corte diario',
        'Corte diario ejecutado',
        {
          fechaCorte: resultado.fechaCorte,
          totalProductos: resultado.totalProductos
        },
        'admin',
        [
          `Fecha de corte: ${resultado.fechaCorte}`,
          `Productos procesados: ${resultado.totalProductos}`
        ]
      );

      await this.cargarUltimoCorte();
      alert(`Corte diario realizado correctamente. Productos procesados: ${resultado.totalProductos}.`);
    } catch (error: any) {
      alert(error?.message || 'No se pudo realizar el corte diario.');
    } finally {
      this.realizandoCorte = false;
    }
  }
}
