export interface Producto {
  id?: string;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  cantidad?: number;
  unidad?: string;
  precio?: number;
  proveedor?: string;
  ubicacion?: string;  // ← Ahora sí existe
  stockMinimo?: number;
  stockMaximo?: number;
  activo?: boolean;
  fechaRegistro?: Date;
  ultimaActualizacion?: Date;
  
  // Campos específicos para la tabla de inventario
  b1InicialDia?: number;
  b1CobradosNoEntregados?: number;
  b1SalidaPersonal?: number;
  b1SalidaRepartos?: number;
  b1EntradaBodega?: number;
  b2Existencia?: number;
  b2Entrada?: number;
  b2Salida?: number;
  inventarioFisicoFerreteria?: number;
}