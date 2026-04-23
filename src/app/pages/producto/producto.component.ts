import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subscription } from 'rxjs';

import { ProductoService } from '../../services/producto.service';
import { RoleService } from '../../services/role.service';
import { AuditService } from '../../services/audit.service';
import { Producto } from '../../models/producto.model';

@Component({
  selector: 'app-producto',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './producto.component.html',
  styleUrls: ['./producto.component.css']
})
export class ProductoComponent implements OnInit, OnDestroy {
  private productoService = inject(ProductoService);
  private roleService = inject(RoleService);
  private auditService = inject(AuditService);
  private fb = inject(FormBuilder);

  productos: Producto[] = [];
  tablaForm: FormGroup;
  esAdmin = false;
  userRole: 'admin' | 'employee' | 'unknown' = 'unknown';
  filtroProducto = '';

  mostrarToast = false;
  mensajeToast = '';
  modalAbierto = false;

  private productosSub?: Subscription;
  private roleSub?: Subscription;
  private filaSubs: Subscription[] = [];

  nuevoProducto: any = {
    nombre: '',
    cantidad: 0,
    precio: 0,
    categoria: 'Herramientas',
    proveedor: '',
    ubicacion: 'Bodega 1'
  };

  categorias: string[] = ['Herramientas', 'Materiales de Construcción', 'Electricidad', 'Plomería', 'Pinturas', 'Ferretería General', 'Seguridad', 'Jardinería'];
  columnasEmployee: string[] = ['b1SalidaPersonal', 'b1SalidaRepartos', 'b1EntradaBodega', 'b2Entrada', 'b2Salida'];

  constructor() {
    this.tablaForm = this.fb.group({
      filas: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.roleSub = this.roleService.role$.subscribe(role => {
      this.esAdmin = role === 'admin';
      this.userRole = role ?? 'unknown';
      this.escucharProductosTiempoReal();
    });
  }

  ngOnDestroy(): void {
    this.productosSub?.unsubscribe();
    this.roleSub?.unsubscribe();
    this.limpiarSubsFilas();
  }

  escucharProductosTiempoReal() {
    this.productosSub?.unsubscribe();
    this.productosSub = this.productoService.getProductos().subscribe({
      next: (data) => {
        this.productos = data ?? [];
        this.inicializarTabla(this.productos, false);
      },
      error: () => this.lanzarToast('Error al conectar con la base de datos')
    });
  }

  cargarProductos() {
    this.lanzarToast('🔄 Sincronizando con la nube...');
    this.inicializarTabla(this.productos, true);
  }

  inicializarTabla(productos: Producto[], forzarRefresco: boolean) {
    if (!forzarRefresco && this.filas.dirty) return;

    this.limpiarSubsFilas();
    this.filas.clear();

    productos.forEach(p => {
      const fila = this.fb.group({
        id: [p.id],
        nombre: [p.nombre, Validators.required],
        b1InicialDia: [{ value: p.b1InicialDia || 0, disabled: !this.esAdmin }],
        b1CobradosNoEntregados: [{ value: p.b1CobradosNoEntregados || 0, disabled: !this.esAdmin }],
        b1SalidaPersonal: [p.b1SalidaPersonal || 0],
        b1SalidaRepartos: [p.b1SalidaRepartos || 0],
        b1EntradaBodega: [p.b1EntradaBodega || 0],
        b2Existencia: [{ value: p.b2Existencia || 0, disabled: !this.esAdmin }],
        b2Entrada: [p.b2Entrada || 0],
        b2Salida: [p.b2Salida || 0],
        inventarioFisicoFerreteria: [{ value: p.inventarioFisicoFerreteria || 0, disabled: !this.esAdmin }]
      });

      if (this.esAdmin) {
        const sub = fila.valueChanges.pipe(
          debounceTime(1500),
          distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
        ).subscribe(valores => this.autoGuardarAdmin(valores));
        this.filaSubs.push(sub);
      }

      this.filas.push(fila);
    });
  }

  async autoGuardarAdmin(datosFila: any) {
    try {
      const original = this.productos.find(p => p.id === datosFila.id);
      if (!original) return;

      const actualizado = { ...original, ...datosFila };
      await this.productoService.modificarProducto(actualizado);
      this.lanzarToast(`✓ ${datosFila.nombre} actualizado`);

      const index = this.productos.findIndex(p => p.id === datosFila.id);
      if (index > -1) this.filas.at(index).markAsPristine();
    } catch (error) {
      console.error('Error auto-guardado:', error);
    }
  }

  async guardarCambiosEmployee() {
    try {
      let cambiosRealizados = 0;

      for (let i = 0; i < this.filas.length; i++) {
        const fila = this.filas.at(i);
        if (!fila.dirty) continue;

        const original = this.productos[i];
        if (!original) continue;

        const actualizado = { ...original, ...fila.getRawValue() };
        const resumen = this.construirResumenCambios(original, actualizado);

        await this.productoService.modificarProducto(actualizado);
        await this.auditService.registrarMovimiento(
          actualizado.nombre,
          'Actualización de inventario',
          {
            antes: this.extraerCamposAuditables(original),
            despues: this.extraerCamposAuditables(actualizado)
          },
          this.userRole,
          resumen
        );

        fila.markAsPristine();
        cambiosRealizados++;
      }

      if (cambiosRealizados > 0) {
        this.tablaForm.markAsPristine();
        this.lanzarToast('✅ Cambios guardados y auditados');
      } else {
        this.lanzarToast('ℹ️ No había cambios por guardar');
      }
    } catch (error) {
      console.error(error);
      this.lanzarToast('❌ Error al guardar');
    }
  }

  esCampoEditable(nombreCampo: string): boolean {
    if (this.esAdmin) return true;
    return this.columnasEmployee.includes(nombreCampo);
  }

  moverAbajo(event: KeyboardEvent, index: number, controlName: string) {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      setTimeout(() => {
        const selector = `tr[data-index="${index + 1}"] input[formControlName="${controlName}"]`;
        const elemento = document.querySelector(selector) as HTMLInputElement | null;
        if (elemento && !elemento.disabled) elemento.focus();
      }, 50);
    }
  }

  async eliminarDesdeTabla(p: Producto) {
    if (!this.esAdmin) return;
    if (confirm(`¿Eliminar "${p.nombre}"?`)) {
      await this.productoService.eliminarProducto(p);
      await this.auditService.registrarMovimiento(p.nombre, 'Producto eliminado', { productoId: p.id }, this.userRole, ['Producto eliminado del catálogo']);
      this.lanzarToast('🗑 Producto eliminado');
    }
  }

  get filas() { return this.tablaForm.get('filas') as FormArray; }

  getSaldoB1(i: number): number {
    const v = this.filas.at(i)?.getRawValue();
    if (!v) return 0;
    return (Number(v.b1InicialDia || 0) + Number(v.b1EntradaBodega || 0)) -
           (Number(v.b1SalidaPersonal || 0) + Number(v.b1SalidaRepartos || 0));
  }

  getSaldoB2(i: number): number {
    const v = this.filas.at(i)?.getRawValue();
    if (!v) return 0;
    return (Number(v.b2Existencia || 0) + Number(v.b2Entrada || 0)) - Number(v.b2Salida || 0);
  }

  getSaldoTotal(i: number): number {
    return this.getSaldoB1(i) + this.getSaldoB2(i);
  }



  trackByFila(_index: number, item: { index: number; control: FormGroup; producto: Producto }): string | number {
    return item.producto?.id ?? item.index;
  }
  get filasFiltradas(): Array<{ index: number; control: FormGroup; producto: Producto }> {
    const termino = this.filtroProducto.trim().toLowerCase();

    return this.productos
      .map((producto, index) => ({
        index,
        producto,
        control: this.filas.at(index) as FormGroup
      }))
      .filter(({ producto }) => {
        if (!termino) return true;
        const nombre = String(producto.nombre ?? '').toLowerCase();
        const categoria = String((producto as any).categoria ?? '').toLowerCase();
        const proveedor = String((producto as any).proveedor ?? '').toLowerCase();
        return nombre.includes(termino) || categoria.includes(termino) || proveedor.includes(termino);
      });
  }

  abrirModalNuevoProducto() { this.modalAbierto = true; }
  cerrarModal() { this.modalAbierto = false; }

  async guardarNuevoProducto() {
    if (!this.nuevoProducto.nombre) return;
    const prod: Producto = {
      ...this.nuevoProducto,
      id: Date.now().toString(),
      b1InicialDia: this.nuevoProducto.cantidad,
      fechaRegistro: new Date()
    };
    await this.productoService.agregarProducto(prod);
    await this.auditService.registrarMovimiento(prod.nombre, 'Producto agregado', { cantidadInicial: prod.b1InicialDia ?? 0 }, this.userRole, [`Cantidad inicial: ${prod.b1InicialDia ?? 0}`]);
    this.cerrarModal();
    this.lanzarToast('✅ Producto añadido');
  }

  lanzarToast(mensaje: string) {
    this.mensajeToast = mensaje;
    this.mostrarToast = true;
    setTimeout(() => this.mostrarToast = false, 3000);
  }

  private limpiarSubsFilas() {
    this.filaSubs.forEach(sub => sub.unsubscribe());
    this.filaSubs = [];
  }

  private extraerCamposAuditables(producto: Producto) {
    return {
      b1SalidaPersonal: Number(producto.b1SalidaPersonal || 0),
      b1SalidaRepartos: Number(producto.b1SalidaRepartos || 0),
      b1EntradaBodega: Number(producto.b1EntradaBodega || 0),
      b2Entrada: Number(producto.b2Entrada || 0),
      b2Salida: Number(producto.b2Salida || 0)
    };
  }

  private construirResumenCambios(original: Producto, actualizado: Producto): string[] {
    const resumen: string[] = [];
    const etiquetas: Record<string, string> = {
      b1SalidaPersonal: 'Salida personal',
      b1SalidaRepartos: 'Salida repartos',
      b1EntradaBodega: 'Entrada B1',
      b2Entrada: 'Entrada B2',
      b2Salida: 'Salida B2'
    };

    Object.keys(etiquetas).forEach((key) => {
      const antes = Number((original as any)[key] || 0);
      const despues = Number((actualizado as any)[key] || 0);
      if (antes !== despues) {
        resumen.push(`${etiquetas[key]}: ${antes} → ${despues}`);
      }
    });

    return resumen.length ? resumen : ['Sin cambios detectables'];
  }
}
