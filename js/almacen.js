/* ══════════════════════════════════════════════════════════════════════════
   almacen.js — Guardado local en IndexedDB. Nada sale de este navegador.

   reportes : un registro por Excel importado
   filas    : las casas de cada reporte
   ajustes  : cuál reporte está activo
   ══════════════════════════════════════════════════════════════════════════ */

const Almacen = (() => {
  /* La app se llama Reportes, pero la base sigue llamándose «bitacora», que era
     el nombre anterior. Cambiarlo dejaría los reportes ya importados en una base
     huérfana, así que se deja como está: el nombre no se ve en ningún lado. */
  const NOMBRE_BD = 'bitacora';
  const VERSION = 1;
  let bd = null;

  function abrir() {
    if (bd) return Promise.resolve(bd);
    return new Promise((resolve, reject) => {
      const solicitud = indexedDB.open(NOMBRE_BD, VERSION);
      solicitud.onupgradeneeded = evento => {
        const db = evento.target.result;
        if (!db.objectStoreNames.contains('reportes')) {
          db.createObjectStore('reportes', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('filas')) {
          const filas = db.createObjectStore('filas', { keyPath: 'id', autoIncrement: true });
          filas.createIndex('reporteId', 'reporteId', { unique: false });
          filas.createIndex('casaNorm', 'casaNorm', { unique: false });
        }
        if (!db.objectStoreNames.contains('ajustes')) {
          db.createObjectStore('ajustes', { keyPath: 'clave' });
        }
      };
      solicitud.onsuccess = () => { bd = solicitud.result; resolve(bd); };
      solicitud.onerror = () => reject(solicitud.error);
    });
  }

  function transaccion(almacenes, modo) {
    return abrir().then(db => db.transaction(almacenes, modo));
  }

  function comoPromesa(solicitud) {
    return new Promise((resolve, reject) => {
      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
    });
  }

  /* ── Ajustes ──────────────────────────────────────────────────────────── */
  function leerAjuste(clave, porDefecto) {
    return transaccion(['ajustes'], 'readonly')
      .then(tx => comoPromesa(tx.objectStore('ajustes').get(clave)))
      .then(fila => (fila === undefined ? porDefecto : fila.valor));
  }

  function guardarAjuste(clave, valor) {
    return transaccion(['ajustes'], 'readwrite').then(tx => {
      tx.objectStore('ajustes').put({ clave, valor });
      return finTransaccion(tx);
    });
  }

  function finTransaccion(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /* ── Reportes ─────────────────────────────────────────────────────────── */

  /* Guarda un reporte con sus filas y lo deja como reporte activo. */
  function guardarReporte(reporte, filas) {
    return transaccion(['reportes', 'filas', 'ajustes'], 'readwrite').then(tx => {
      const almacenReportes = tx.objectStore('reportes');
      const almacenFilas = tx.objectStore('filas');
      return comoPromesa(almacenReportes.add(reporte)).then(id => {
        filas.forEach(fila => almacenFilas.add(Object.assign({}, fila, { reporteId: id })));
        tx.objectStore('ajustes').put({ clave: 'reporteActivo', valor: id });
        return finTransaccion(tx).then(() => id);
      });
    });
  }

  function listarReportes() {
    return transaccion(['reportes'], 'readonly')
      .then(tx => comoPromesa(tx.objectStore('reportes').getAll()))
      .then(lista => lista.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
  }

  function filasDeReporte(id) {
    return transaccion(['filas'], 'readonly').then(tx => {
      const indice = tx.objectStore('filas').index('reporteId');
      return comoPromesa(indice.getAll(Number(id)));
    });
  }

  function borrarReporte(id) {
    const idNum = Number(id);
    return transaccion(['reportes', 'filas'], 'readwrite').then(tx => {
      tx.objectStore('reportes').delete(idNum);
      const indice = tx.objectStore('filas').index('reporteId');
      return comoPromesa(indice.getAllKeys(idNum)).then(claves => {
        const almacenFilas = tx.objectStore('filas');
        claves.forEach(clave => almacenFilas.delete(clave));
        return finTransaccion(tx);
      });
    }).then(() => leerAjuste('reporteActivo', null)).then(activo => {
      if (Number(activo) !== idNum) return null;
      return listarReportes().then(lista => {
        const nuevo = lista.length ? lista[0].id : null;
        return guardarAjuste('reporteActivo', nuevo).then(() => nuevo);
      });
    });
  }

  /* Historial de una casa: en qué reportes aparece y con qué avance. */
  function historialDeCasa(casaNorm) {
    return transaccion(['filas'], 'readonly').then(tx => {
      const indice = tx.objectStore('filas').index('casaNorm');
      return comoPromesa(indice.getAll(casaNorm));
    });
  }

  return {
    leerAjuste, guardarAjuste,
    guardarReporte, listarReportes, filasDeReporte, borrarReporte,
    historialDeCasa
  };
})();
