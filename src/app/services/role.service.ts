import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, from, of } from 'rxjs';
import { switchMap, map, shareReplay } from 'rxjs/operators';

export type UserRole = 'admin' | 'employee' | null;

@Injectable({
  providedIn: 'root'
})
export class RoleService {
  private db = inject(Firestore);
  private authService = inject(AuthService);
  private injector = inject(EnvironmentInjector);

  /** Observable que emite el rol actual del usuario */
  readonly role$: Observable<UserRole> = this.authService.user$.pipe(
    switchMap((u) => {
      if (!u) return of(null);
      return from(this.getRoleByUid(u.uid));
    }),
    shareReplay(1) // Mantiene el último valor para nuevos suscriptores
  );

  async getRoleByUid(uid: string): Promise<UserRole> {
    return runInInjectionContext(this.injector, async () => {
      try {
        // SEGÚN TUS LOGS, LA COLECCIÓN CORRECTA ES 'users'
        const ref = doc(this.db, 'users', uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) return null;

        const data = snap.data() as any;
        return (data?.role === 'admin' || data?.role === 'employee') ? data.role : null;
      } catch (error) {
        console.error('Error al leer rol:', error);
        return null;
      }
    });
  }

  /** Helper para saber si es admin de forma booleana */
  isAdmin$(): Observable<boolean> {
    return this.role$.pipe(map(r => r === 'admin'));
  }
}