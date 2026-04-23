import { Routes } from '@angular/router';
import { MenuComponent } from './pages/menu/menu.component';
import { ProductoComponent } from './pages/producto/producto.component';
import { EmpleadoComponent } from './pages/empleado/empleado.component';
import { authGuard } from './auth.guard';
import { adminGuard } from './admin.guard';

export const routes: Routes = [
  // ✅ PRINCIPAL: Login (solo iniciar sesión)
  { path: '', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },

  {
    path: 'menu',
    component: MenuComponent,
    canActivate: [authGuard],
    children: [
      // MenuComponent redirige según rol (admin->home, empleado->producto)
      { path: '', pathMatch: 'full', redirectTo: 'producto' },

      // Admin
      { path: 'home', canActivate: [adminGuard], loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },

      // Admin + Empleado
      { path: 'producto', component: ProductoComponent },

      // Admin (marcaciones por QR)
      { path: 'asistencia', canActivate: [adminGuard], loadComponent: () => import('./pages/asistencia/asistencia.component').then(m => m.AsistenciaComponent) },

      // Admin + Empleado (perfil + QR)
      { path: 'perfil', loadComponent: () => import('./pages/perfil/perfil.component').then(m => m.PerfilComponent) },

      // Admin
      { path: 'empleado', canActivate: [adminGuard], component: EmpleadoComponent },
    ]
  },

  { path: '**', redirectTo: '' }
];
