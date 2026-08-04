/* ══════════════════════════════════════════════════════════════════════════
   nube.js — Sincronización con Supabase, para ver los mismos reportes en la
   compu y en el celular.

   Sin librerías: se habla con fetch contra la API de Supabase.

   No hay login: se abre el enlace y sincroniza, sin nada que escribir ni que
   copiar. El costo de eso está escrito abajo, en el comentario de la clave, y
   en `supabase/esquema.sql`.

   La regla de fondo es que lo local manda para trabajar. IndexedDB sigue
   siendo la copia con la que la app funciona, y esto de acá solo la empareja
   con la nube cuando hay internet. Sin señal, la app funciona igual que
   siempre: eso era un requisito desde el principio y no se pierde.

   Este archivo es solo el transporte: subir y bajar. Quién sincroniza con qué
   y cuándo está en app.js.
   ══════════════════════════════════════════════════════════════════════════ */

const Nube = (() => {

  /* ── Los datos del proyecto ───────────────────────────────────────────────
     La clave de abajo es la pública de Supabase. Viaja dentro de la página, así
     que cualquiera que abra la app —o que mire el repositorio, que es público—
     la puede leer.

     ⚠️ Como la app va sin login, esa clave es lo único que hay entre los datos
     y el mundo, y no alcanza: quien la tenga puede leer, cambiar y borrar todo
     lo que haya en la nube. Se decidió así a sabiendas. Lo que salva el trabajo
     es que cada aparato conserva su copia completa en IndexedDB, y que los
     .xlsx semanales son el respaldo real.

     ⚠️ La otra clave de Supabase, la que empieza con «sb_secret_», NO va acá ni
     en ningún otro archivo. Esa se salta hasta las reglas de la base.

     Para cerrarlo algún día: ver la nota del final de esquema.sql.            */
  const URL_BASE = 'https://vlbrnrjdqzjwegcakguo.supabase.co';
  const CLAVE_PUBLICA = 'sb_publishable_Qz7jMd4dYIJRSHVS-OiBuw_IAdMddoX';

  /* ── Errores en castellano ────────────────────────────────────────────────
     Los de Supabase vienen en inglés. Se traducen los que pueden pasar de
     verdad; el resto se muestra tal cual, que es mejor que un mensaje vago. */
  function mensajeDeError(cuerpo, estado) {
    const crudo = String((cuerpo && (cuerpo.msg || cuerpo.message ||
      cuerpo.error_description || cuerpo.error || cuerpo.hint)) || '');

    if (/could not find the table|PGRST205/i.test(crudo)) {
      return 'Faltan las tablas en Supabase. Hay que correr supabase/esquema.sql.';
    }
    if (/invalid api key/i.test(crudo)) {
      return 'La clave de la nube no sirve. Revisar CLAVE_PUBLICA en js/nube.js.';
    }
    if (estado === 401 || estado === 403) {
      return 'La nube no dejó pasar. Revisar las reglas de acceso del esquema.';
    }
    if (crudo) return crudo;
    return 'La nube respondió con un error (' + estado + ').';
  }

  /* Un fetch que distingue «no hay internet» de «la nube dijo que no». */
  function pedir(ruta, opciones) {
    const config = opciones || {};
    return fetch(URL_BASE + '/rest/v1/' + ruta, {
      method: config.metodo || 'GET',
      headers: Object.assign({
        apikey: CLAVE_PUBLICA,
        'Content-Type': 'application/json',
        Prefer: config.prefer || 'return=minimal'
      }, config.cabeceras || {}),
      body: config.cuerpo === undefined ? undefined : JSON.stringify(config.cuerpo)
    }).catch(() => {
      throw new Error('Sin conexión. Se sigue trabajando con lo guardado en el aparato.');
    }).then(respuesta => {
      if (respuesta.status === 204) return null;
      return respuesta.json().catch(() => null).then(cuerpo => {
        if (!respuesta.ok) throw new Error(mensajeDeError(cuerpo, respuesta.status));
        return cuerpo;
      });
    });
  }

  /* ── Reportes ─────────────────────────────────────────────────────────── */

  function listarReportes() {
    return pedir('reportes?select=uid,nombre,fecha,hoja,total_filas,mapeo&order=fecha.desc',
      { prefer: 'return=representation' }).then(lista => lista || []);
  }

  /* Sube un reporte con sus filas. Es repetible: si el reporte ya estaba, se
     actualiza en vez de duplicarse, porque la llave es el uid del aparato. */
  function subirReporte(reporte, filas) {
    return pedir('reportes', {
      metodo: 'POST',
      cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      cuerpo: [{
        uid: reporte.uid,
        nombre: reporte.nombre,
        fecha: reporte.fecha,
        hoja: reporte.hoja || null,
        total_filas: reporte.totalFilas || null,
        mapeo: reporte.mapeo || null
      }]
    }).then(() => {
      if (!filas.length) return null;
      /* Las filas se reemplazan enteras: se borran las que hubiera y se suben
         de nuevo. Son unas 52 y así no hay que averiguar qué cambió. */
      return pedir('filas?reporte_uid=eq.' + encodeURIComponent(reporte.uid), { metodo: 'DELETE' })
        .then(() => pedir('filas', {
          metodo: 'POST',
          cuerpo: filas.map(f => ({
            reporte_uid: reporte.uid,
            casa: f.casa,
            casa_norm: f.casaNorm,
            porcentaje: f.porcentaje,
            etapa: f.etapa,
            complementarias: f.complementarias,
            datos: f.datos || null
          }))
        }));
    });
  }

  function filasDeReporte(uid) {
    return pedir('filas?select=casa,casa_norm,porcentaje,etapa,complementarias,datos' +
      '&reporte_uid=eq.' + encodeURIComponent(uid) + '&order=casa.asc',
      { prefer: 'return=representation' })
      .then(lista => (lista || []).map(f => ({
        casa: f.casa,
        casaNorm: f.casa_norm,
        porcentaje: f.porcentaje,
        etapa: f.etapa,
        complementarias: f.complementarias,
        datos: f.datos || {}
      })));
  }

  function borrarReporte(uid) {
    /* Las filas se van solas por el «on delete cascade» del esquema. */
    return pedir('reportes?uid=eq.' + encodeURIComponent(uid), { metodo: 'DELETE' });
  }

  /* ── Marcas ───────────────────────────────────────────────────────────── */

  function leerMarcas() {
    return pedir('marcas?select=casa_norm,fecha', { prefer: 'return=representation' })
      .then(lista => {
        const mapa = {};
        (lista || []).forEach(m => { mapa[m.casa_norm] = m.fecha; });
        return mapa;
      });
  }

  /* Se sube el mapa completo en vez de llevar una cola de cambios. Son un
     puñado de filas y así subir dos veces no rompe nada. */
  function subirMarcas(marcas) {
    const filas = Object.keys(marcas || {}).map(casa => ({
      casa_norm: casa, fecha: marcas[casa]
    }));
    if (!filas.length) return Promise.resolve(null);
    return pedir('marcas', {
      metodo: 'POST',
      cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      cuerpo: filas
    });
  }

  function borrarMarca(casaNorm) {
    return pedir('marcas?casa_norm=eq.' + encodeURIComponent(casaNorm), { metodo: 'DELETE' });
  }

  /* Borra de la nube las marcas que ya no están en el aparato. Hace falta
     porque subirMarcas solo agrega y actualiza: sin esto, una marca vencida
     seguiría viva en la nube y volvería a bajar. */
  function borrarMarcasQueSobran(marcasLocales) {
    /* Los números de casa normalizados son solo letras y dígitos, así que
       entran tal cual en la dirección. El filtro está igual, para no dejar
       pasar nada raro a la URL. */
    const vivas = Object.keys(marcasLocales || {}).filter(c => /^[A-Z0-9]+$/.test(c));
    const filtro = vivas.length ? '&casa_norm=not.in.(' + vivas.join(',') + ')' : '';
    /* El «not.is.null» es un filtro que siempre da verdadero: está para no
       mandar nunca un DELETE sin condición. */
    return pedir('marcas?casa_norm=not.is.null' + filtro, { metodo: 'DELETE' });
  }

  return {
    listarReportes, subirReporte, filasDeReporte, borrarReporte,
    leerMarcas, subirMarcas, borrarMarca, borrarMarcasQueSobran
  };
})();
