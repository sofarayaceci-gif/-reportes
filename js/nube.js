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

  /* ── Tablas que van por número de casa ────────────────────────────────────
     Marcas, códigos y terminadas comparten la misma forma: una fila por casa,
     con casa_norm de llave. Lo único distinto es qué columnas llevan.        */

  /* La dirección de un DELETE que borra todo lo que ya no esté en el aparato.

     Los números de casa normalizados son solo letras y dígitos, así que entran
     tal cual en la dirección; el filtro está igual, para no dejar pasar nada
     raro a la URL. Y el «not.is.null», que siempre da verdadero, está para que
     nunca salga un DELETE sin condición. */
  function soloLosQueSobran(tabla, mapaLocal) {
    const vivas = Object.keys(mapaLocal || {}).filter(c => /^[A-Z0-9]+$/.test(c));
    const filtro = vivas.length ? '&casa_norm=not.in.(' + vivas.join(',') + ')' : '';
    return tabla + '?casa_norm=not.is.null' + filtro;
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
    return pedir(soloLosQueSobran('marcas', marcasLocales), { metodo: 'DELETE' });
  }

  /* ── Códigos ──────────────────────────────────────────────────────────────
     El código que se le escribe a cada casa. Lleva fecha para poder decidir
     cuál gana cuando la compu y el celular tienen cosas distintas. */

  function leerCodigos() {
    return pedir('codigos?select=casa_norm,codigo,fecha', { prefer: 'return=representation' })
      .then(lista => {
        const mapa = {};
        (lista || []).forEach(c => { mapa[c.casa_norm] = { codigo: c.codigo, fecha: c.fecha }; });
        return mapa;
      });
  }

  function subirCodigos(codigos) {
    const filas = Object.keys(codigos || {}).map(casa => ({
      casa_norm: casa,
      codigo: codigos[casa].codigo,
      fecha: codigos[casa].fecha
    }));
    if (!filas.length) return Promise.resolve(null);
    return pedir('codigos', {
      metodo: 'POST',
      cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      cuerpo: filas
    });
  }

  /* Borrar un código se manda al momento. No hay una limpieza al sincronizar
     como la de las marcas: acá nada se vence solo, así que después de juntar
     las dos listas no puede sobrar nada que no se haya borrado ya. */
  function borrarCodigo(casaNorm) {
    return pedir('codigos?casa_norm=eq.' + encodeURIComponent(casaNorm), { metodo: 'DELETE' });
  }

  /* ── Terminadas ───────────────────────────────────────────────────────────
     Las casas que llegaron al 100 % y ya se registraron. A diferencia de las
     marcas, estas no se vencen: una casa terminada lo está para siempre. */

  function leerTerminadas() {
    return pedir('terminadas?select=casa_norm,fecha', { prefer: 'return=representation' })
      .then(lista => {
        const mapa = {};
        (lista || []).forEach(t => { mapa[t.casa_norm] = t.fecha; });
        return mapa;
      });
  }

  function subirTerminadas(terminadas) {
    const filas = Object.keys(terminadas || {}).map(casa => ({
      casa_norm: casa, fecha: terminadas[casa]
    }));
    if (!filas.length) return Promise.resolve(null);
    return pedir('terminadas', {
      metodo: 'POST',
      cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      cuerpo: filas
    });
  }

  function borrarTerminada(casaNorm) {
    return pedir('terminadas?casa_norm=eq.' + encodeURIComponent(casaNorm), { metodo: 'DELETE' });
  }

  /* ── Ajustes ──────────────────────────────────────────────────────────────
     Una fila por ajuste, con el valor entero en un jsonb. Hoy el único que se
     sincroniza son los textos del reporte, que se cambian desde la tuerca.

     Acá no se juntan las dos versiones como con las marcas: gana la más
     nueva, entera. Son textos que se escriben de tanto en tanto y desde un
     solo lado; mezclar mitad de un aparato y mitad del otro sería peor. */

  function leerAjuste(clave) {
    return pedir('ajustes?select=valor,fecha&clave=eq.' + encodeURIComponent(clave),
      { prefer: 'return=representation' })
      .then(lista => ((lista && lista[0]) ? lista[0] : null));
  }

  function subirAjuste(clave, valor, fecha) {
    return pedir('ajustes', {
      metodo: 'POST',
      cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      cuerpo: [{ clave: clave, valor: valor, fecha: fecha }]
    });
  }

  return {
    listarReportes, subirReporte, filasDeReporte, borrarReporte,
    leerMarcas, subirMarcas, borrarMarca, borrarMarcasQueSobran,
    leerCodigos, subirCodigos, borrarCodigo,
    leerTerminadas, subirTerminadas, borrarTerminada,
    leerAjuste, subirAjuste
  };
})();
