import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  collectionData,
  limit,
  orderBy,
  query,
  doc,
  getDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';

export interface AuditLog {
  id?: string;
  fecha?: any;
  usuarioEmail?: string;
  usuarioNombre?: string;
  usuarioUid?: string;
  usuarioRole?: 'admin' | 'employee' | 'unknown';
  producto?: string;
  accion?: string;
  detalles?: any;
  resumen?: string[];
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  async registrarMovimiento(
    productoNombre: string,
    accion: string,
    detalles: any,
    usuarioRole: 'admin' | 'employee' | 'unknown' = 'unknown',
    resumen: string[] = []
  ) {
    const user = this.auth.currentUser;
    const logRef = collection(this.firestore, 'auditoria');

    let usuarioNombre = user?.displayName || '';
    if (user?.uid) {
      try {
        const userSnap = await getDoc(doc(this.firestore, 'users', user.uid));
        if (userSnap.exists()) {
          usuarioNombre = String((userSnap.data() as any)?.nombre || usuarioNombre || '').trim();
        }
      } catch {
        // Ignorar fallo de lectura auxiliar de nombre.
      }
    }

    return addDoc(logRef, {
      fecha: serverTimestamp(),
      usuarioEmail: user?.email || 'Desconocido',
      usuarioNombre: usuarioNombre || user?.email || 'Usuario desconocido',
      usuarioUid: user?.uid || 'N/A',
      usuarioRole,
      producto: productoNombre,
      accion,
      detalles,
      resumen
    });
  }

  getRecentLogs(maxResults: number = 25): Observable<AuditLog[]> {
    const logRef = collection(this.firestore, 'auditoria');
    const q = query(logRef, orderBy('fecha', 'desc'), limit(maxResults));
    return collectionData(q, { idField: 'id' }) as Observable<AuditLog[]>;
  }
}
