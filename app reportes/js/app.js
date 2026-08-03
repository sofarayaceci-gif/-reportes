/* ══════════════════════════════════════════════════════════════════════════
   app.js — Reportes. Interfaz, búsqueda, importación e historial.
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.prototype.slice.call(document.querySelectorAll(sel));

  /* ── Estado ─────────────────────────────────────────────────────────────── */
  const estado = {
    reporteActivo: null,   // { id, nombre, fecha, ... }
    filas: [],             // filas del reporte activo
    reportes: [],          // todos los reportes, para el historial
    casaAbierta: null,
    grupo: ''              // filtro de grupo activo; vacío = todas
  };

  /* ── Utilidades ─────────────────────────────────────────────────────────── */
  function esc(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let temporizadorAviso = null;
  function avisar(mensaje, esError) {
    const aviso = $('#aviso');
    aviso.textContent = mensaje;
    aviso.classList.toggle('aviso--error', !!esError);
    aviso.classList.add('aviso--visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('aviso--visible'), 2600);
  }

  function fechaLegible(iso) {
    const f = new Date(iso);
    if (isNaN(f)) return '';
    return f.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + f.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  function copiarAlPortapapeles(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    /* Respaldo para cuando no hay contexto seguro (por ejemplo abierto como archivo). */
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const bien = document.execCommand('copy');
      document.body.removeChild(area);
      bien ? resolve() : reject(new Error('No se pudo copiar'));
    });
  }

  /* ── Navegación entre vistas ────────────────────────────────────────────── */
  function mostrarVista(nombre) {
    $$('.vista').forEach(v => v.classList.toggle('vista--activa', v.id === 'vista-' + nombre));
    $$('.nav__boton').forEach(b =>
      b.classList.toggle('nav__boton--activo', b.dataset.vista === nombre));
    window.scrollTo(0, 0);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BÚSQUEDA
     ══════════════════════════════════════════════════════════════════════════ */
  function filasQueCoinciden(consulta) {
    const q = normalizarCasa(consulta);
    return estado.filas.filter(fila => {
      if (estado.grupo && grupoDeCasa(fila.casa) !== estado.grupo) return false;
      return !q || fila.casaNorm.indexOf(q) !== -1;
    });
  }

  /* ── Filtro por grupo ─────────────────────────────────────────────────────
     Los botones salen del propio reporte: se juntan los prefijos que hay
     antes del guion y se ordenan según ORDEN_DE_GRUPOS. Con un solo grupo el
     filtro no filtraría nada, así que ni se muestra. */
  function gruposDelReporte() {
    const vistos = [];
    estado.filas.forEach(fila => {
      const grupo = grupoDeCasa(fila.casa);
      if (grupo && vistos.indexOf(grupo) === -1) vistos.push(grupo);
    });
    return ordenarGrupos(vistos);
  }

  function pintarGrupos() {
    const contenedor = $('#grupos');
    const grupos = gruposDelReporte();

    if (grupos.length < 2) {
      estado.grupo = '';
      contenedor.innerHTML = '';
      contenedor.hidden = true;
      return;
    }

    /* Si el reporte nuevo no trae el grupo que estaba elegido, se vuelve a todas. */
    if (estado.grupo && grupos.indexOf(estado.grupo) === -1) estado.grupo = '';

    contenedor.hidden = false;
    contenedor.innerHTML = [''].concat(grupos).map(grupo => {
      const activo = estado.grupo === grupo;
      return '<button type="button" class="grupo' + (activo ? ' grupo--activo' : '') +
        '" data-grupo="' + esc(grupo) + '" aria-pressed="' + activo + '">' +
        esc(grupo || 'Todas') + '</button>';
    }).join('');
  }

  function pintarResultados() {
    const consulta = $('#busqueda').value;
    const lista = filasQueCoinciden(consulta);
    const contenedor = $('#resultados');
    const conteo = $('#conteo');

    $('#btnLimpiar').hidden = !consulta;

    if (!estado.filas.length) {
      contenedor.innerHTML = '';
      conteo.textContent = '';
      pintarDetalleVacio('Todavía no hay ningún reporte. Traelo con el clip de arriba, ' +
        'o copiá el Excel y pegalo acá con Ctrl+V.');
      return;
    }

    const enGrupo = estado.grupo ? ' en ' + estado.grupo : '';
    conteo.textContent = consulta
      ? lista.length + (lista.length === 1 ? ' casa encontrada' : ' casas encontradas') + enGrupo
      : lista.length + (lista.length === 1 ? ' casa' : ' casas') + (enGrupo || ' en el reporte');

    if (!lista.length) {
      contenedor.innerHTML = '';
      pintarDetalleVacio(consulta
        ? 'Ninguna casa coincide con «' + esc(consulta) + '»' +
          (estado.grupo ? ' en ' + esc(estado.grupo) : '') + '.'
        : 'El grupo ' + esc(estado.grupo) + ' no tiene casas en este reporte.');
      return;
    }

    contenedor.innerHTML = lista.map(fila => {
      const activa = fila.casaNorm === estado.casaAbierta ? ' resultado--activo' : '';
      const meta = [fila.datos['Tipo'], fila.datos['Sprint'] ? 'Sprint ' + fila.datos['Sprint'] : null]
        .filter(Boolean).join(' · ');
      const pastilla = fila.porcentaje === null
        ? '<span class="pastilla pastilla--gris">sin %</span>'
        : '<span class="pastilla">' + fila.porcentaje + '%</span>';
      return '<li><button type="button" class="resultado' + activa + '" data-casa="' + esc(fila.casaNorm) + '">' +
        '<span class="resultado__casa">' + esc(fila.casa) +
        (meta ? '<span class="resultado__meta">' + esc(meta) + '</span>' : '') +
        '</span>' + pastilla + '</button></li>';
    }).join('');
  }

  function pintarDetalleVacio(mensaje) {
    estado.casaAbierta = null;
    $('#detalle').innerHTML =
      '<div class="vacio">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6" fill="none" ' +
          'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg><p>' + mensaje + '</p></div>';
  }

  /* ── Ficha de una casa ──────────────────────────────────────────────────── */
  const CLAVES_CONTEXTO = ['Proyecto', 'Tipo', 'Sprint', 'Estado', 'Venta'];

  function abrirCasa(casaNorm) {
    const fila = estado.filas.find(f => f.casaNorm === casaNorm);
    if (!fila) return;
    estado.casaAbierta = casaNorm;

    const etapa = etapaDesdePorcentaje(fila.porcentaje);
    const infoEtapa = ETAPAS_ELECTRICAS.find(e => e.n === etapa);
    const texto = generarTexto(etapa, fila.complementarias);

    const contexto = CLAVES_CONTEXTO
      .filter(clave => fila.datos[clave] !== undefined)
      .map(clave => '<span class="dato">' + esc(clave) + ': <strong>' +
        esc(fila.datos[clave]) + '</strong></span>').join('');

    const bloqueAvance = fila.porcentaje === null
      ? '<div class="avance"><div class="avance__detalle">Esta casa no trae porcentaje de ' +
        'avance eléctrico en el reporte, así que no se puede generar el texto.</div></div>'
      : '<div class="avance">' +
          '<div class="avance__numero">' + fila.porcentaje + '%</div>' +
          '<div class="avance__detalle">Etapa <strong>' + etapa + '</strong> · ' +
            esc(infoEtapa ? infoEtapa.corto : '') +
          '</div>' +
        '</div>';

    $('#detalle').innerHTML =
      '<h2 class="ficha__casa">' + esc(fila.casa) + '</h2>' +
      (contexto ? '<div class="ficha__contexto">' + contexto + '</div>' : '<div style="height:.75rem"></div>') +
      bloqueAvance +
      '<div class="texto-generado">' +
        '<div class="texto-generado__encabezado">' +
          '<span>Texto del reporte</span>' +
          '<button type="button" class="boton boton--copiar" id="btnCopiar"' +
            (texto ? '' : ' disabled') + '>Copiar</button>' +
        '</div>' +
        '<p class="texto-generado__cuerpo" id="cuerpoTexto">' + esc(texto) + '</p>' +
      '</div>' +
      historialDeCasaHTML(casaNorm);

    $('#btnCopiar').addEventListener('click', () => {
      const contenido = $('#cuerpoTexto').textContent;
      if (!contenido) return;
      copiarAlPortapapeles(contenido).then(() => {
        const boton = $('#btnCopiar');
        boton.textContent = '¡Copiado!';
        boton.classList.add('boton--copiado');
        setTimeout(() => {
          boton.textContent = 'Copiar';
          boton.classList.remove('boton--copiado');
        }, 1600);
      }).catch(() => avisar('No se pudo copiar. Seleccioná el texto y usá Ctrl+C.', true));
    });

    pintarResultados();
  }

  /* Cómo venía esta casa en los reportes anteriores. */
  function historialDeCasaHTML(casaNorm) {
    const previas = [];
    estado.reportes.forEach(reporte => {
      if (estado.reporteActivo && reporte.id === estado.reporteActivo.id) return;
      (reporte._filasCache || []).forEach(fila => {
        if (fila.casaNorm === casaNorm) previas.push({ reporte, fila });
      });
    });
    if (!previas.length) return '';

    const filas = previas.map(({ reporte, fila }) => {
      const etapa = etapaDesdePorcentaje(fila.porcentaje);
      return '<tr><td>' + esc(reporte.nombre) + '</td>' +
        '<td class="num">' + (fila.porcentaje === null ? '—' : fila.porcentaje + '%') + '</td>' +
        '<td class="num">' + (etapa === null ? '—' : etapa) + '</td></tr>';
    }).join('');

    return '<h3 class="subtitulo" style="margin-top:1.5rem">Esta casa en reportes anteriores</h3>' +
      '<div class="tabla-envoltura"><table class="tabla">' +
      '<thead><tr><th>Reporte</th><th class="num">%</th><th class="num">Etapa</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table></div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     IMPORTACIÓN

     No hay pantalla de por medio ni nada que elegir: se abre el archivo, se
     reconocen solos la hoja y las tres columnas, se guarda y queda listo para
     buscar. El aviso de abajo dice qué entró, que es lo que antes se revisaba
     en la vista previa.
     ══════════════════════════════════════════════════════════════════════════ */
  function alElegirArchivo(archivo) {
    if (!archivo) return;
    avisar('Leyendo ' + archivo.name + '…');

    Excel.leerArchivo(archivo).then(libro => {
      const hoja = Excel.sugerirHoja(libro);
      const matriz = Excel.matrizDeHoja(libro, hoja);
      const indiceEncabezado = Excel.filaDeEncabezado(matriz);
      const columnas = Excel.columnasDeHoja(matriz, indiceEncabezado);
      const mapeo = Excel.sugerirMapeo(columnas);
      const filas = Excel.construirFilas(matriz, indiceEncabezado, columnas, mapeo);

      if (!filas.length) {
        avisar('No se reconoció ninguna casa en «' + hoja + '». Revisá que el Excel ' +
          'tenga la hoja de siempre con los encabezados sin cambios.', true);
        return null;
      }

      const reporte = {
        nombre: archivo.name,
        fecha: new Date().toISOString(),
        hoja: hoja,
        totalFilas: filas.length,
        mapeo: {
          hoja: hoja,
          casa: mapeo.casa,
          porcentaje: mapeo.porcentaje,
          complementarias: mapeo.complementarias,
          nombreCasa: (columnas[mapeo.casa] || {}).nombre || '',
          nombrePorcentaje: mapeo.porcentaje === null ? '' : (columnas[mapeo.porcentaje] || {}).nombre || ''
        }
      };

      /* Con la misma regla que usa el texto, para que el número del aviso y
         lo que se copia no puedan decir cosas distintas. */
      const conMedidor = filas.filter(f =>
        llevaLineaDeMedidor(etapaDesdePorcentaje(f.porcentaje), f.complementarias)).length;

      return Almacen.guardarReporte(reporte, filas)
        .then(() => recargarTodo())
        .then(() => {
          $('#busqueda').value = '';
          estado.grupo = '';
          refrescarVistaBuscar();
          mostrarVista('buscar');
          $('#busqueda').focus();
          avisar(filas.length + ' casas importadas · ' + conMedidor + ' con medidor provisional');
        });
    }).catch(error => avisar(error.message, true));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HISTORIAL
     ══════════════════════════════════════════════════════════════════════════ */
  function pintarHistorial() {
    const contenedor = $('#historial');
    const vacio = $('#historialVacio');

    if (!estado.reportes.length) {
      contenedor.innerHTML = '';
      vacio.hidden = false;
      return;
    }
    vacio.hidden = true;

    contenedor.innerHTML = estado.reportes.map(reporte => {
      const activo = estado.reporteActivo && reporte.id === estado.reporteActivo.id;
      return '<li class="historial__fila' + (activo ? ' historial__fila--activo' : '') + '">' +
        '<div class="historial__datos">' +
          '<div class="historial__nombre">' + esc(reporte.nombre) + '</div>' +
          '<div class="historial__meta">' + fechaLegible(reporte.fecha) + ' · ' +
            reporte.totalFilas + ' casas · hoja «' + esc(reporte.hoja) + '»' +
            (activo ? ' · <strong>activo</strong>' : '') +
          '</div>' +
        '</div>' +
        (activo ? '' : '<button type="button" class="boton" data-activar="' + reporte.id + '">Usar</button>') +
        '<button type="button" class="iconoboton" data-borrar="' + reporte.id +
          '" aria-label="Borrar reporte" title="Borrar reporte">&times;</button>' +
        '</li>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CARGA
     ══════════════════════════════════════════════════════════════════════════ */
  function recargarTodo() {
    return Promise.all([
      Almacen.listarReportes(),
      Almacen.leerAjuste('reporteActivo', null)
    ]).then(([reportes, idActivo]) => {
      estado.reportes = reportes;

      const activo = reportes.find(r => r.id === Number(idActivo)) || reportes[0] || null;
      estado.reporteActivo = activo;

      /* Se cargan las filas de todos los reportes: hacen falta para el
         historial por casa y son pocos datos. */
      return Promise.all(reportes.map(r =>
        Almacen.filasDeReporte(r.id).then(filas => { r._filasCache = filas; })
      )).then(() => {
        estado.filas = activo ? (activo._filasCache || []) : [];
        estado.filas.sort((a, b) => a.casa.localeCompare(b.casa, 'es'));
      });
    }).then(() => {
      $('#barraSub').textContent = estado.reporteActivo
        ? estado.reporteActivo.nombre + ' · ' + estado.filas.length + ' casas'
        : 'Sin reportes';
      refrescarVistaBuscar();
      pintarHistorial();
    });
  }

  function refrescarVistaBuscar() {
    pintarGrupos();
    pintarResultados();
    if (estado.casaAbierta && estado.filas.some(f => f.casaNorm === estado.casaAbierta)) {
      abrirCasa(estado.casaAbierta);
    } else if (estado.filas.length) {
      pintarDetalleVacio('Buscá una casa para ver su texto de reporte.');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     EVENTOS
     ══════════════════════════════════════════════════════════════════════════ */
  function conectarEventos() {
    $$('.nav__boton').forEach(boton =>
      boton.addEventListener('click', () => mostrarVista(boton.dataset.vista)));

    $('#btnImportar').addEventListener('click', () => $('#archivo').click());
    $('#btnImportarVacio').addEventListener('click', () => $('#archivo').click());
    $('#archivo').addEventListener('change', evento => {
      alElegirArchivo(evento.target.files[0]);
      evento.target.value = '';
    });

    $('#busqueda').addEventListener('input', pintarResultados);
    $('#btnLimpiar').addEventListener('click', () => {
      $('#busqueda').value = '';
      $('#busqueda').focus();
      pintarResultados();
    });

    /* El filtro de grupo no toca lo escrito en el buscador: se pueden usar
       los dos a la vez. */
    $('#grupos').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-grupo]');
      if (!boton) return;
      estado.grupo = boton.dataset.grupo;
      pintarGrupos();
      pintarResultados();
    });

    $('#resultados').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-casa]');
      if (boton) abrirCasa(boton.dataset.casa);
    });

    $('#historial').addEventListener('click', evento => {
      const activar = evento.target.closest('[data-activar]');
      if (activar) {
        Almacen.guardarAjuste('reporteActivo', Number(activar.dataset.activar))
          .then(() => recargarTodo())
          .then(() => avisar('Reporte activo cambiado'));
        return;
      }
      const borrar = evento.target.closest('[data-borrar]');
      if (borrar) {
        const id = Number(borrar.dataset.borrar);
        const reporte = estado.reportes.find(r => r.id === id);
        if (!confirm('¿Borrar «' + (reporte ? reporte.nombre : 'este reporte') + '» del historial?')) return;
        Almacen.borrarReporte(id).then(() => recargarTodo()).then(() => avisar('Reporte borrado'));
      }
    });

    /* Arrastrar y soltar el Excel en cualquier parte, sin ninguna pantalla
       encima: lo único que cambia es el clip de la barra, que se marca
       mientras el archivo viene en camino.

       La marca se mantiene con un temporizador que se renueva mientras el
       arrastre siga sobre la ventana, en vez de contar entradas y salidas:
       cuando el arrastre se cancela (se suelta fuera, Escape, se interrumpe)
       los eventos de salida no llegan, y contando quedaba trabado. */
    let temporizadorArrastre = null;

    function arrastraArchivos(evento) {
      const tipos = evento.dataTransfer && evento.dataTransfer.types;
      if (!tipos) return false;
      return Array.prototype.indexOf.call(tipos, 'Files') !== -1;
    }

    function mostrarArrastre() {
      $('#btnImportar').classList.add('clip--recibiendo');
      clearTimeout(temporizadorArrastre);
      temporizadorArrastre = setTimeout(ocultarArrastre, 500);
    }

    function ocultarArrastre() {
      clearTimeout(temporizadorArrastre);
      $('#btnImportar').classList.remove('clip--recibiendo');
    }

    /* dragover se repite mientras el arrastre esté encima, así que renueva el
       temporizador. En cuanto deja de repetirse, el aviso se va solo. */
    window.addEventListener('dragover', evento => {
      evento.preventDefault();
      if (arrastraArchivos(evento)) mostrarArrastre();
    });
    window.addEventListener('dragenter', evento => {
      evento.preventDefault();
      if (arrastraArchivos(evento)) mostrarArrastre();
    });
    window.addEventListener('dragleave', ocultarArrastre);
    window.addEventListener('dragend', ocultarArrastre);
    window.addEventListener('blur', ocultarArrastre);
    document.addEventListener('keydown', evento => {
      if (evento.key === 'Escape') ocultarArrastre();
    });

    window.addEventListener('drop', evento => {
      evento.preventDefault();
      ocultarArrastre();
      const archivo = evento.dataTransfer.files && evento.dataTransfer.files[0];
      if (archivo) alElegirArchivo(archivo);
    });

    /* Copiar el archivo en el explorador y pegarlo acá con Ctrl+V. */
    window.addEventListener('paste', evento => {
      const datos = evento.clipboardData;
      if (!datos || !datos.files || !datos.files.length) return;  // pegado de texto: no molestar
      const archivo = Array.prototype.find.call(datos.files, esExcel) || datos.files[0];
      evento.preventDefault();
      if (esExcel(archivo)) {
        alElegirArchivo(archivo);
      } else {
        avisar('Lo que pegaste no es un Excel (.xlsx).', true);
      }
    });
  }

  function esExcel(archivo) {
    return !!archivo && /\.(xlsx|xlsm|xls)$/i.test(archivo.name || '');
  }

  /* La instalación se deja enteramente a Chrome: no se intercepta
     beforeinstallprompt, así el navegador muestra su propio botón de instalar
     en la barra de direcciones y en el menú, sin que la app se meta. */

  /* ── Servicio para trabajar sin internet ────────────────────────────────── */
  function registrarServicio() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin caché, la app igual funciona */ });
  }

  /* ── Arranque ───────────────────────────────────────────────────────────── */
  conectarEventos();
  registrarServicio();
  recargarTodo().catch(error => {
    avisar('No se pudo abrir el guardado local: ' + error.message, true);
  });
})();
