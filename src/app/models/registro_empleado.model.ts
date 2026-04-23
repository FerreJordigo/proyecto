export interface RegistroEmpleado {
  id?: string;

  empleadoId: string;
  empleadoNombre: string;
  fechaKey: string; 

  entradaLaboral?: string; 
  salidaLaboral?: string;  
  inicioComida?: string;   
  finComida?: string;      

  minutosComida?: number;
  minutosTrabajados?: number;

  creadoEn?: string;      
}
