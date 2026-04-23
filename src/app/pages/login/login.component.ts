import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';

import { AuthService } from '../../services/auth.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  error = false;

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private roleService = inject(RoleService);
  private router = inject(Router);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    // Si ya está autenticado, redirige según rol
    this.authService.user$.pipe(take(1)).subscribe(async (u) => {
      if (!u) return;
      const role = await this.roleService.getRoleByUid(u.uid);
      await this.redirectByRole(role);
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error = false;
    const { email, password } = this.form.getRawValue();

    this.authService.login(email.trim().toLowerCase(), password).subscribe({
      next: async (cred) => {
        localStorage.setItem('uid', cred.user.uid);
        const role = await this.roleService.getRoleByUid(cred.user.uid);
        await this.redirectByRole(role);
      },
      error: (error) => {
        this.error = true;
        localStorage.removeItem('uid');
        console.error('Error al iniciar sesión', error);
      }
    });
  }

  private async redirectByRole(role: 'admin' | 'employee' | null): Promise<void> {
    // Si no existe perfil en /users/{uid}, bloquea acceso (cuenta no habilitada)
    if (!role) {
      this.error = true;
      this.authService.logout().subscribe({ next: () => {}, error: () => {} });
      localStorage.removeItem('uid');
      alert('Tu cuenta no está habilitada. Pide al administrador que te dé de alta.');
      return;
    }

    if (role === 'admin') {
      await this.router.navigateByUrl('/menu/home');
    } else {
      await this.router.navigateByUrl('/menu/producto');
    }
  }
}