import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { take } from 'rxjs/operators';
import QRCode from 'qrcode';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './perfil.component.html',
  styleUrls: ['./perfil.component.css']
})
export class PerfilComponent implements OnInit {
  private authService = inject(AuthService);
  private db = inject(Firestore);

  cargando = true;
  errorMsg = '';
  uid = '';
  nombre = '';
  email = '';
  role: string | null = null;
  codigoAsistencia = ''; // <--- NUEVO
  qrDataUrl = '';

  ngOnInit(): void {
    this.authService.user$.pipe(take(1)).subscribe(async (u) => {
      if (!u) {
        this.errorMsg = 'No hay sesión activa.';
        this.cargando = false;
        return;
      }
      try {
        this.uid = u.uid;
        const snap = await getDoc(doc(this.db, 'users', u.uid));
        if (snap.exists()) {
          const data = snap.data();
          this.nombre = data['nombre'] ?? '';
          this.email = data['email'] ?? '';
          this.role = data['role'] ?? null;
          this.codigoAsistencia = data['codigoAsistencia'] ?? 'No asignado';
        }

        // Generamos el QR usando el UID para que el escáner siga funcionando igual
        this.qrDataUrl = await QRCode.toDataURL(this.uid, { margin: 2, scale: 8 });
      } catch (e: any) {
        this.errorMsg = 'Error al cargar perfil.';
      } finally {
        this.cargando = false;
      }
    });
  }
}