import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
  writeBatch,
  setDoc
} from '@angular/fire/firestore';
import { first, map } from 'rxjs';

import { Empleado } from '../models/empleado.model';
import { RegistroEmpleado } from '../models/registro_empleado.model';

import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EmpleadoService {
  private db = inject(Firestore);
  private injector = inject(Injector);

  private readonly empleadosCol = 'empleado';
  private readonly usersCol = 'users';
  private readonly registroCol = 'registroempleado';

  // ===== NUEVO: BUSCAR POR CÓDIGO CORTO =====
  async getEmpleadoByCodigo(codigo: string) {
    const q = query(collection(this.db, this.usersCol), where('codigoAsistencia', '==', codigo.trim()));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as any;
  }

  // ===== EMPLEADOS =====
  getEmpleados() {
    return runInInjectionContext(this.injector, () => {
      const colRef = collection(this.db, this.empleadosCol);
      return collectionData(colRef, { idField: 'id' }).pipe(
        map((data: any[]) =>
          data.map(d => ({
            id: d.id,
            nombre: d.nombre ?? '',
            email: d.email ?? '',
            codigoAsistencia: d.codigoAsistencia ?? '',
            role: (d.role === 'admin' || d.role === 'employee') ? d.role : 'employee'
          } as Empleado))
        ),
        first()
      );
    });
  }

  async crearEmpleadoConCuenta(payload: { nombre: string; email: string; passwordTemporal: string; role: 'admin' | 'employee'; codigoAsistencia?: string }) {
    const nombre = payload.nombre.trim();
    const email = payload.email.trim().toLowerCase();
    const codigo = (payload.codigoAsistencia ?? '').trim();

    const secondaryName = 'secondary-auth';
    const already = getApps().find(a => a.name === secondaryName);
    const secondaryApp = already ?? initializeApp(environment.firebaseConfig, secondaryName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, payload.passwordTemporal);
      const uid = cred.user.uid;

      await sendPasswordResetEmail(secondaryAuth, email);
      await signOut(secondaryAuth);

      const userData = {
        email,
        role: payload.role,
        nombre,
        ...(codigo ? { codigoAsistencia: codigo } : {}),
        active: true,
        createdAt: new Date().toISOString()
      };

      // Guardar en /users/{uid} y /empleado/{uid}
      await setDoc(doc(this.db, this.usersCol, uid), userData);
      await setDoc(doc(this.db, this.empleadosCol, uid), userData);

      return { uid };
    } finally {
      if (!already) {
        try { await deleteApp(secondaryApp); } catch {}
      }
    }
  }

  async actualizarEmpleado(id: string, nombre: string, codigo?: string) {
    const codigoLimpio = (codigo ?? '').trim();
    const data = { 
      nombre: nombre.trim(),
      ...(codigoLimpio ? { codigoAsistencia: codigoLimpio } : {})
    };
    // Actualizamos en ambas colecciones para mantener consistencia
    await updateDoc(doc(this.db, this.empleadosCol, id), data);
    return updateDoc(doc(this.db, this.usersCol, id), data);
  }

  async eliminarEmpleadoConRegistros(empleadoId: string): Promise<void> {
    const batch = writeBatch(this.db);
    
    // Eliminar de empleado y users
    batch.delete(doc(this.db, this.empleadosCol, empleadoId));
    batch.delete(doc(this.db, this.usersCol, empleadoId));

    // Eliminar registros de asistencia
    const qRef = query(collection(this.db, this.registroCol), where('empleadoId', '==', empleadoId));
    const snap = await getDocs(qRef);
    snap.forEach(d => batch.delete(d.ref));

    await batch.commit();
  }

  getRegistrosByFecha(fechaKey: string) {
    return runInInjectionContext(this.injector, () => {
      const qRef = query(collection(this.db, this.registroCol), where('fechaKey', '==', fechaKey));
      return collectionData(qRef, { idField: 'id' }).pipe(
        map((data: any[]) => data.map(d => d as RegistroEmpleado)),
        first()
      );
    });
  }

  async upsertRegistroById(id: string, data: Partial<RegistroEmpleado>) {
    const ref = doc(this.db, this.registroCol, id);
    return setDoc(ref, data, { merge: true });
  }
}