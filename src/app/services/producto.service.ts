import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Producto } from '../models/producto.model';
import {
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  Firestore,
  updateDoc,
  increment,
  writeBatch,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit
} from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
  private db: Firestore = inject(Firestore);
  private injector = inject(Injector);

  private readonly collectionName = 'producto';

  getProductos(): Observable<Producto[]> {
    return runInInjectionContext(this.injector, () => {
      const colRef = collection(this.db, this.collectionName);

      return collectionData(colRef, { idField: 'id' }).pipe(
        map((data: any[]) =>
          data.map((d) => ({
            id: d.id,
            nombre: d.nombre ?? '',
            descripcion: d.descripcion ?? '',
            categoria: d.categoria ?? '',
            cantidad: d.cantidad ?? d.stock ?? 0,
            unidad: d.unidad ?? '',
            proveedor: d.proveedor ?? '',

            b1InicialDia: d.b1InicialDia ?? (d.cantidad ?? d.stock ?? 0),
            b1CobradosNoEntregados: d.b1CobradosNoEntregados ?? 0,
            b1SalidaPersonal: d.b1SalidaPersonal ?? 0,
            b1SalidaRepartos: d.b1SalidaRepartos ?? 0,
            b1EntradaBodega: d.b1EntradaBodega ?? 0,

            b2Existencia: d.b2Existencia ?? 0,
            b2Entrada: d.b2Entrada ?? 0,
            b2Salida: d.b2Salida ?? 0,

            inventarioFisicoFerreteria: d.inventarioFisicoFerreteria ?? 0,
          }) as Producto)
        )
      );
    });
  }

  async agregarProducto(producto: Producto) {
    const colRef = collection(this.db, this.collectionName);

    const data = {
      nombre: producto.nombre ?? '',
      descripcion: producto.descripcion ?? '',
      categoria: producto.categoria ?? '',
      cantidad: producto.cantidad ?? 0,
      unidad: producto.unidad ?? '',
      proveedor: producto.proveedor ?? '',

      b1InicialDia: producto.b1InicialDia ?? (producto.cantidad ?? 0),
      b1CobradosNoEntregados: producto.b1CobradosNoEntregados ?? 0,
      b1SalidaPersonal: producto.b1SalidaPersonal ?? 0,
      b1SalidaRepartos: producto.b1SalidaRepartos ?? 0,
      b1EntradaBodega: producto.b1EntradaBodega ?? 0,

      b2Existencia: producto.b2Existencia ?? 0,
      b2Entrada: producto.b2Entrada ?? 0,
      b2Salida: producto.b2Salida ?? 0,

      inventarioFisicoFerreteria: producto.inventarioFisicoFerreteria ?? 0,
    };

    const docRef = await addDoc(colRef, data);
    return { id: docRef.id, ...data };
  }

  async modificarProducto(producto: Producto) {
    const id = producto.id ?? '';
    if (!id) throw new Error('El producto no tiene un ID válido');

    const docRef = doc(this.db, this.collectionName, id);

    return updateDoc(docRef, {
      nombre: producto.nombre ?? '',
      descripcion: producto.descripcion ?? '',
      categoria: producto.categoria ?? '',
      cantidad: producto.cantidad ?? 0,
      unidad: producto.unidad ?? '',
      proveedor: producto.proveedor ?? '',

      b1InicialDia: producto.b1InicialDia ?? (producto.cantidad ?? 0),
      b1CobradosNoEntregados: producto.b1CobradosNoEntregados ?? 0,
      b1SalidaPersonal: producto.b1SalidaPersonal ?? 0,
      b1SalidaRepartos: producto.b1SalidaRepartos ?? 0,
      b1EntradaBodega: producto.b1EntradaBodega ?? 0,

      b2Existencia: producto.b2Existencia ?? 0,
      b2Entrada: producto.b2Entrada ?? 0,
      b2Salida: producto.b2Salida ?? 0,

      inventarioFisicoFerreteria: producto.inventarioFisicoFerreteria ?? 0,
    });
  }

  async eliminarProducto(producto: Producto) {
    const id = producto.id ?? '';
    if (!id) throw new Error('El producto no tiene un ID válido');

    const docRef = doc(this.db, this.collectionName, id);
    return deleteDoc(docRef);
  }

  actualizarCantidad(productoId: string, cantidad: number) {
    const docRef = doc(this.db, this.collectionName, productoId);
    return updateDoc(docRef, { cantidad: increment(-cantidad) });
  }

  agregarCantidad(productoId: string, cantidad: number) {
    const docRef = doc(this.db, this.collectionName, productoId);
    return updateDoc(docRef, { cantidad: increment(cantidad) });
  }

  async realizarCorteDiario(meta: { uid?: string | null; nombre?: string | null; email?: string | null }) {
    const fechaCorteId = new Date().toISOString().split('T')[0];
    const corteRef = doc(this.db, 'cierres_diarios', fechaCorteId);
    const corteExistente = await getDoc(corteRef);

    if (corteExistente.exists()) {
      throw new Error('Ya existe un corte diario registrado para hoy.');
    }

    const productosSnap = await getDocs(collection(this.db, this.collectionName));
    const productos = productosSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Producto[];

    const batch = writeBatch(this.db);

    batch.set(corteRef, {
      fechaCorte: fechaCorteId,
      createdAt: serverTimestamp(),
      createdByUid: meta.uid || null,
      createdByNombre: meta.nombre || meta.email || 'Administrador',
      createdByEmail: meta.email || null,
      totalProductos: productos.length
    });

    for (const producto of productos) {
      const saldoB1 = (Number(producto.b1InicialDia || 0) + Number(producto.b1EntradaBodega || 0))
        - (Number(producto.b1SalidaPersonal || 0) + Number(producto.b1SalidaRepartos || 0));
      const saldoB2 = (Number(producto.b2Existencia || 0) + Number(producto.b2Entrada || 0)) - Number(producto.b2Salida || 0);

      const snapshotRef = doc(this.db, `cierres_diarios/${fechaCorteId}/productos/${producto.id}`);
      batch.set(snapshotRef, {
        productoId: producto.id,
        nombre: producto.nombre || '',
        categoria: producto.categoria || '',
        proveedor: producto.proveedor || '',
        antes: {
          b1InicialDia: Number(producto.b1InicialDia || 0),
          b1CobradosNoEntregados: Number(producto.b1CobradosNoEntregados || 0),
          b1SalidaPersonal: Number(producto.b1SalidaPersonal || 0),
          b1SalidaRepartos: Number(producto.b1SalidaRepartos || 0),
          b1EntradaBodega: Number(producto.b1EntradaBodega || 0),
          b2Existencia: Number(producto.b2Existencia || 0),
          b2Entrada: Number(producto.b2Entrada || 0),
          b2Salida: Number(producto.b2Salida || 0),
          inventarioFisicoFerreteria: Number(producto.inventarioFisicoFerreteria || 0)
        },
        despues: {
          b1InicialDia: saldoB1,
          b2Existencia: saldoB2,
          b1CobradosNoEntregados: 0,
          b1SalidaPersonal: 0,
          b1SalidaRepartos: 0,
          b1EntradaBodega: 0,
          b2Entrada: 0,
          b2Salida: 0,
          inventarioFisicoFerreteria: Number(producto.inventarioFisicoFerreteria || 0)
        },
        saldoB1,
        saldoB2,
        saldoTotal: saldoB1 + saldoB2,
        createdAt: serverTimestamp()
      });

      batch.update(doc(this.db, this.collectionName, String(producto.id)), {
        b1InicialDia: saldoB1,
        b2Existencia: saldoB2,
        b1CobradosNoEntregados: 0,
        b1SalidaPersonal: 0,
        b1SalidaRepartos: 0,
        b1EntradaBodega: 0,
        b2Entrada: 0,
        b2Salida: 0
      });
    }

    await batch.commit();

    return {
      fechaCorte: fechaCorteId,
      totalProductos: productos.length,
      createdByNombre: meta.nombre || meta.email || 'Administrador'
    };
  }

  async getUltimoCorte(): Promise<any | null> {
    const ref = collection(this.db, 'cierres_diarios');
    const q = query(ref, orderBy('fechaCorte', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...(snap.docs[0].data() as any) };
  }

  async restaurarUltimoCorte(meta: { uid?: string | null; nombre?: string | null; email?: string | null }) {
    const ultimoCorte = await this.getUltimoCorte();
    if (!ultimoCorte?.id) {
      throw new Error('No hay un corte previo para restaurar.');
    }

    const snapshotsRef = collection(this.db, `cierres_diarios/${ultimoCorte.id}/productos`);
    const snapshotsSnap = await getDocs(snapshotsRef);
    if (snapshotsSnap.empty) {
      throw new Error('El corte no tiene detalle suficiente para restaurarse.');
    }

    const batch = writeBatch(this.db);
    const productosRestaurados: string[] = [];

    for (const snapshotDoc of snapshotsSnap.docs) {
      const data: any = snapshotDoc.data() || {};
      const productoId = String(data.productoId || snapshotDoc.id);
      const antes = data.antes || {};

      batch.update(doc(this.db, this.collectionName, productoId), {
        b1InicialDia: Number(antes.b1InicialDia || 0),
        b1CobradosNoEntregados: Number(antes.b1CobradosNoEntregados || 0),
        b1SalidaPersonal: Number(antes.b1SalidaPersonal || 0),
        b1SalidaRepartos: Number(antes.b1SalidaRepartos || 0),
        b1EntradaBodega: Number(antes.b1EntradaBodega || 0),
        b2Existencia: Number(antes.b2Existencia || 0),
        b2Entrada: Number(antes.b2Entrada || 0),
        b2Salida: Number(antes.b2Salida || 0),
        inventarioFisicoFerreteria: Number(antes.inventarioFisicoFerreteria || 0)
      });

      productosRestaurados.push(String(data.nombre || productoId));
      batch.delete(snapshotDoc.ref);
    }

    batch.delete(doc(this.db, 'cierres_diarios', ultimoCorte.id));
    await batch.commit();

    return {
      fechaCorte: ultimoCorte.id,
      totalProductos: snapshotsSnap.size,
      restoredByNombre: meta.nombre || meta.email || 'Administrador',
      productosRestaurados
    };
  }
}
