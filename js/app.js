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
    entrega: '',           // 'si' = con papeles, 'no' = sin papeles, vacío = todas
    verTerminadas: false,  // la lista muestra las terminadas en vez de las que faltan
    marcas: {},            // { casaNorm: fecha ISO en que se copió }
    codigos: {},           // { casaNorm: { codigo, fecha } }
    terminadas: {},        // { casaNorm: { cerrada, fecha } }
    papeles: {},           // { casaNorm: { entregados, fecha } }
    textos: null,          // { etapas: { n: texto }, medidor, fecha } — o null
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

  /* ══════════════════════════════════════════════════════════════════════════
     CÓDIGOS POR CASA

     Un código que se escribe a mano al lado del número. Va por número de casa,
     igual que las marcas, así que sobrevive al reporte de la semana siguiente,
     y no se vence nunca.

     No entra en el texto que se copia: es una guía para reconocer la casa en la
     lista y para poder buscarla por ahí.
     ══════════════════════════════════════════════════════════════════════════ */
  /* Lo que hay escrito en el campo y todavía no se aceptó: { casaNorm, valor }.
     Mientras esto no sea null, el campo va en ámbar y el ✓ está a la vista. */
  let codigoPendiente = null;

  function codigoDe(casaNorm) {
    const guardado = estado.codigos[casaNorm];
    return guardado ? guardado.codigo : '';
  }

  function guardarCodigos() {
    return Almacen.guardarAjuste('codigos', estado.codigos);
  }

  /* Si el código ya está puesto en otra casa, devuelve cuál. Compara
     normalizado, así «ABC-1» y «abc1» cuentan como el mismo y el aviso salta
     igual aunque se haya escrito distinto. */
  function otraCasaConElCodigo(codigo, casaNorm) {
    const buscado = normalizarCasa(codigo);
    if (!buscado) return '';
    const choque = Object.keys(estado.codigos).find(otra =>
      otra !== casaNorm && normalizarCasa(codigoDe(otra)) === buscado);
    if (!choque) return '';
    const fila = estado.filas.find(f => f.casaNorm === choque);
    return fila ? fila.casa : choque;
  }

  function ponerCodigo(casaNorm, texto) {
    /* Un campo vacío no guarda una cadena vacía: borra el código. */
    const limpio = String(texto || '').trim();
    if (!limpio) return quitarCodigo(casaNorm);

    estado.codigos[casaNorm] = { codigo: limpio, fecha: new Date().toISOString() };
    return guardarCodigos().then(() => {
      /* A la nube sin esperar: lo importante ya quedó en el aparato. */
      const solo = {};
      solo[casaNorm] = estado.codigos[casaNorm];
      Nube.subirCodigos(solo).catch(() => {});
    });
  }

  function quitarCodigo(casaNorm) {
    if (!estado.codigos[casaNorm]) return Promise.resolve();
    delete estado.codigos[casaNorm];
    return guardarCodigos().then(() => {
      Nube.borrarCodigo(casaNorm).catch(() => {});
    });
  }

  /* ── El campo del código, en la ficha ─────────────────────────────────────
     Se guarda solo cuando se acepta: con Enter o con el ✓. Escribir no guarda
     nada, así un código a medias no queda anotado. */
  function refrescarEstadoDelCodigo() {
    const caja = $('#codigo');
    const campo = $('#codigoCampo');
    if (!caja || !campo) return;

    const casaNorm = campo.dataset.casaCodigo;
    const hayCambio = campo.value.trim() !== codigoDe(casaNorm);
    codigoPendiente = hayCambio ? { casaNorm: casaNorm, valor: campo.value } : null;
    caja.classList.toggle('codigo--pendiente', hayCambio);
    $('#btnCodigo').hidden = !hayCambio;
    /* Copiar y guardar no salen juntos: mientras haya algo sin aceptar, el
       botón de copiar mandaría el código viejo y no el que está a la vista. */
    $('#btnCopiarCodigo').hidden = hayCambio || !codigoDe(casaNorm);
  }

  /* Avisa —sin bloquear— si el código ya está puesto en otra casa. Se supone
     único, así que un repetido casi siempre es un dedazo; pero la decisión es
     de quien lo escribe, no de la app. */
  function aceptarCodigo() {
    const campo = $('#codigoCampo');
    if (!campo) return;

    const casaNorm = campo.dataset.casaCodigo;
    const valor = campo.value.trim();
    const repetido = otraCasaConElCodigo(valor, casaNorm);

    ponerCodigo(casaNorm, valor).then(() => {
      campo.value = codigoDe(casaNorm);
      refrescarEstadoDelCodigo();
      pintarResultados();
      if (repetido) avisar('Ojo: «' + valor + '» ya está en ' + repetido + '.', true);
      else avisar(valor ? 'Código guardado' : 'Código borrado');
    }).catch(() => avisar('No se pudo guardar el código.', true));
  }

  function descartarCodigo() {
    const campo = $('#codigoCampo');
    if (!campo) return;
    campo.value = codigoDe(campo.dataset.casaCodigo);
    refrescarEstadoDelCodigo();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CASAS TERMINADAS

     Llegar al 100 % de eléctrico no termina una casa: lo que la termina es
     cerrarle la bitácora, y eso se marca a mano con el check de la ficha. La
     app no lo decide sola, porque el 100 % del Excel y la bitácora cerrada son
     dos cosas distintas y solo una de las dos se ve desde acá.

     Con el check puesto la casa sale de la lista de trabajo y pasa a la suya,
     que se abre con la barra de arriba de la lista. Quitando el check vuelve.

     Esto NO se vence, a diferencia de la marca de «añadido». La marca sirve
     para saber qué se metió al informe esta semana; una bitácora cerrada lo
     está para siempre.
     ══════════════════════════════════════════════════════════════════════════ */

  /* Cada casa guarda { cerrada, fecha }: si el check está puesto y cuándo se
     tocó por última vez. Quitar el check NO borra la anotación, la deja en
     falso — así el aparato se acuerda de que la abriste y puede decírselo a
     los demás. Sin eso, la compu que todavía la tuviera cerrada la volvería a
     cerrar en todas en cuanto se abriera la app. */
  function bitacoraDe(casaNorm) {
    return estado.terminadas[casaNorm] || null;
  }

  /* Lo guardado antes de que existiera el check era { casa: fecha } a secas, y
     todo lo anotado era un cierre. Se convierte al leerlo, así no hay que
     preguntarse en cada lugar con cuál de los dos formatos se está tratando. */
  function alFormatoNuevo(guardado) {
    if (!guardado || typeof guardado !== 'object') return {};
    const nuevo = {};
    Object.keys(guardado).forEach(casa => {
      const valor = guardado[casa];
      if (typeof valor === 'string') nuevo[casa] = { cerrada: true, fecha: valor };
      else if (valor && valor.fecha) nuevo[casa] = { cerrada: valor.cerrada !== false, fecha: valor.fecha };
    });
    return nuevo;
  }

  function tieneLaBitacoraCerrada(casaNorm) {
    const b = bitacoraDe(casaNorm);
    return !!b && b.cerrada;
  }

  /* Hacen falta las dos cosas: que tenga la bitácora cerrada, y que el reporte
     que se está viendo la traiga en 100 %.

     Lo segundo es lo que la hace volver sola. Si un reporte nuevo la baja del
     100 % —una corrección en el Excel— reaparece en la lista de trabajo sin
     que haya que tocar nada, y si más adelante vuelve al 100 %, vuelve a estar
     terminada. El check no se borra por eso: solo deja de aplicar. */
  function esTerminada(fila) {
    if (!tieneLaBitacoraCerrada(fila.casaNorm)) return false;
    return etapaDesdePorcentaje(fila.porcentaje) === ETAPA_FINALIZADA;
  }

  function guardarTerminadas() {
    return Almacen.guardarAjuste('terminadas', estado.terminadas);
  }

  /* Marcar y desmarcar hacen lo mismo salvo por el valor de «cerrada»: los dos
     dejan anotada la casa con la fecha de ahora, y los dos la mandan a la
     nube. Que pesen igual es justamente el punto. */
  function ponerBitacora(casaNorm, cerrada) {
    const anotacion = { cerrada: cerrada, fecha: new Date().toISOString() };
    estado.terminadas[casaNorm] = anotacion;
    return guardarTerminadas().then(() => {
      const sola = {};
      sola[casaNorm] = anotacion;
      Nube.subirTerminadas(sola).catch(() => {});
    });
  }

  function darPorTerminada(casaNorm) {
    return ponerBitacora(casaNorm, true);
  }

  /* Abrir la bitácora otra vez. La marca de registrada no se toca: son dos
     cosas distintas, y que la casa vuelva a la lista no borra que su texto ya
     se copió esta semana. */
  function devolverTerminada(casaNorm) {
    return ponerBitacora(casaNorm, false);
  }


  /* ══════════════════════════════════════════════════════════════════════════
     PAPELES ENTREGADOS

     El segundo check de la ficha, debajo del texto del reporte. Sale en las
     casas que el reporte trae al 100 %, igual que el de la bitácora, pero es
     independiente: una casa puede tener la bitácora cerrada y los papeles sin
     entregar, o al revés.

     No saca la casa de ninguna lista. Solo se puede filtrar por él, con los
     dos botones de arriba de la lista.

     Guarda { entregados, fecha } por la misma razón que las terminadas: hay
     que acordarse también de los checks que se quitan, o la compu que todavía
     lo tenga puesto lo revive al abrir la app.
     ══════════════════════════════════════════════════════════════════════════ */
  function tieneLosPapeles(casaNorm) {
    const p = estado.papeles[casaNorm];
    return !!p && p.entregados;
  }

  /* Dónde tiene sentido el check: en las casas al 100 %, y también en las que
     ya lo tienen puesto aunque hayan bajado del 100 %. Si no, no habría dónde
     quitárselo. */
  function llevaPapeles(fila) {
    return etapaDesdePorcentaje(fila.porcentaje) === ETAPA_FINALIZADA ||
      !!estado.papeles[fila.casaNorm];
  }

  function guardarPapeles() {
    return Almacen.guardarAjuste('papeles', estado.papeles);
  }

  function ponerPapeles(casaNorm, entregados) {
    const anotacion = { entregados: entregados, fecha: new Date().toISOString() };
    estado.papeles[casaNorm] = anotacion;
    return guardarPapeles().then(() => {
      const solo = {};
      solo[casaNorm] = anotacion;
      Nube.subirPapeles(solo).catch(() => {});
    });
  }

  /* ── Navegación entre vistas ────────────────────────────────────────────── */

  /* Ajustes no tiene botón abajo, así que hay que recordar de dónde se vino
     para que «Volver» devuelva a la pantalla correcta. */
  let vistaPrevia = 'buscar';

  function mostrarVista(nombre) {
    if (nombre === 'ajustes') {
      const actual = $$('.vista').find(v => v.classList.contains('vista--activa'));
      if (actual && actual.id !== 'vista-ajustes') vistaPrevia = actual.id.replace('vista-', '');
      pintarAjustes();
    }
    $$('.vista').forEach(v => v.classList.toggle('vista--activa', v.id === 'vista-' + nombre));
    $$('.nav__boton').forEach(b =>
      b.classList.toggle('nav__boton--activo', b.dataset.vista === nombre));
    $('#btnAjustes').classList.toggle('clip--activo', nombre === 'ajustes');
    window.scrollTo(0, 0);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BÚSQUEDA
     ══════════════════════════════════════════════════════════════════════════ */
  /* El grupo y el bloque se preguntan aparte porque también los necesita la
     cuenta de terminadas, que no mira ni la búsqueda ni el check. */
  function enElFiltroDeGrupo(fila) {
    if (estado.grupo && grupoDeCasa(fila.casa) !== estado.grupo) return false;
    if (estado.subgrupo && subgrupoDeCasa(fila.casa) !== estado.subgrupo) return false;
    return true;
  }

  /* Lo escrito en el buscador se compara contra el número de casa y contra el
     código, los dos normalizados. Así «1.02», «102» y «VB-1.02» encuentran la
     misma casa, y un código escrito con guiones se encuentra sin ellos. */
  function coincideConLaBusqueda(fila, q) {
    if (fila.casaNorm.indexOf(q) !== -1) return true;
    const codigo = codigoDe(fila.casaNorm);
    return !!codigo && normalizarCasa(codigo).indexOf(q) !== -1;
  }

  function filasQueCoinciden(consulta) {
    const q = normalizarCasa(consulta);
    return estado.filas.filter(fila => {
      if (!enElFiltroDeGrupo(fila)) return false;
      /* Las terminadas tienen su propia lista: o se ven solo ellas, o no se ven
         ninguna. Nunca mezcladas con las que faltan, que es el punto. */
      if (esTerminada(fila) !== estado.verTerminadas) return false;
      if (estado.registro) {
        const registrada = diasDeMarca(fila.casaNorm) !== null;
        if (estado.registro === 'si' && !registrada) return false;
        if (estado.registro === 'no' && registrada) return false;
      }
      if (estado.entrega) {
        /* Las que no llegaron al 100 % no entran en ninguno de los dos lados:
           no es que les falten los papeles, es que todavía no corresponde. */
        if (!llevaPapeles(fila)) return false;
        const conPapeles = tieneLosPapeles(fila.casaNorm);
        if (estado.entrega === 'si' && !conPapeles) return false;
        if (estado.entrega === 'no' && conPapeles) return false;
      }
      return !q || coincideConLaBusqueda(fila, q);
    });
  }

  /* Cuántas terminadas hay en el grupo y bloque que se estén viendo. */
  function cuantasTerminadas() {
    return estado.filas.filter(fila => enElFiltroDeGrupo(fila) && esTerminada(fila)).length;
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
    if (estado.entrega === 'si') return segun(' casa con papeles', ' casas con papeles') + enFiltro;
    if (estado.entrega === 'no') return segun(' casa sin papeles', ' casas sin papeles') + enFiltro;
    if (estado.verTerminadas) return segun(' casa terminada', ' casas terminadas') + enFiltro;
    if (estado.registro === 'si') return segun(' casa registrada', ' casas registradas') + enFiltro;
    if (estado.registro === 'no') return segun(' casa pendiente', ' casas pendientes') + enFiltro;
    /* Con terminadas de por medio, «52 casas en el reporte» sería mentira: la
       lista ya no las muestra. */
    if (cuantasTerminadas()) return segun(' casa', ' casas') + enFiltro + ' sin terminar';
    return segun(' casa', ' casas') + (enFiltro || ' en el reporte');
  }

  /* El mensaje del panel de la derecha cuando no queda ninguna casa a la vista. */
  function mensajeSinResultados(consulta) {
    const filtro = etiquetaDelFiltro();
    const enFiltro = filtro ? ' en ' + filtro : '';
    const deFiltro = filtro ? ' de ' + filtro : '';

    if (consulta) return 'Ninguna casa coincide con «' + esc(consulta) + '»' + esc(enFiltro) + '.';
    if (estado.entrega === 'si') return 'Todavía no entregaste papeles' + esc(deFiltro) + '.';
    if (estado.entrega === 'no') return '¡Listo! Entregaste todos los papeles' + esc(deFiltro) + '.';
    if (estado.verTerminadas) return 'Todavía no hay casas terminadas' + esc(enFiltro) + '.';
    if (estado.registro === 'no') return '¡Listo! Ya registraste todas las casas' + esc(deFiltro) + '.';
    if (estado.registro === 'si') return 'Todavía no registraste ninguna casa' + esc(deFiltro) + '.';
    if (cuantasTerminadas()) return '¡Listo! Ya terminaste todas las casas' + esc(deFiltro) + '.';
    return 'No hay casas en ' + esc(filtro) + ' en este reporte.';
  }

  /* Los dos botones llevan su número al lado. Se cuentan sobre lo que se
     estaría viendo sin el filtro del check, para que los dos números sumen
     siempre el total del grupo o bloque en el que estés. */
  function pintarRegistro(consulta) {
    /* En la lista de terminadas los dos botones no dirían nada: todas están
       registradas, por definición. */
    $('#registro').hidden = estado.verTerminadas;
    if (estado.verTerminadas) return;

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

  /* Los dos botones de los papeles. Cuentan solo sobre las casas donde el check
     corresponde —las que están al 100 %—, así los dos números suman esas y no
     el reporte entero: «Sin entregar 40» contando casas a medio construir no
     querría decir nada.

     La fila entera se esconde mientras no haya ninguna a la vista. */
  function pintarEntrega(consulta) {
    const fila = $('#entrega');

    /* Sobre lo que se vería sin este filtro, para que los dos números sumen
       siempre el total de casas al 100 % del grupo en el que estés. */
    const entregaReal = estado.entrega;
    estado.entrega = '';
    const base = filasQueCoinciden(consulta).filter(llevaPapeles);
    estado.entrega = entregaReal;

    if (!base.length) {
      fila.hidden = true;
      return;
    }
    fila.hidden = false;

    const conPapeles = base.filter(f => tieneLosPapeles(f.casaNorm)).length;
    const cuentas = { si: conPapeles, no: base.length - conPapeles };

    $$('#entrega .filtro').forEach(boton => {
      const valor = boton.dataset.entrega;
      const activo = estado.entrega === valor;
      boton.classList.toggle('filtro--activo', activo);
      boton.setAttribute('aria-pressed', activo);
      boton.querySelector('.filtro__n').textContent = cuentas[valor];
    });
  }

  /* La barra que abre y cierra la lista de terminadas. Solo se muestra si hay
     alguna: mientras no haya, no tiene por qué ocupar lugar. */
  function pintarTerminadas() {
    const boton = $('#btnTerminadas');
    const cuantas = cuantasTerminadas();

    if (!cuantas) {
      boton.hidden = true;
      boton.innerHTML = '';
      return;
    }

    boton.hidden = false;
    boton.classList.toggle('terminadas--activo', estado.verTerminadas);
    boton.setAttribute('aria-pressed', estado.verTerminadas);
    boton.innerHTML = estado.verTerminadas
      ? '&lsaquo; Volver a las que faltan'
      : '&#10003; ' + cuantas + (cuantas === 1 ? ' terminada' : ' terminadas') +
        '<span class="terminadas__flecha">&rsaquo;</span>';
  }

  /* La línea de abajo de cada casa: el código primero, porque es lo que se
     busca, y después lo que traiga el reporte. */
  function metaDeFila(fila) {
    const partes = [];
    const codigo = codigoDe(fila.casaNorm);
    if (codigo) partes.push('<span class="resultado__codigo">' + esc(codigo) + '</span>');

    const delReporte = [
      fila.datos['Tipo'],
      fila.datos['Sprint'] ? 'Sprint ' + fila.datos['Sprint'] : null
    ].filter(Boolean).join(' · ');
    if (delReporte) partes.push(esc(delReporte));

    return partes.length ? '<span class="resultado__meta">' + partes.join(' · ') + '</span>' : '';
  }

  function pintarResultados() {
    const consulta = $('#busqueda').value;

    /* Esto va antes de armar la lista, y no después. Si al cambiar de grupo o
       de bloque ya no queda ninguna terminada a la vista, hay que salir de esa
       lista ahora mismo: calculándola primero se armaría con el modo viejo y
       saldría vacía, sin nada que tocar para volver. */
    if (estado.verTerminadas && !cuantasTerminadas()) estado.verTerminadas = false;

    const lista = filasQueCoinciden(consulta);
    const contenedor = $('#resultados');

    $('#btnLimpiar').hidden = !consulta;
    pintarTerminadas();
    pintarRegistro(consulta);
    pintarEntrega(consulta);

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

    /* Si no hay ninguna casa abierta, el panel vuelve a su mensaje neutro. Sin
       esto se quedaba con el «ninguna casa coincide» de la búsqueda anterior,
       ya con la lista llena otra vez. */
    if (!estado.casaAbierta) {
      pintarDetalleVacio('Buscá una casa para ver su texto de reporte.');
    }

    contenedor.innerHTML = lista.map(fila => {
      const activa = fila.casaNorm === estado.casaAbierta ? ' resultado--activo' : '';
      const pastilla = fila.porcentaje === null
        ? '<span class="pastilla pastilla--gris">sin %</span>'
        : '<span class="pastilla">' + fila.porcentaje + '%</span>';
      const dias = diasDeMarca(fila.casaNorm);
      const marca = dias === null ? ''
        : '<span class="marca-punto" title="' + esc(textoDeMarca(dias)) + '" ' +
          'aria-label="' + esc(textoDeMarca(dias)) + '">&#10003;</span>';
      return '<li><button type="button" class="resultado' + activa + '" data-casa="' + esc(fila.casaNorm) + '">' +
        '<span class="resultado__casa">' + esc(fila.casa) + metaDeFila(fila) +
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

  /* El campo del código, al lado del número de casa. Los dos botones se turnan:
     el ✓ sale solo cuando hay algo escrito sin guardar, y el de copiar solo
     cuando hay un código guardado. Mientras tanto no estorban. */
  function codigoHTML(casaNorm) {
    const guardado = codigoDe(casaNorm);
    return '<div class="codigo" id="codigo">' +
      '<input type="text" class="codigo__campo" id="codigoCampo" ' +
        'value="' + esc(guardado) + '" ' +
        /* data-casa a secas es el de los botones de la lista; este lleva otro
           nombre para que no se confundan al buscarlos en la pantalla. */
        'data-casa-codigo="' + esc(casaNorm) + '" ' +
        'placeholder="Código" autocomplete="off" spellcheck="false" maxlength="40" ' +
        'aria-label="Código de la casa ' + esc(casaNorm) + '">' +
      '<button type="button" class="codigo__copiar" id="btnCopiarCodigo" ' +
        'data-copiar-codigo="' + esc(casaNorm) + '"' + (guardado ? '' : ' hidden') + ' ' +
        'title="Copiar el código" aria-label="Copiar el código">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" ' +
          'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
          '<path d="M5 15V5a2 2 0 0 1 2-2h8"/>' +
        '</svg></button>' +
      '<button type="button" class="codigo__ok" id="btnCodigo" hidden ' +
        'title="Guardar el código" aria-label="Guardar el código">&#10003;</button>' +
      '</div>';
  }

  /* El check de la bitácora. Sale en las casas que el reporte trae en 100 %, y
     también en las que ya tienen el check aunque hayan bajado del 100 %: si no,
     no habría dónde quitárselo.

     Cuando no corresponde deja un hueco escondido en vez de nada, igual que la
     marca: así se puede cambiar en su lugar sin repintar la ficha entera y
     perder el «¡Copiado!» del botón. */
  function bitacoraHTML(fila) {
    const cerrada = tieneLaBitacoraCerrada(fila.casaNorm);
    const enCien = etapaDesdePorcentaje(fila.porcentaje) === ETAPA_FINALIZADA;
    if (!cerrada && !enCien) return '<div id="bitacora" hidden></div>';

    const cuando = cerrada
      ? fechaLegible(bitacoraDe(fila.casaNorm).fecha).split(' · ')[0] : '';
    /* Cerrada pero por debajo del 100 % es el caso raro: un reporte nuevo la
       corrigió para abajo. Vale la pena decirlo, porque explica por qué sigue
       apareciendo en la lista con el check puesto. */
    const nota = !cerrada
      ? 'Marcala cuando la cierres. Ahí la casa pasa a las terminadas.'
      : enCien
        ? (cuando ? 'Cerrada el ' + cuando + '. ' : '') + 'Salió de la lista de casas por hacer.'
        : (cuando ? 'Cerrada el ' + cuando + ', ' : '') + 'pero el reporte la trae en ' +
          (fila.porcentaje === null ? 'sin %' : fila.porcentaje + ' %') +
          ', así que sigue en la lista.';

    return '<label class="chequeo' + (cerrada ? ' chequeo--puesto' : '') + '" id="bitacora">' +
      '<input type="checkbox" class="chequeo__check" ' +
        'data-bitacora="' + esc(fila.casaNorm) + '"' + (cerrada ? ' checked' : '') + '>' +
      '<span class="chequeo__texto"><strong>Bitácora cerrada</strong>' +
        '<span class="chequeo__nota">' + esc(nota) + '</span></span>' +
      '</label>';
  }

  function refrescarBitacora(fila) {
    const caja = $('#bitacora');
    if (caja) caja.outerHTML = bitacoraHTML(fila);
  }

  /* El check de los papeles, debajo del texto del reporte. Mismo aspecto y
     misma mecánica que el de la bitácora, pero sin consecuencias en la lista:
     acá solo queda anotado y se puede filtrar por él. */
  function papelesHTML(fila) {
    if (!llevaPapeles(fila)) return '<div id="papeles" hidden></div>';

    const puestos = tieneLosPapeles(fila.casaNorm);
    const cuando = puestos
      ? fechaLegible(estado.papeles[fila.casaNorm].fecha).split(' · ')[0] : '';
    const nota = puestos
      ? (cuando ? 'Entregados el ' + cuando + '.' : 'Ya se entregaron.')
      : 'Marcalo cuando los entregues. La casa se queda en la lista igual.';

    return '<label class="chequeo' + (puestos ? ' chequeo--puesto' : '') + '" id="papeles">' +
      '<input type="checkbox" class="chequeo__check" ' +
        'data-papeles="' + esc(fila.casaNorm) + '"' + (puestos ? ' checked' : '') + '>' +
      '<span class="chequeo__texto"><strong>Papeles entregados</strong>' +
        '<span class="chequeo__nota">' + esc(nota) + '</span></span>' +
      '</label>';
  }

  function refrescarPapeles(fila) {
    const caja = $('#papeles');
    if (caja) caja.outerHTML = papelesHTML(fila);
  }

  function abrirCasa(casaNorm) {
    const fila = estado.filas.find(f => f.casaNorm === casaNorm);
    if (!fila) return;

    /* Si se estaba escribiendo un código y se cambia de casa sin aceptarlo, se
       pierde. Se avisa en vez de guardarlo por las dudas: lo que se guarda es
       lo que se aceptó, y nada más. */
    if (codigoPendiente && codigoPendiente.casaNorm !== casaNorm) {
      const otra = estado.filas.find(f => f.casaNorm === codigoPendiente.casaNorm);
      avisar('El código de ' + (otra ? otra.casa : codigoPendiente.casaNorm) +
        ' quedó sin guardar.', true);
    }
    codigoPendiente = null;
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
      '<div class="ficha__encabezado">' +
        '<h2 class="ficha__casa">' + esc(fila.casa) + '</h2>' +
        codigoHTML(casaNorm) +
      '</div>' +
      (contexto ? '<div class="ficha__contexto">' + contexto + '</div>' : '<div style="height:.75rem"></div>') +
      bitacoraHTML(fila) +
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
      papelesHTML(fila) +
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
           no tiene por qué salir un «no se pudo copiar», porque sí se copió.

           Copiar deja la casa registrada y nada más. Aunque venga en 100 %, la
           que la manda a terminadas es la bitácora, con su check. */
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
     AJUSTES: LOS TEXTOS DEL REPORTE

     Los textos de fábrica viven en textos.js y no se tocan nunca: son la red
     debajo de todo. Lo que se escribe acá se guarda encima, y solo lo que de
     verdad se haya cambiado.

     Cada campo guarda por su cuenta, así un cambio a medias en una etapa no
     arrastra a las otras nueve. Y un campo vacío no guarda vacío: borra la
     modificación y vuelve el texto de fábrica, de modo que no hay forma de
     quedarse sin texto por haber borrado de más.
     ══════════════════════════════════════════════════════════════════════════ */
  function textosGuardados() {
    return estado.textos || { etapas: {}, medidor: '', fecha: null };
  }

  function textoDeFabrica(clave) {
    return clave === 'medidor' ? TEXTO_MEDIDOR : textoPorDefectoDeEtapa(clave);
  }

  function textoEnUso(clave) {
    return clave === 'medidor' ? textoDelMedidor() : textoDeEtapaElectrica(clave);
  }

  function tieneTextoPropio(clave) {
    return textoEnUso(clave) !== textoDeFabrica(clave);
  }

  /* Guarda un texto, o lo quita si quedó vacío o igual al de fábrica: no tiene
     sentido anotar una modificación que no modifica nada. Devuelve si terminó
     volviendo al original, para poder decirlo en el aviso. */
  function ponerTexto(clave, valor) {
    const guardado = textosGuardados();
    const propios = {
      etapas: Object.assign({}, guardado.etapas),
      medidor: guardado.medidor,
      fecha: new Date().toISOString()
    };

    const limpio = String(valor || '').trim();
    const volverAlOriginal = !limpio || limpio === textoDeFabrica(clave);

    if (clave === 'medidor') propios.medidor = volverAlOriginal ? '' : limpio;
    else if (volverAlOriginal) delete propios.etapas[clave];
    else propios.etapas[clave] = limpio;

    estado.textos = propios;
    aplicarTextosPropios(propios);

    return Almacen.guardarAjuste('textos', propios).then(() => {
      Nube.subirAjuste('textos',
        { etapas: propios.etapas, medidor: propios.medidor }, propios.fecha).catch(() => {});
      return volverAlOriginal;
    });
  }

  function campoDeTextoHTML(clave, titulo, corto) {
    const propio = tieneTextoPropio(clave);
    return '<div class="ajuste' + (propio ? ' ajuste--propio' : '') +
      '" data-clave="' + esc(clave) + '">' +
      '<div class="ajuste__titulo">' + esc(titulo) +
        (corto ? '<span class="ajuste__corto">' + esc(corto) + '</span>' : '') +
        (propio ? '<span class="ajuste__sello">Modificado</span>' : '') +
      '</div>' +
      '<textarea class="ajuste__campo" rows="3" spellcheck="false" ' +
        'aria-label="' + esc(titulo) + '">' + esc(textoEnUso(clave)) + '</textarea>' +
      '<div class="ajuste__acciones">' +
        '<span class="ajuste__estado"></span>' +
        (propio ? '<button type="button" class="boton boton--chico" data-restaurar="' +
          esc(clave) + '">Restaurar</button>' : '') +
        '<button type="button" class="boton boton--chico boton--principal" data-guardar="' +
          esc(clave) + '" disabled>Guardar</button>' +
      '</div>' +
    '</div>';
  }

  function pintarAjustes() {
    /* El rótulo del tramo sale de los mismos números que usa el cálculo, así
       que no puede quedar diciendo una cosa mientras la app hace otra. */
    const etapas = ETAPAS_ELECTRICAS.map(e =>
      campoDeTextoHTML(e.n, 'Etapa ' + e.n + ' · ' + tramoDeEtapa(e.n), e.corto)).join('');

    $('#listaTextos').innerHTML = etapas +
      '<h3 class="subtitulo" style="margin:1.5rem 0 .375rem">La línea del medidor</h3>' +
      '<p class="ayuda">Se pega al final del texto cuando el reporte trae Obras ' +
        'Complementarias en 100 %, menos en las casas con el eléctrico ya finalizado. ' +
        'Empieza con coma porque continúa la oración de arriba.</p>' +
      campoDeTextoHTML('medidor', 'Medidor provisional', '');
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

  /* Los códigos se juntan con la misma idea que las marcas, pero mirando la
     fecha de cada uno: para cada casa queda el código escrito más tarde. */
  function sincronizarCodigos() {
    return Nube.leerCodigos().then(remotos => {
      const unidos = Object.assign({}, remotos);
      Object.keys(estado.codigos).forEach(casa => {
        const local = estado.codigos[casa];
        if (!local || !local.codigo) return;
        const otro = unidos[casa];
        if (!otro || new Date(local.fecha) > new Date(otro.fecha)) unidos[casa] = local;
      });
      estado.codigos = unidos;

      return guardarCodigos().then(() => Nube.subirCodigos(estado.codigos));
    });
  }

  /* Las terminadas no se juntan como las marcas: para cada casa gana la fecha
     más nueva, sea un check puesto o uno quitado.

     Es al revés de lo que hacían antes, que se quedaban con la fecha más vieja
     por guardar cuándo se terminó la primera vez. Eso hacía que quitar un
     check no sirviera de nada entre aparatos: el que todavía la tuviera
     cerrada —con su fecha vieja, la que ganaba— la volvía a cerrar en todos.
     Ahora lo que vale es la última vez que alguien la tocó. */
  function sincronizarTerminadas() {
    return Nube.leerTerminadas().then(remotas => {
      const unidas = Object.assign({}, remotas);
      Object.keys(estado.terminadas).forEach(casa => {
        const local = estado.terminadas[casa];
        const otra = unidas[casa];
        if (!otra || new Date(local.fecha) > new Date(otra.fecha)) unidas[casa] = local;
      });
      estado.terminadas = unidas;

      return guardarTerminadas().then(() => Nube.subirTerminadas(estado.terminadas));
    });
  }

  /* Los papeles, con la misma regla que las terminadas: gana la última vez que
     alguien tocó el check, sea para ponerlo o para quitarlo. */
  function sincronizarPapeles() {
    return Nube.leerPapeles().then(remotos => {
      const unidos = Object.assign({}, remotos);
      Object.keys(estado.papeles).forEach(casa => {
        const local = estado.papeles[casa];
        const otro = unidos[casa];
        if (!otro || new Date(local.fecha) > new Date(otro.fecha)) unidos[casa] = local;
      });
      estado.papeles = unidos;

      return guardarPapeles().then(() => Nube.subirPapeles(estado.papeles));
    });
  }

  /* Los textos no se juntan: gana el más nuevo, entero. Son textos que se
     escriben de tanto en tanto y desde un solo lado, y mezclar la mitad de un
     aparato con la mitad del otro dejaría un reporte que no escribió nadie. */
  function sincronizarTextos() {
    return Nube.leerAjuste('textos').then(remoto => {
      const local = textosGuardados();
      const fechaLocal = local.fecha ? new Date(local.fecha) : null;
      const fechaRemota = remoto && remoto.fecha ? new Date(remoto.fecha) : null;

      if (!fechaLocal && !fechaRemota) return null;

      if (fechaRemota && (!fechaLocal || fechaRemota > fechaLocal)) {
        const bajado = {
          etapas: (remoto.valor && remoto.valor.etapas) || {},
          medidor: (remoto.valor && remoto.valor.medidor) || '',
          fecha: remoto.fecha
        };
        estado.textos = bajado;
        aplicarTextosPropios(bajado);
        return Almacen.guardarAjuste('textos', bajado);
      }

      if (!fechaRemota || fechaLocal > fechaRemota) {
        return Nube.subirAjuste('textos',
          { etapas: local.etapas, medidor: local.medidor }, local.fecha);
      }
      return null;
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
      .then(() => sincronizarCodigos())
      .then(() => sincronizarTerminadas())
      .then(() => sincronizarPapeles())
      .then(() => sincronizarTextos())
      .then(() => recargarTodo())
      .then(() => {
        estado.nube.ultima = new Date().toISOString();
        estado.nube.sincronizando = false;
        pintarNube();
      })
      .catch(error => {
        estado.nube.sincronizando = false;
        estado.nube.error = error.message;
        /* Aunque algo haya fallado a mitad de camino, lo que sí se alcanzó a
           bajar ya quedó guardado. Se muestra igual, en vez de hacer esperar
           hasta la próxima vez que se abra la app. */
        return recargarTodo().catch(() => {}).then(() => {
          pintarNube();
          if (!silencioso) avisar(error.message, true);
        });
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
      Almacen.leerAjuste('marcas', {}),
      Almacen.leerAjuste('codigos', {}),
      Almacen.leerAjuste('terminadas', {}),
      Almacen.leerAjuste('papeles', {}),
      Almacen.leerAjuste('textos', null)
    ]).then(([reportes, idActivo, marcas, codigos, terminadas, papeles, textos]) => {
      estado.reportes = reportes;
      estado.marcas = marcas && typeof marcas === 'object' ? marcas : {};
      estado.codigos = codigos && typeof codigos === 'object' ? codigos : {};
      estado.terminadas = alFormatoNuevo(terminadas);
      estado.papeles = papeles && typeof papeles === 'object' ? papeles : {};

      /* Los textos propios se aplican antes de pintar nada: si no, la primera
         pantalla saldría con los de fábrica y cambiaría sola un instante
         después. */
      estado.textos = textos && typeof textos === 'object' ? textos : null;
      aplicarTextosPropios(estado.textos);

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

    /* La tuerca abre Ajustes; «Volver» devuelve a donde se estaba. */
    $('#btnAjustes').addEventListener('click', () => mostrarVista('ajustes'));
    $('#btnVolver').addEventListener('click', () => mostrarVista(vistaPrevia));

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

    /* Entregados / Sin entregar, con la misma regla: el que ya está activo se
       apaga y vuelven todas. */
    $('#entrega').addEventListener('click', evento => {
      const boton = evento.target.closest('[data-entrega]');
      if (!boton) return;
      const valor = boton.dataset.entrega;
      estado.entrega = estado.entrega === valor ? '' : valor;
      pintarResultados();
    });

    /* La barra de terminadas: pasa de la lista de trabajo a la de terminadas y
       al revés. Al entrar se apaga el filtro del check, que ahí no aplica. */
    $('#btnTerminadas').addEventListener('click', () => {
      estado.verTerminadas = !estado.verTerminadas;
      if (estado.verTerminadas) estado.registro = '';
      pintarResultados();
    });

    /* Todo lo de la ficha va delegado, porque el panel se rehace entero cada
       vez que se abre una casa. */
    $('#detalle').addEventListener('click', evento => {
      const quitar = evento.target.closest('[data-quitar-marca]');
      if (quitar) {
        const casaNorm = quitar.dataset.quitarMarca;
        quitarMarca(casaNorm)
          .then(() => refrescarMarca(casaNorm))
          .catch(() => avisar('No se pudo quitar la marca.', true));
        return;
      }

      if (evento.target.closest('#btnCodigo')) {
        aceptarCodigo();
        return;
      }

      const copiarCodigo = evento.target.closest('[data-copiar-codigo]');
      if (copiarCodigo) {
        const codigo = codigoDe(copiarCodigo.dataset.copiarCodigo);
        if (!codigo) return;
        copiarAlPortapapeles(codigo).then(() => {
          copiarCodigo.classList.add('codigo__copiar--copiado');
          setTimeout(() => copiarCodigo.classList.remove('codigo__copiar--copiado'), 1600);
          avisar('Código copiado: ' + codigo);
        }).catch(() => avisar('No se pudo copiar el código.', true));
      }
    });

    /* ── El check de la bitácora ──────────────────────────────────────────
       Es lo único que pasa una casa a terminadas y lo único que la devuelve.
       Si el guardado falla, el check se vuelve a poner como estaba: mejor que
       quede claro que no se guardó, y no un check que dice una cosa mientras
       el aparato tiene anotada la otra. */
    $('#detalle').addEventListener('change', evento => {
      const check = evento.target.closest('[data-bitacora]');
      if (check) {
        const casaNorm = check.dataset.bitacora;
        const fila = estado.filas.find(f => f.casaNorm === casaNorm);
        const cerrar = check.checked;

        (cerrar ? darPorTerminada(casaNorm) : devolverTerminada(casaNorm)).then(() => {
          if (fila) refrescarBitacora(fila);
          pintarResultados();
          avisar(cerrar
            ? (fila ? fila.casa : casaNorm) + ' pasó a las terminadas.'
            : 'Bitácora abierta otra vez: vuelve a la lista.');
        }).catch(() => {
          check.checked = !cerrar;
          avisar('No se pudo guardar el check.', true);
        });
        return;
      }

      /* Los papeles no mueven la casa de lista; solo se repinta para que los
         dos botones de arriba muestren los números nuevos. */
      const papeles = evento.target.closest('[data-papeles]');
      if (papeles) {
        const casaNorm = papeles.dataset.papeles;
        const fila = estado.filas.find(f => f.casaNorm === casaNorm);
        const entregar = papeles.checked;

        ponerPapeles(casaNorm, entregar).then(() => {
          if (fila) refrescarPapeles(fila);
          pintarResultados();
          avisar(entregar ? 'Papeles entregados' : 'Papeles marcados como no entregados');
        }).catch(() => {
          papeles.checked = !entregar;
          avisar('No se pudo guardar el check.', true);
        });
      }
    });

    /* El campo del código. Enter acepta, Escape descarta; escribir no guarda,
       solo enciende el ✓ y pinta el campo de ámbar. */
    $('#detalle').addEventListener('input', evento => {
      if (evento.target.id === 'codigoCampo') refrescarEstadoDelCodigo();
    });

    $('#detalle').addEventListener('keydown', evento => {
      if (evento.target.id !== 'codigoCampo') return;
      if (evento.key === 'Enter') { evento.preventDefault(); aceptarCodigo(); }
      if (evento.key === 'Escape') { evento.preventDefault(); descartarCodigo(); }
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

    /* ── Los textos, en Ajustes ───────────────────────────────────────────
       Escribir no guarda: solo enciende el botón y avisa que quedó sin
       guardar. Lo que se guarda es lo que se acepta. */
    $('#listaTextos').addEventListener('input', evento => {
      const campo = evento.target.closest('.ajuste__campo');
      if (!campo) return;
      const caja = campo.closest('.ajuste');
      const cambiado = campo.value.trim() !== textoEnUso(caja.dataset.clave).trim();

      caja.querySelector('[data-guardar]').disabled = !cambiado;
      const aviso = caja.querySelector('.ajuste__estado');
      aviso.textContent = cambiado ? 'Sin guardar' : '';
      aviso.classList.toggle('ajuste__estado--pendiente', cambiado);
    });

    $('#listaTextos').addEventListener('click', evento => {
      const guardar = evento.target.closest('[data-guardar]');
      const restaurar = evento.target.closest('[data-restaurar]');
      if (!guardar && !restaurar) return;

      const caja = evento.target.closest('.ajuste');
      const clave = caja.dataset.clave;
      /* Restaurar es guardar vacío: la misma puerta para las dos cosas, así no
         hay dos formas distintas de dejar el texto en su original. */
      const valor = guardar ? caja.querySelector('.ajuste__campo').value : '';

      ponerTexto(clave, valor).then(volvioAlOriginal => {
        pintarAjustes();
        refrescarVistaBuscar();
        avisar(volvioAlOriginal ? 'Volvió el texto original' : 'Texto guardado');
      }).catch(() => avisar('No se pudo guardar el texto.', true));
    });

    $('#btnRestaurarTodo').addEventListener('click', () => {
      if (!confirm('¿Volver todos los textos a los originales?\n\n' +
        'Se pierden los cambios que hayas hecho, en este aparato y en los demás.')) return;

      const limpio = { etapas: {}, medidor: '', fecha: new Date().toISOString() };
      estado.textos = limpio;
      aplicarTextosPropios(limpio);

      Almacen.guardarAjuste('textos', limpio).then(() => {
        Nube.subirAjuste('textos', { etapas: {}, medidor: '' }, limpio.fecha).catch(() => {});
        pintarAjustes();
        refrescarVistaBuscar();
        avisar('Volvieron todos los textos originales');
      }).catch(() => avisar('No se pudieron restaurar los textos.', true));
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
