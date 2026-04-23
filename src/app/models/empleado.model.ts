export class Empleado {
  id?: string;
  nombre?: string;
  email?: string;
  role?: 'admin' | 'employee';
  codigoAsistencia?: string; // <--- PROPIEDAD AGREGADA
}