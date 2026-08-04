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
    grupo: '',             // filtro de grupo activo; vacío = todas
    subgrupo: '',          // filtro de bloque dentro del grupo; vacío = todos
    registro: '',          // 'si' = con check, 'no' = sin check, vacío = todas
    marcas: {},            // { casaNorm: fecha ISO en que se copió }
    nube: { sincronizando: false, ultima: null, error: '' }
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

  /* ══════════════════════════════════════════════════════════════════════════
     MARCAS DE COPIADO

     Al copiar el texto de una casa queda marcada por unos días, para saber de
     un vistazo cuáles ya se metieron al informe. Se guardan por número de
     casa y no por reporte, así la marca sigue ahí cuando entra el reporte de
     la semana siguiente, que es justo cuando sirve.
     ══════════════════════════════════════════════════════════════════════════ */
  const DIAS_DE_MARCA = 7;

  /* Días de calendario, no de 24 horas: algo copiado anoche dice «ayer» y no
     «hoy» aunque no hayan pasado 24 horas. */
  function diasDesde(iso) {
    const antes = new Date(iso);
    if (isNaN(antes)) return null;
    const hoy = new Date();
    const a = new Date(antes.getFullYear(), antes.getMonth(), antes.getDate());
    const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.round((b - a) / 86400000);
  }

  /* Los días que lleva marcada una casa, o null si no está marcada o si ya se
     le pasaron los días. */
  function diasDeMarca(casaNorm) {
    const iso = estado.marcas[casaNorm];
    if (!iso) return null;
    const dias = diasDesde(iso);
    if (dias === null || dias < 0 || dias >= DIAS_DE_MARCA) return null;
    return dias;
  }

  function textoDeMarca(dias) {
    if (dias === 0) return 'Añadido hoy';
    if (dias === 1) return 'Añadido ayer';
    return 'Añadido hace ' + dias + ' días';
  }

  function guardarMarcas() {
    return Almacen.guardarAjuste('marcas', estado.marcas);
  }

  function marcarCasa(casaNorm) {
    estado.marcas[casaNorm] = new Date().toISOString();
    return guardarMarcas().then(() => {
      /* A la nube se manda sin esperar y sin molestar si falla: lo importante
         ya quedó guardado en el aparato, y la próxima sincronización la sube. */
      const sola = {};
      sola[casaNorm] = estado.marcas[casaNorm];
      Nube.subirMarcas(sola).catch(() => {});
    });
  }

  function quitarMarca(casaNorm) {
    delete estado.marcas[casaNorm];
    return guardarMarcas().then(() => {
      Nube.borrarMarca(casaNorm).catch(() => {});
    });
  }

  /* Las vencidas se borran al abrir, para que la lista no crezca sin fin. */
  function limpiarMarcasVencidas() {
    let hubo = false;
    Object.keys(estado.marcas).forEach(casa => {
      if (diasDeMarca(casa) === null) { delete estado.marcas[casa]; hubo = true; }
    });
    return hubo ? guardarMarcas() : Promise.resolve();
  }

  /* El banner que va al lado del botón de copiar. Cuando no hay marca deja un
     hueco vacío, para poder cambiarlo en su lugar sin repintar la ficha
     entera (si no, se perdería el «¡Copiado!» del botón). */
  function marcaBannerHTML(casaNorm) {
    const dias = diasDeMarca(casaNorm);
    if (dias === null) return '<span id="marca" hidden></span>';
    return '<button type="button" class="marca" id="marca" ' +
      'data-quitar-marca="' + esc(casaNorm) + '" ' +
      'title="Tocá para quitar la marca">' + esc(textoDeMarca(dias)) + '</button>';
  }

  function refrescarMarca(casaNorm) {
    const banner = $('#marca');
    if (banner) banner.outerHTML = marcaBannerHTML(casaNorm);
    pintarResultados();
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
      if (estado.subgrupo && subgrupoDeCasa(fila.casa) !== estado.subgrupo) return false;
      if (estado.registro) {
        const registrada = diasDeMarca(fila.casaNorm) !== null;
        if (estado.registro === 'si' && !registrada) return false;
        if (estado.registro === 'no' && registrada) return false;
      }
      return !q || fila.casaNorm.indexOf(q) !== -1;
    });
  }

  /* Cómo se llama lo que se está viendo: «VB», «VB-5», o vacío si es todo. */
  function etiquetaDelFiltro() {
    if (!estado.grupo) return '';
    return estado.grupo + (estado.subgrupo ? '-' + estado.subgrupo : '');
  }

  /* ── Filtros de grupo y de bloque ─────────────────────────────────────────
     Los botones salen del propio reporte: se juntan los prefijos que hay
     antes del guion y se ordenan según ORDEN_DE_GRUPOS. Con un solo grupo el
     filtro no filtraría nada, así que ni se muestra.

     Los bloques son el segundo nivel y salen solo con un grupo elegido: con
     «Todas» activo, un botón que dijera «1» mezclaría VB-1 con VN-1 y no
     habría cómo saber de cuál es. */
  function gruposDelReporte() {
    const vistos = [];
    estado.filas.forEach(fila => {
      const grupo = grupoDeCasa(fila.casa);
      if (grupo && vistos.indexOf(grupo) === -1) vistos.push(grupo);
    });
    return ordenarGrupos(vistos);
  }

  function subgruposDelGrupo(grupo) {
    const vistos = [];
    estado.filas.forEach(fila => {
      if (grupoDeCasa(fila.casa) !== grupo) return;
      const sub = subgrupoDeCasa(fila.casa);
      if (sub && vistos.indexOf(sub) === -1) vistos.push(sub);
    });
    return ordenarSubgrupos(vistos);
  }

  function botonesDeFiltro(valores, elegido, atributo, etiquetaTodas) {
    return [''].concat(valores).map(valor => {
      const activo = elegido === valor;
      return '<button type="button" class="grupo' + (activo ? ' grupo--activo' : '') +
        '" ' + atributo + '="' + esc(valor) + '" aria-pressed="' + activo + '">' +
        esc(valor || etiquetaTodas) + '</button>';
    }).join('');
  }

  function pintarGrupos() {
    const contenedor = $('#grupos');
    const subcontenedor = $('#subgrupos');
    const grupos = gruposDelReporte();

    if (grupos.length < 2) {
      estado.grupo = '';
    } else if (estado.grupo && grupos.indexOf(estado.grupo) === -1) {
      /* Si el reporte nuevo no trae el grupo que estaba elegido, vuelve a todas. */
      estado.grupo = '';
    }

    if (grupos.length < 2) {
      contenedor.innerHTML = '';
      contenedor.hidden = true;
    } else {
      contenedor.hidden = false;
      contenedor.innerHTML = botonesDeFiltro(grupos, estado.grupo, 'data-grupo', 'Todas');
    }

    const subgrupos = estado.grupo ? subgruposDelGrupo(estado.grupo) : [];
    if (subgrupos.length < 2) estado.subgrupo = '';
    else if (estado.subgrupo && subgrupos.indexOf(estado.subgrupo) === -1) estado.subgrupo = '';

    if (subgrupos.length < 2) {
      subcontenedor.innerHTML = '';
      subcontenedor.hidden = true;
      return;
    }
    subcontenedor.hidden = false;
    subcontenedor.innerHTML =
      botonesDeFiltro(subgrupos, estado.subgrupo, 'data-subgrupo', 'Todos');
  }

  /* Lo que dice la línea de la cuenta, según lo que se esté viendo. */
  function textoDelConteo(lista, consulta) {
    const enFiltro = etiquetaDelFiltro() ? ' en ' + etiquetaDelFiltro() : '';
    const n = lista.length;
    const segun = (uno, varias) => n + (n === 1 ? uno : varias);

    if (consulta) return segun(' casa encontrada', ' casas encontradas') + enFiltro;
    if (estado.registro === 'si') return segun(' casa registrada', ' casas registradas') + enFiltro;
    if (estado.registro === 'no') return segun(' casa pendiente', ' casas pendientes') + enFiltro;
    return segun(' casa', ' casas') + (enFiltro || ' en el reporte');
  }

  /* El mensaje del panel de la derecha cuando no queda ninguna casa a la vista. */
  function mensajeSinResultados(consulta) {
    const filtro = etiquetaDelFiltro();
    const enFiltro = filtro ? ' en ' + filtro : '';
    const deFiltro = filtro ? ' de ' + filtro : '';

    if (consulta) return 'Ninguna casa coincide con «' + esc(consulta) + '»' + esc(enFiltro) + '.';
    if (estado.registro === 'no') return '¡Listo! Ya registraste todas las casas' + esc(deFiltro) + '.';
    if (estado.registro === 'si') return 'Todavía no registraste ninguna casa' + esc(deFiltro) + '.';
    return 'No hay casas en ' + esc(filtro) + ' en este reporte.';
  }

  /* Los dos botones llevan su número al lado. Se cuentan sobre lo que se
     estaría viendo sin el filtro del check, para que los dos números sumen
     siempre el total del grupo o bloque en el que estés. */
  function pintarRegistro(consulta) {
    const registroReal = estado.registro;
    estado.registro = '';
    const base = filasQueCoinciden(consulta);
    estado.registro = registroReal;

    const registradas = base.filter(f => diasDeMarca(f.casaNorm) !== null).length;
    const cuentas = { si: registradas, no: base.length - registradas };

    $$('#registro .filtro').forEach(boton => {
      const valor = boton.dataset.registro;
      const activo = estado.registro === valor;
      boton.classList.toggle('filtro--activo', activo);
      boton.setAttribute('aria-pressed', activo);
      boton.querySelector('.filtro__n').textContent = cuentas[valor];
    });
  }

  function pintarResultados() {
    const consulta = $('#busqueda').value;
    const lista = filasQueCoinciden(consulta);
    const contenedor = $('#resultados');

    $('#btnLimpiar').hidden = !consulta;
    pintarRegistro(consulta);

    if (!estado.filas.length) {
      contenedor.innerHTML = '';
      $('#conteoFila').hidden = true;
      pintarDetalleVacio('Todavía no hay ningún reporte. Traelo con el clip de arriba, ' +
        'o copiá el Excel y pegalo acá con Ctrl+V.');
      return;
    }

    $('#conteoFila').hidden = false;
    $('#conteo').textContent = textoDelConteo(lista, consulta);

    if (!lista.length) {
      contenedor.innerHTML = '';
      pintarDetalleVacio(mensajeSinResultados(consulta));
      return;
    }

    contenedor.innerHTML = lista.map(fila => {
      const activa = fila.casaNorm === estado.casaAbierta ? ' resultado--activo' : '';
      const meta = [fila.datos['Tipo'], fila.datos['Sprint'] ? 'Sprint ' + fila.datos['Sprint'] : null]
        .filter(Boolean).join(' · ');
      const pastilla = fila.porcentaje === null
        ? '<span class="pastilla pastilla--gris">sin %</span>'
        : '<span class="pastilla">' + fila.porcentaje + '%</span>';
      const dias = diasDeMarca(fila.casaNorm);
      const marca = dias === null ? ''
        : '<span class="marca-punto" title="' + esc(textoDeMarca(dias)) + '" ' +
          'aria-label="' + esc(textoDeMarca(dias)) + '">&#10003;</span>';
      return '<li><button type="button" class="resultado' + activa + '" data-casa="' + esc(fila.casaNorm) + '">' +
        '<span class="resultado__casa">' + esc(fila.casa) +
        (meta ? '<span class="resultado__meta">' + esc(meta) + '</span>' : '') +
        '</span>' + marca + pastilla + '</button></li>';
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
          '<div class="texto-generado__acciones">' +
            marcaBannerHTML(casaNorm) +
            '<button type="button" class="boton boton--copiar" id="btnCopiar"' +
              (texto ? '' : ' disabled') + '>Copiar</button>' +
          '</div>' +
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
        /* Sin return a propósito: la marca es un extra. Si fallara el guardado
           no tiene por qué salir un «no se pudo copiar», porque sí se copió. */
        marcarCasa(casaNorm)
          .then(() => refrescarMarca(casaNorm))
          .catch(() => { /* el copiado ya salió, que es lo que importa */ });
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
        /* El uid lo pone el aparato, no la base. Así el mismo reporte tiene la
           misma identidad acá, en el celular y en la nube. */
        uid: nuevoUid(),
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
          estado.subgrupo = '';
          estado.registro = '';
          refrescarVistaBuscar();
          mostrarVista('buscar');
          $('#busqueda').focus();
          avisar(filas.length + ' casas importadas · ' + conMedidor + ' con medidor provisional');
          /* Sube por detrás, sin tapar el aviso de arriba con otro. */
          return sincronizar(true);
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
     NUBE

     Lo local manda para trabajar: IndexedDB sigue siendo la copia con la que
     la app funciona, y esto solo la empareja con la nube cuando hay internet y
     sesión. Sin entrar, o sin señal, la app anda igual que siempre.
     ══════════════════════════════════════════════════════════════════════════ */
  function nuevoUid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    /* Respaldo para cuando no hay contexto seguro (abierta con doble clic). */
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const n = Math.random() * 16 | 0;
      return (c === 'x' ? n : (n & 0x3 | 0x8)).toString(16);
    });
  }

  /* El _filasCache es solo para la pantalla; no tiene por qué ir a guardarse. */
  function sinCache(reporte) {
    const limpio = Object.assign({}, reporte);
    delete limpio._filasCache;
    return limpio;
  }

  /* De a uno y no todos juntos: son pocos y así no se atropellan. */
  function enFila(lista, hacer) {
    return lista.reduce((cadena, item) => cadena.then(() => hacer(item)), Promise.resolve());
  }

  /* Los reportes importados antes de que existiera la nube no traen uid, y sin
     uid no hay con qué emparejarlos. Se les pone uno la primera vez. */
  function ponerUidsQueFalten() {
    const sinUid = estado.reportes.filter(reporte => !reporte.uid);
    if (!sinUid.length) return Promise.resolve();
    return enFila(sinUid, reporte => {
      reporte.uid = nuevoUid();
      return Almacen.actualizarReporte(sinCache(reporte));
    });
  }

  function sincronizarReportes() {
    return Nube.listarReportes().then(remotos => {
      const locales = estado.reportes.filter(r => r.uid);
      const uidsRemotos = remotos.map(r => r.uid);
      const uidsLocales = locales.map(r => r.uid);

      const porSubir = locales.filter(r => uidsRemotos.indexOf(r.uid) === -1);
      const porBajar = remotos.filter(r => uidsLocales.indexOf(r.uid) === -1);

      return enFila(porSubir, reporte =>
        Almacen.filasDeReporte(reporte.id)
          .then(filas => Nube.subirReporte(sinCache(reporte), filas))
      ).then(() => enFila(porBajar, remoto =>
        Nube.filasDeReporte(remoto.uid).then(filas => Almacen.guardarReporte({
          uid: remoto.uid,
          nombre: remoto.nombre,
          fecha: remoto.fecha,
          hoja: remoto.hoja,
          totalFilas: remoto.total_filas,
          mapeo: remoto.mapeo
        }, filas, false))   // false: bajar un reporte no le cambia el activo
      ));
    });
  }

  /* Las marcas se juntan en vez de que una lista le gane a la otra: para cada
     casa queda la fecha más nueva. Si las dos tienen algo distinto, nunca se
     pierde una marca. Lo peor que puede pasar es que reaparezca una que
     quitaste sin señal, y eso se arregla quitándola otra vez. */
  function sincronizarMarcas() {
    return Nube.leerMarcas().then(remotas => {
      const unidas = Object.assign({}, remotas);
      Object.keys(estado.marcas).forEach(casa => {
        const local = estado.marcas[casa];
        if (!unidas[casa] || new Date(local) > new Date(unidas[casa])) unidas[casa] = local;
      });
      estado.marcas = unidas;

      return limpiarMarcasVencidas()
        .then(() => guardarMarcas())
        .then(() => Nube.subirMarcas(estado.marcas))
        /* Y se limpian de la nube las que ya se vencieron acá. */
        .then(() => Nube.borrarMarcasQueSobran(estado.marcas));
    });
  }

  function sincronizar(silencioso) {
    if (estado.nube.sincronizando) return Promise.resolve();

    estado.nube.sincronizando = true;
    estado.nube.error = '';
    pintarNube();

    return ponerUidsQueFalten()
      .then(() => sincronizarReportes())
      .then(() => sincronizarMarcas())
      .then(() => recargarTodo())
      .then(() => {
        estado.nube.ultima = new Date().toISOString();
        estado.nube.sincronizando = false;
        pintarNube();
      })
      .catch(error => {
        estado.nube.sincronizando = false;
        estado.nube.error = error.message;
        pintarNube();
        if (!silencioso) avisar(error.message, true);
      });
  }

  function horaCorta(iso) {
    const f = new Date(iso);
    return isNaN(f) ? '' : f.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  function pintarNube() {
    const hayError = !!estado.nube.error;
    $('#nube').classList.toggle('nube--error', hayError);
    $('#btnReintentar').hidden = !hayError;
    $('#nubeMeta').textContent =
      estado.nube.sincronizando ? 'Sincronizando…'
        : hayError ? estado.nube.error
          : estado.nube.ultima
            ? 'Al día · ' + horaCorta(estado.nube.ultima)
            : 'Al abrir la app se sincroniza sola.';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CARGA
     ══════════════════════════════════════════════════════════════════════════ */
  function recargarTodo() {
    return Promise.all([
      Almacen.listarReportes(),
      Almacen.leerAjuste('reporteActivo', null),
      Almacen.leerAjuste('marcas', {})
    ]).then(([reportes, idActivo, marcas]) => {
      estado.reportes = reportes;
      estado.marcas = marcas && typeof marcas === 'object' ? marcas : {};

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
    }).then(() => limpiarMarcasVencidas()).then(() => {
      $('#barraSub').textContent = estado.reporteActivo
        ? estado.reporteActivo.nombre + ' · ' + estado.filas.length + ' casas'
        : 'Sin reportes';
      refrescarVistaBuscar();
      pintarHistorial();
      pintarNube();
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

    /* Los filtros no tocan lo escrito en el buscador: se pueden usar a la vez.
       Cambiar de grupo sí borra el bloque elegido, porque los bloques son de
       cada grupo y el que estaba no tiene por qué existir en el nuevo. */
    $('#grupos').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-grupo]');
      if (!boton) return;
      estado.grupo = boton.dataset.grupo;
      estado.subgrupo = '';
      pintarGrupos();
      pintarResultados();
    });

    $('#subgrupos').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-subgrupo]');
      if (!boton) return;
      estado.subgrupo = boton.dataset.subgrupo;
      pintarGrupos();
      pintarResultados();
    });

    /* Registradas / Pendientes. Tocar el que ya está activo lo apaga y vuelven
       todas: así son dos botones y no tres. */
    $('#registro').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-registro]');
      if (!boton) return;
      const valor = boton.dataset.registro;
      estado.registro = estado.registro === valor ? '' : valor;
      pintarResultados();
    });

    /* Quitar la marca de una casa desde el banner de la ficha. Va delegado
       porque el banner se cambia de lugar cada vez que se copia. */
    $('#detalle').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-quitar-marca]');
      if (!boton) return;
      const casaNorm = boton.dataset.quitarMarca;
      quitarMarca(casaNorm)
        .then(() => refrescarMarca(casaNorm))
        .catch(() => avisar('No se pudo quitar la marca.', true));
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
        const uid = reporte && reporte.uid;
        Almacen.borrarReporte(id)
          .then(() => {
            /* También en la nube, si no volvería a bajar en la próxima
               sincronización. Si no hay señal, eso es justo lo que pasa. */
            if (!uid) return null;
            return Nube.borrarReporte(uid).catch(() => {
              avisar('Se borró acá, pero no en la nube: sin conexión.', true);
            });
          })
          .then(() => recargarTodo())
          .then(() => avisar('Reporte borrado'));
      }
    });

    /* ── La nube ──────────────────────────────────────────────────────────
       Lo único que hay que tocar es reintentar, y solo si algo falló. */
    $('#btnReintentar').addEventListener('click', () => sincronizar());

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
  recargarTodo().then(() => {
    /* Al abrir se sincroniza sola, en silencio: si no hay señal, no molesta con
       avisos y la app funciona con lo local. El estado se ve en Historial. */
    sincronizar(true);
  }).catch(error => {
    avisar('No se pudo abrir el guardado local: ' + error.message, true);
  });
})();
