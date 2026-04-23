import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { take } from 'rxjs/operators';

import { AuthService } from '../../services/auth.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css']
})
export class MenuComponent implements OnInit {
  private authService = inject(AuthService);
  private roleService = inject(RoleService);
  private router = inject(Router);

  showLogoutModal = false;
  cerrando = false;

  role: 'admin' | 'employee' | null = null;

  ngOnInit(): void {
    this.roleService.role$.pipe(take(1)).subscribe(async (r) => {
      this.role = r;

      if (!r) {
        await this.router.navigateByUrl('/');
        return;
      }

      const url = this.router.url;
      if (r === 'admin' && (url === '/menu' || url === '/menu/')) {
        await this.router.navigateByUrl('/menu/home');
      }

      if (r === 'employee' && (url.includes('/menu/home') || url.includes('/menu/empleado') || url.includes('/menu/asistencia'))) {
        await this.router.navigateByUrl('/menu/producto');
      }
    });
  }

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  // --- LÓGICA DE CIERRE DE SESIÓN ---
  abrirModalSalir(): void {
    this.showLogoutModal = true;
  }

  cancelarSalir(): void {
    if (this.cerrando) return;
    this.showLogoutModal = false;
  }

  confirmarSalir(): void {
    if (this.cerrando) return;
    this.cerrando = true;

    this.authService.logout().subscribe({
      next: () => this.finalizarCierreSesion(),
      error: () => this.finalizarCierreSesion() 
    });
  }

  private finalizarCierreSesion(): void {
    // Limpieza de persistencia local
    localStorage.clear();
    sessionStorage.clear();

    this.cerrando = false;
    this.showLogoutModal = false;

    // Redirección total reemplazando el historial para que no puedan volver atrás
    this.router.navigateByUrl('/', { replaceUrl: true });
  }
}