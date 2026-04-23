import { Injectable, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  User,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  UserCredential,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from '@angular/fire/auth';

import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, shareReplay, tap, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private ngZone = inject(NgZone);
  private injector = inject(Injector);

  private authState = new BehaviorSubject<User | null>(null);

  // Streams públicos
  user$!: Observable<User | null>;
  isAuthenticated$!: Observable<boolean>;

  private initialized = false;

  constructor() {}

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Ejecutamos Firebase APIs dentro del contexto de Angular
    runInInjectionContext(this.injector, () => {
      setPersistence(this.auth, browserSessionPersistence)
        .catch(err => console.error('Error setPersistence:', err));

      this.user$ = new Observable<User | null>((subscriber) => {
        const unsubscribe = onAuthStateChanged(
          this.auth,
          (u) => {
            this.ngZone.run(() => {
              this.authState.next(u);
              console.log('User state changed:', u?.email); // Modificado para no mostrar todo el objeto
              subscriber.next(u);
            });
          },
          (error) => {
            this.ngZone.run(() => subscriber.error(error));
          }
        );
        return () => unsubscribe();
      }).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.isAuthenticated$ = this.user$.pipe(map(u => !!u));
    });
  }

  login(email: string, password: string): Observable<UserCredential> {
    return from(signInWithEmailAndPassword(this.auth, email, password));
  }

  register(email: string, password: string): Observable<UserCredential> {
    return from(createUserWithEmailAndPassword(this.auth, email, password));
  }

  logout(): Observable<void> {
    return from(signOut(this.auth)).pipe(
      tap(() => {
        this.authState.next(null);
      }),
      catchError(err => {
        console.error('Error en AuthService.logout:', err);
        this.authState.next(null);
        return of(void 0);
      })
    );
  }

  get currentUser(): User | null {
    return this.authState.value;
  }

  get currentUserId(): string | null {
    return this.currentUser?.uid ?? null;
  }

  get currentUserEmail(): string | null {
    return this.currentUser?.email ?? null;
  }
}