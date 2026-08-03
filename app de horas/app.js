/* ============================================================
   Registro de Horas — lógica de la aplicación
   Datos guardados en el navegador (localStorage).
   ============================================================ */
'use strict';

/* La jornada son 12 h: es lo que la app da por un día completo (el banner, la
   barra, y los días de menos que salen en rojo). No es un máximo: arriba de eso
   se siguen registrando horas extra. Lo único que no se puede pasar es el día
   entero, y eso es porque el desplegable tiene que terminar en algún número. */
const JORNADA  = 12;
const TOPE_DIA = 24;           // un día no tiene más horas que estas
const PASO   = 0.5;            // se puede registrar de media en media hora
const CLAVE  = 'registroHoras.v1';
const CLAVE_BAK = 'registroHoras.v1.respaldo';   // copia por si la principal se pierde
const CLAVE_MODO = 'registroHoras.modoHoras';    // cómo prefiere anotar las horas quien usa esto
const CLAVE_TURNOS = 'registroHoras.turnos.v1';  // turnos abiertos: solo de este dispositivo
const TOPE_NOTA = 200;          // largo de la nota: entra en una celda del Excel y se lee
const LISTAS = ['empleados', 'actividades', 'casas', 'registros'];
const DIAS_LAPIDA = 90;         // cuánto se recuerda un borrado (ver lapidas)

/* ---------------- Estado ---------------- */

const db = {
  empleados: [],    // [{ id, nombre }]
  actividades: [],
  casas: [],
  // [{ id, fecha, empleado, actividad, casa, horas, creado }]
  // Los hechos con el reloj llevan además entrada y salida ("07:00"), solo para
  // poder verlos, y los que tengan algo que aclarar una nota. Los viejos pueden
  // traer almuerzo, de cuando esa hora se descontaba (ver rangoDelRegistro).
  registros: [],
  borrados: {}      // { id: cuándo se borró } — ver fusionar()
};

let ultimoId = null;        // id del último registro guardado (se resalta en la tabla)
let rev      = 0;           // cuenta los cambios hechos aquí
let falloAlGuardar = false;

/** Cuántos cambios se han hecho en este dispositivo. La nube lo mira antes y
    después de cada petición: si subió, hay algo nuevo que no debe pisar. */
function revLocal(){ return rev; }

/* ---------------- Guardado en este navegador ---------------- */

function leerCrudo(clave){
  try{ return localStorage.getItem(clave); }catch(e){ return null; }
}

/** Vuelca en db un JSON guardado. Devuelve si servía. */
function aplicarCrudo(crudo){
  if(!crudo) return false;
  let datos;
  try{ datos = JSON.parse(crudo); }catch(e){ return false; }
  if(!datos || typeof datos !== 'object') return false;
  let servia = false;
  for(const llave of LISTAS){
    if(Array.isArray(datos[llave])){ db[llave] = datos[llave]; servia = true; }
  }
  db.borrados = lapidas(datos.borrados);
  return servia;
}

function cargar(){
  if(aplicarCrudo(leerCrudo(CLAVE))) return;
  // La copia principal no está o quedó ilegible: se usa el respaldo.
  if(aplicarCrudo(leerCrudo(CLAVE_BAK))){
    console.warn('Datos recuperados del respaldo.');
    guardarLocal();
  }
}

/** Guarda solo en este navegador. Devuelve si se logró. */
function guardarLocal(){
  const texto = JSON.stringify(db);
  try{
    localStorage.setItem(CLAVE, texto);
    // Se relee lo escrito: con el almacenamiento lleno o en modo privado hay
    // navegadores que aceptan el setItem y no dejan nada. Mejor saberlo ya.
    if(localStorage.getItem(CLAVE) !== texto) throw new Error('lo guardado no coincide');
    try{ localStorage.setItem(CLAVE_BAK, texto); }catch(e){}   // el respaldo es un extra
    avisarFallo(false);
    return true;
  }catch(e){
    console.warn('No se pudieron guardar los datos:', e);
    avisarFallo(true);
    return false;
  }
}

/** Guarda aquí y, si la sincronización está activa, avisa a la nube. */
function guardar(){
  rev++;
  guardarLocal();
  if(window.nube) window.nube.cambioLocal();
}

/** Cartel fijo: si el navegador no está guardando hay que verlo al instante,
    no descubrirlo cuando falten las horas. */
function avisarFallo(hay){
  if(hay === falloAlGuardar) return;
  falloAlGuardar = hay;
  const caja = $('#aviso-guardado');
  if(caja) caja.hidden = !hay;
}

/* ---------------- Puente con la nube (nube.js) ---------------- */

/** Los datos que se sincronizan. El acceso no viaja: es de cada dispositivo. */
function datosActuales(){
  return {
    empleados:   db.empleados,
    actividades: db.actividades,
    casas:       db.casas,
    registros:   db.registros,
    borrados:    db.borrados
  };
}

/** Lápidas: los borrados se recuerdan DIAS_LAPIDA días para que la fusión no
    los resucite desde otro dispositivo. Pasado ese tiempo se olvidan y la
    lista no crece para siempre; un dispositivo apagado más que eso sí podría
    devolver algo borrado. */
function lapidas(crudo){
  const limite = Date.now() - DIAS_LAPIDA * 86400000;
  const salida = {};
  if(crudo && typeof crudo === 'object' && !Array.isArray(crudo)){
    for(const id of Object.keys(crudo)){
      const cuando = Number(crudo[id]);
      if(Number.isFinite(cuando) && cuando > limite) salida[id] = cuando;
    }
  }
  return salida;
}

function marcarBorrado(id){
  if(id) db.borrados[id] = Date.now();
}

/** Con qué se reconoce el mismo elemento en los dos lados. Los nombres se
    comparan por texto: dos dispositivos pueden agregar "Juan" por separado y
    cada uno le pone un id distinto. */
function claveItem(item, lista){
  if(lista !== 'registros') return norm(item.nombre);
  return item.id ||
    JSON.stringify([item.fecha, item.empleado, item.actividad, item.casa, item.horas, item.creado]);
}

/** Huella de unos datos, sin importar el orden: dice si el bin ya tiene
    exactamente esto o si hace falta subirlo. */
function huella(datos){
  const listas = LISTAS.map(lista =>
    (Array.isArray(datos[lista]) ? datos[lista] : [])
      .filter(i => i && typeof i === 'object')
      .map(i => claveItem(i, lista))
      .sort().join('|'));
  return listas.join('#') + '#' + Object.keys(lapidas(datos.borrados)).sort().join('|');
}

/** Junta lo de este dispositivo con lo del bin en vez de reemplazarlo: así dos
    dispositivos que registraron a la vez no se borran las horas entre ellos.
    Algo desaparece solo si alguien lo borró de verdad y quedó su lápida. */
function fusionar(remoto){
  if(!remoto || typeof remoto !== 'object') return null;

  const antes    = huella(datosActuales());
  const borrados = Object.assign(lapidas(remoto.borrados), lapidas(db.borrados));
  const juntas   = {};

  for(const lista of LISTAS){
    const mapa = new Map();
    const meter = item => {
      if(!item || typeof item !== 'object') return;
      if(item.id && borrados[item.id]) return;
      const clave  = claveItem(item, lista);
      const previo = mapa.get(clave);
      // Si está en los dos lados queda uno solo, y el mismo en todos los
      // dispositivos: el de id más bajo.
      if(!previo || String(item.id) < String(previo.id)) mapa.set(clave, item);
    };
    (Array.isArray(remoto[lista]) ? remoto[lista] : []).forEach(meter);
    db[lista].forEach(meter);
    juntas[lista] = Array.from(mapa.values());
  }

  juntas.registros.sort((a, b) =>
    String(a.creado || '').localeCompare(String(b.creado || '')) ||
    String(a.id || '').localeCompare(String(b.id || '')));

  for(const lista of ['empleados', 'actividades', 'casas']){
    juntas[lista].sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { numeric: true }));
  }

  for(const lista of LISTAS) db[lista] = juntas[lista];
  db.borrados = borrados;

  const cambioAqui = huella(datosActuales()) !== antes;
  if(cambioAqui){
    guardarLocal();
    pintarConfig();
    pintarRegistro();
    if(!vistas.horas.hidden) pintarHoras();
  }
  return { cambioAqui, faltaSubir: huella(datosActuales()) !== huella(remoto) };
}

/* Dos pestañas del mismo navegador comparten el localStorage. Si en la otra se
   registran horas, aquí se recogen: si no, el siguiente cambio las pisaría. */
window.addEventListener('storage', e => {
  // Los turnos abiertos no se fusionan con nada: son una lista de este navegador
  // y basta con releerla, no vaya a ser que una pestaña pise la otra.
  if(e.key === CLAVE_TURNOS){ turnos = leerTurnos(); pintarTurnos(); return; }
  if(e.key !== CLAVE || !e.newValue) return;
  try{ fusionar(JSON.parse(e.newValue)); }catch(err){}
});

/* ---------------- Utilidades ---------------- */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** Normaliza texto: sin acentos, minúsculas, sin espacios extra. */
function norm(txt){
  return String(txt ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

function escapar(txt){
  return String(txt ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

/** Redondea a la media hora más cercana (evita decimales raros). */
function aMediaHora(n){
  return Math.round(Number(n) * 2) / 2;
}

/** Muestra las horas con coma: 1 -> "1", 1.5 -> "1,5". */
function fmtHoras(n){
  const v = aMediaHora(n);
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}

function nuevoId(){
  const uuid = window.crypto && window.crypto.randomUUID && window.crypto.randomUUID();
  return uuid || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

function fechaHoy(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Solo la primera letra en mayúscula ("lunes, 27 de julio" -> "Lunes, 27 de julio"). */
function capitalizar(txt){
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : txt;
}

function fechaLarga(iso){
  const [a, m, d] = String(iso).split('-').map(Number);
  if(!a || !m || !d) return iso || '';
  return capitalizar(new Date(a, m - 1, d).toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long'
  }));
}

function fechaCompleta(iso){
  const [a, m, d] = String(iso).split('-').map(Number);
  if(!a || !m || !d) return iso || '';
  return capitalizar(new Date(a, m - 1, d).toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }));
}

/** Devuelve la fecha ISO desplazada n días. */
function sumarDias(iso, n){
  const [a, m, d] = String(iso).split('-').map(Number);
  const fecha = new Date(a, m - 1, d + n);
  const p = x => String(x).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

/* Horas ya registradas por un empleado en una fecha. */
function totalHoras(empleado, fecha){
  const clave = norm(empleado);
  return db.registros
    .filter(r => r.fecha === fecha && norm(r.empleado) === clave)
    .reduce((suma, r) => suma + Number(r.horas || 0), 0);
}

function registrosDe(empleado, fecha){
  const clave = norm(empleado);
  return db.registros.filter(r => r.fecha === fecha && norm(r.empleado) === clave);
}

/* ============================================================
   Combobox: barra de búsqueda con sugerencias similares
   ============================================================ */

// El mismo corte que usa styles.css para separar el celular del escritorio:
// abajo de eso la lista se abre hacia arriba y hay que medirle el alto.
const ARRIBA = window.matchMedia('(max-width: 699.98px)');
const MINIMO_LISTA = 132;   // px: si arriba no caben ~3 opciones, mejor abrir hacia abajo

class Combobox{
  constructor(raiz, opciones){
    this.raiz    = raiz;
    this.input   = $('.combo-input', raiz);
    this.lista   = $('.combo-list', raiz);
    this.limpiar = $('.combo-clear', raiz);
    this.obtener = opciones.obtener;      // () => [string]
    this.alElegir = opciones.alElegir || (() => {});
    this.valor   = '';                    // valor confirmado (texto exacto de la lista)
    this.activo  = -1;
    this.filtrado = [];

    this.input.addEventListener('input',  () => this.abrir());
    this.input.addEventListener('focus',  () => this.abrir());
    this.input.addEventListener('click',  () => this.abrir());
    this.input.addEventListener('keydown', e => this.teclas(e));
    this.input.addEventListener('blur',   () => setTimeout(() => this.alSalir(), 120));

    this.lista.addEventListener('mousedown', e => {
      const li = e.target.closest('li[data-valor]');
      if(!li) return;
      e.preventDefault();
      this.elegir(li.dataset.valor);
    });

    this.limpiar.addEventListener('mousedown', e => {
      e.preventDefault();
      this.vaciar();
      this.input.focus();
    });
  }

  /* --- estado visible --- */

  pintarEstado(){
    this.raiz.classList.toggle('has-value', this.input.value !== '');
    this.raiz.classList.toggle('is-ok', this.valor !== '');
  }

  vaciar(){
    this.input.value = '';
    this.valor = '';
    this.input.removeAttribute('aria-invalid');
    this.pintarEstado();
    this.cerrar();
    this.alElegir('');
  }

  fijar(valor){
    this.input.value = valor;
    this.valor = valor;
    this.input.removeAttribute('aria-invalid');
    this.pintarEstado();
    this.cerrar();
  }

  elegir(valor){
    this.fijar(valor);
    this.alElegir(valor);
  }

  /* --- desplegable --- */

  abrir(){
    const texto = norm(this.input.value);
    const items = this.obtener();

    // El texto escrito invalida la selección hasta que coincida de nuevo.
    const exacto = items.find(i => norm(i) === texto);
    this.valor = exacto || '';
    this.pintarEstado();

    this.filtrado = texto
      ? items
          .map(i => ({ i, pos: norm(i).indexOf(texto) }))
          .filter(o => o.pos !== -1)
          .sort((a, b) => a.pos - b.pos || a.i.localeCompare(b.i, 'es'))
          .map(o => o.i)
      : items.slice();

    this.activo = this.filtrado.length ? 0 : -1;
    this.pintarLista(texto);
    this.lista.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    Combobox.abierto = this;
    this.ajustarAlto();
  }

  cerrar(){
    this.lista.hidden = true;
    this.activo = -1;
    this.input.setAttribute('aria-expanded', 'false');
    if(Combobox.abierto === this) Combobox.abierto = null;
  }

  /** En el celular la lista se abre hacia arriba (ver styles.css) y está pegada
      al campo por abajo, así que lo que no quepa entre el campo y la barra de
      arriba se iría de la pantalla, y para eso no hay scroll de página que lo
      alcance. Entonces el alto máximo es el espacio que hay ahí, y si sobran
      opciones se scrollean adentro de la lista. Con mouse se abre hacia abajo y
      manda el alto del CSS. */
  ajustarAlto(){
    if(!ARRIBA.matches){
      this.lista.style.maxHeight = '';
      this.raiz.classList.remove('abre-abajo');
      return;
    }
    const barra = $('.topbar').getBoundingClientRect().bottom;
    const campo = this.input.getBoundingClientRect();
    const hueco = Math.round(campo.top - barra - 12);
    // Si el campo quedó tan arriba que no cabe casi nada, esa vez se abre hacia
    // abajo: una lista de 40 px no le sirve a nadie.
    const abajo = hueco < MINIMO_LISTA;
    this.raiz.classList.toggle('abre-abajo', abajo);
    this.lista.style.maxHeight = abajo ? '' : Math.max(0, hueco) + 'px';
  }

  pintarLista(texto){
    if(!this.filtrado.length){
      const total = this.obtener().length;
      this.lista.innerHTML = `<li class="vacio">${
        total ? 'Sin coincidencias' : 'Aún no hay datos en Configuración'
      }</li>`;
      return;
    }
    this.lista.innerHTML = this.filtrado.map((item, idx) => {
      let etiqueta = escapar(item);
      if(texto){
        const pos = norm(item).indexOf(texto);
        if(pos !== -1){
          etiqueta = escapar(item.slice(0, pos)) +
                     '<mark>' + escapar(item.slice(pos, pos + texto.length)) + '</mark>' +
                     escapar(item.slice(pos + texto.length));
        }
      }
      // La etiqueta va dentro de un solo <span>: si no, el <mark> parte el
      // texto en varios nodos y el flex del <li> los separa.
      return `<li role="option" data-valor="${escapar(item)}"
                  class="${idx === this.activo ? 'is-active' : ''}"
                  aria-selected="${idx === this.activo}"><span class="txt">${etiqueta}</span></li>`;
    }).join('');
  }

  mover(paso){
    if(this.lista.hidden) return this.abrir();
    if(!this.filtrado.length) return;
    this.activo = (this.activo + paso + this.filtrado.length) % this.filtrado.length;
    this.pintarLista(norm(this.input.value));
    const li = this.lista.children[this.activo];
    if(li) li.scrollIntoView({ block: 'nearest' });
  }

  teclas(e){
    switch(e.key){
      case 'ArrowDown': e.preventDefault(); this.mover(1); break;
      case 'ArrowUp':   e.preventDefault(); this.mover(-1); break;
      case 'Enter':
        if(!this.lista.hidden && this.activo >= 0 && this.filtrado[this.activo]){
          e.preventDefault();
          this.elegir(this.filtrado[this.activo]);
        }
        break;
      case 'Escape':
        if(!this.lista.hidden){ e.preventDefault(); this.cerrar(); }
        break;
      case 'Tab':
        if(!this.lista.hidden && this.activo >= 0 && this.filtrado[this.activo] && this.input.value){
          this.elegir(this.filtrado[this.activo]);
        }
        break;
    }
  }

  alSalir(){
    this.cerrar();
    if(this.valor) return;                     // ya hay selección válida
    const texto = norm(this.input.value);
    if(!texto){ this.vaciar(); return; }
    // Si lo escrito coincide con un solo elemento, se acepta automáticamente.
    const coincidencias = this.obtener().filter(i => norm(i).indexOf(texto) !== -1);
    const exacto = coincidencias.find(i => norm(i) === texto);
    if(exacto)                       this.elegir(exacto);
    else if(coincidencias.length === 1) this.elegir(coincidencias[0]);
    else this.pintarEstado();
  }
}

/* Cuál lista está abierta (nunca hay dos a la vez), para poder recalcularle el
   alto. Hace falta porque al tocar el campo el teclado del celular aparece
   después: la pantalla se hace más chica y el campo se corre para arriba, así
   que la cuenta hecha al abrir queda vieja. visualViewport es lo único que se
   entera del teclado. */
Combobox.abierto = null;

const reajustarLista = () => { if(Combobox.abierto) Combobox.abierto.ajustarAlto(); };
window.addEventListener('scroll', reajustarLista, { passive: true });
window.addEventListener('resize', reajustarLista);
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', reajustarLista);
  window.visualViewport.addEventListener('scroll', reajustarLista);
}

/* ============================================================
   Referencias del DOM
   ============================================================ */

const vistas   = { registro: $('#view-registro'), horas: $('#view-horas'), config: $('#view-config') };
const form     = $('#form-registro');
const inFecha  = $('#in-fecha');
const selHoras = $('#sel-horas');
const inEntrada = $('#in-entrada');
const inSalida  = $('#in-salida');
const campoReloj = $('#campo-reloj');
const calculo   = $('#horas-calculo');
const inNota   = $('#in-nota');
const cajaNota = $('#nota-caja');
const btnNota  = $('#btn-nota');
const hint     = $('#restantes-hint');
const btnReg   = $('#btn-registrar');
const btnTurno = $('#btn-turno');
const cajaTurnos = $('#turnos');
const banner   = $('#banner-completo');
const bannerSub = $('#banner-sub');
const detalle  = $('#detalle');
const aviso    = $('#aviso-config');
const btnHoy   = $('#dia-hoy');

const combos = {
  empleado:  new Combobox($('#combo-empleado'),  { obtener: () => db.empleados.map(e => e.nombre),   alElegir: () => pintarRegistro() }),
  actividad: new Combobox($('#combo-actividad'), { obtener: () => db.actividades.map(a => a.nombre) }),
  casa:      new Combobox($('#combo-casa'),      { obtener: () => db.casas.map(c => c.nombre) })
};

/* ============================================================
   Navegación entre vistas
   ============================================================ */

/* Configuración ya no es una pestaña: se abre desde el menú de la barra,
   así que puede quedar visible sin ninguna pestaña marcada. */
function verVista(nombre){
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === nombre));
  Object.entries(vistas).forEach(([k, el]) => { el.hidden = k !== nombre; });
  if(nombre === 'horas') pintarHoras();
}

$$('.tab').forEach(t => t.addEventListener('click', () => verVista(t.dataset.view)));
document.addEventListener('click', e => {
  const ir = e.target.closest('[data-goto]');
  if(!ir) return;
  verVista(ir.dataset.goto);
  // Desde el indicador de la barra se abre el panel de sincronización de una vez.
  if(ir.id === 'nube-chip'){
    const panel = $('#nube-panel');
    if(panel){
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
});

/* ---------------- Menú de la cuenta: Configuración y Salir ----------------
   Se abre con clic o con toque (nunca al pasar el mouse por encima) y se
   cierra al elegir una opción, al tocar fuera o con la tecla Escape. */

const menuCuenta = $('#menu-cuenta');
const menuBtn    = $('#menu-cuenta-btn');
const menuLista  = $('#menu-cuenta-lista');

function cerrarMenu(){
  menuLista.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}

menuBtn.addEventListener('click', e => {
  e.stopPropagation();                       // si no, el clic cerraría el menú al instante
  const abierto = !menuLista.hidden;
  menuLista.hidden = abierto;
  menuBtn.setAttribute('aria-expanded', String(!abierto));
});

menuLista.addEventListener('click', () => cerrarMenu());
document.addEventListener('click', e => { if(!menuCuenta.contains(e.target)) cerrarMenu(); });
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && !menuLista.hidden){ cerrarMenu(); menuBtn.focus(); }
});

/* ============================================================
   Configuración: empleados, actividades y casas
   ============================================================ */

const ETIQUETAS = {
  empleados:   { art: 'Ese empleado',  vacio: 'Sin empleados registrados' },
  actividades: { art: 'Esa actividad', vacio: 'Sin actividades registradas' },
  casas:       { art: 'Esa casa',      vacio: 'Sin casas registradas' }
};

$$('.alta').forEach(f => {
  f.addEventListener('submit', e => {
    e.preventDefault();
    const tipo  = f.dataset.alta;
    const input = $('.input', f);
    const err   = $(`[data-error-alta="${tipo}"]`);
    const texto = input.value.trim().replace(/\s+/g, ' ');

    const fallar = msg => {
      err.textContent = msg; err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    };

    if(!texto) return fallar(`Escribe un nombre para agregar.`);
    if(db[tipo].some(i => norm(i.nombre) === norm(texto)))
      return fallar(`${ETIQUETAS[tipo].art} ya está en la lista.`);

    db[tipo].push({ id: nuevoId(), nombre: texto });
    db[tipo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
    guardar();

    input.value = '';
    input.removeAttribute('aria-invalid');
    err.hidden = true;
    pintarConfig();
    pintarRegistro();
    input.focus();
  });
});

$$('.lista').forEach(ul => {
  ul.addEventListener('click', e => {
    const btn = e.target.closest('[data-borrar]');
    if(!btn) return;
    const tipo = ul.dataset.lista;
    const item = db[tipo].find(i => i.id === btn.dataset.borrar);
    if(!item) return;
    if(!confirm(`¿Eliminar "${item.nombre}" de la lista de ${tipo}?\n\nLas horas ya registradas no se borran.`)) return;

    db[tipo] = db[tipo].filter(i => i.id !== item.id);
    marcarBorrado(item.id);
    guardar();

    // Si el valor eliminado estaba seleccionado en el formulario, se limpia.
    const mapa = { empleados: 'empleado', actividades: 'actividad', casas: 'casa' };
    const combo = combos[mapa[tipo]];
    if(combo && norm(combo.valor) === norm(item.nombre)) combo.vaciar();

    pintarConfig();
    pintarRegistro();
  });
});

function pintarConfig(){
  for(const tipo of ['empleados', 'actividades', 'casas']){
    const ul = $(`[data-lista="${tipo}"]`);
    $(`#conteo-${tipo}`).textContent = db[tipo].length;
    ul.innerHTML = db[tipo].length
      ? db[tipo].map(i => `
          <li>
            <span>${escapar(i.nombre)}</span>
            <button type="button" class="icon-btn" data-borrar="${i.id}"
                    title="Eliminar" aria-label="Eliminar ${escapar(i.nombre)}">&times;</button>
          </li>`).join('')
      : `<li class="vacio">${ETIQUETAS[tipo].vacio}</li>`;
  }
}

/* ============================================================
   Registro de horas
   ============================================================ */

function mostrarError(campo, msg){
  const p = $(`[data-error="${campo}"]`);
  p.textContent = msg;
  p.hidden = false;
}

function limpiarErrores(){
  $$('[data-error]').forEach(p => { p.hidden = true; });
  Object.values(combos).forEach(c => c.input.removeAttribute('aria-invalid'));
  [selHoras, inEntrada, inSalida].forEach(el => el.removeAttribute('aria-invalid'));
}

/** Opciones de 0,5 en 0,5 hasta lo que quede libre del día. Pasada la jornada la
    lista sigue: las horas extra se registran igual. Solo se corta cuando el día
    ya no da para más, y ahí el desplegable queda desactivado. */
function pintarOpcionesHoras(libre){
  const previo = selHoras.value;
  let html = '<option value="">Seleccionar horas…</option>';
  for(let i = 1; i <= Math.min(TOPE_DIA, libre) / PASO; i++){
    const h = i * PASO;
    html += `<option value="${h}">${fmtHoras(h)} ${h === 1 ? 'hora' : 'horas'}</option>`;
  }
  selHoras.innerHTML = html;
  selHoras.value = (previo && Number(previo) <= libre) ? previo : '';
  selHoras.disabled = libre <= 0;
}

/* ---------------- Cantidad de horas, o entrada y salida ----------------
   Dos maneras de decir lo mismo: las dos terminan en un número de horas
   trabajadas y se guarda ese número. El reloj solo lo calcula. Como toda la app
   va de media en media hora, redondea, y el renglón de abajo dice qué va a
   quedar registrado: así nadie se entera después de que sus 5 h 25 min quedaron
   en 5,5.

   La hora de almuerzo no se descuenta: va adentro de las horas del día, así que
   de 06:00 a 18:00 se registran 12. Debajo del campo hay un recordatorio que lo
   dice, y es solo eso: un texto, no cambia ninguna cuenta. */

let modoHoras = 'cantidad';
const btnsModo = $$('.modo-btn');

/** Minutos desde medianoche de un "07:30". null si está vacío o a medias. */
function aMinutos(txt){
  const partes = String(txt || '').split(':');
  if(partes.length !== 2) return null;
  const h = Number(partes[0]), m = Number(partes[1]);
  if(!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** "325" -> "5 h 25 min", para poder comparar con lo que se va a registrar. */
function fmtDuracion(minutos){
  const h = Math.floor(minutos / 60), m = minutos % 60;
  if(!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Lo que dice el reloj: { falta } si está incompleto, { alReves } si no cuadra.
    Un turno que cruza la medianoche se toma por error de tipeo: es mucho más
    común que un turno de noche, y así se atrapa antes de guardarlo.
    minutos es el rango; horas, ese mismo rango redondeado a la media hora. */
function horasDelReloj(){
  const entrada = aMinutos(inEntrada.value);
  const salida  = aMinutos(inSalida.value);
  if(entrada === null || salida === null) return { falta: true };
  if(salida <= entrada) return { alReves: true };
  const minutos = salida - entrada;
  return { minutos, horas: aMediaHora(minutos / 60) };
}

/** Las horas que se van a registrar según el modo. 0 si todavía no se sabe. */
function horasElegidas(){
  if(modoHoras === 'cantidad') return selHoras.value ? aMediaHora(selHoras.value) : 0;
  return horasDelReloj().horas || 0;
}

/** El renglón que avisa cuánto va a quedar registrado; solo con el reloj. */
function pintarCalculo(){
  if(modoHoras !== 'reloj'){ calculo.hidden = true; return; }
  calculo.hidden = false;
  const r = horasDelReloj();
  if(r.falta)    { calculo.textContent = 'Pon la hora de entrada y la de salida.'; return; }
  if(r.alReves)  { calculo.textContent = 'La salida tiene que ser después de la entrada.'; return; }
  if(!r.horas)   { calculo.textContent = 'Ese rango no llega a la media hora.'; return; }
  // Si hubo que redondear se muestran los dos números, para que el cambio se vea
  // antes de guardar y no después.
  calculo.innerHTML = (r.minutos === r.horas * 60 ? '' : `${fmtDuracion(r.minutos)} · `) +
                      `se registran <strong>${fmtHoras(r.horas)} h</strong>`;
}

function setModoHoras(modo){
  modoHoras = modo === 'reloj' ? 'reloj' : 'cantidad';
  btnsModo.forEach(b => {
    const puesto = b.dataset.modo === modoHoras;
    b.classList.toggle('is-on', puesto);
    b.setAttribute('aria-pressed', String(puesto));
  });
  selHoras.hidden   = modoHoras !== 'cantidad';
  campoReloj.hidden = modoHoras !== 'reloj';
  // Un turno se abre con la hora de entrada, así que el botón solo tiene sentido
  // con el reloj a la vista.
  btnTurno.hidden   = modoHoras !== 'reloj';
  // Se recuerda para la próxima vez: quien usa el reloj lo usa siempre.
  try{ localStorage.setItem(CLAVE_MODO, modoHoras); }catch(e){}
  pintarCalculo();
}

btnsModo.forEach(b => b.addEventListener('click', () => {
  limpiarErrores();
  setModoHoras(b.dataset.modo);
}));

[inEntrada, inSalida].forEach(el => el.addEventListener('input', pintarCalculo));

setModoHoras(leerCrudo(CLAVE_MODO));

/* ---------------- Horas extra ----------------
   Para quién se pidió el formulario de horas extra: empleado y fecha. Guardar la
   pareja en vez de un sí/no lo hace caducar solo — al cambiar de empleado o de
   día la llave ya no coincide y el formulario se vuelve a guardar. */
let extraPara = '';
const clavePara = (empleado, fecha) => `${norm(empleado)}|${fecha}`;

function pintarRegistro(){
  const fecha    = inFecha.value || fechaHoy();
  const empleado = combos.empleado.valor;
  const listo    = db.empleados.length && db.actividades.length && db.casas.length;
  const esHoy    = fecha === fechaHoy();

  // Barra de fecha
  $('#fecha-larga').innerHTML = escapar(fechaCompleta(fecha)) +
    (esHoy ? '<span class="chip-hoy">Hoy</span>' : '');
  btnHoy.disabled = esHoy;

  aviso.hidden = !!listo;
  form.hidden  = !listo;

  const total    = empleado ? totalHoras(empleado, fecha) : 0;
  const faltan   = Math.max(0, JORNADA - total);
  const libre    = Math.max(0, TOPE_DIA - total);       // lo que queda del día
  const cumplida = !!empleado && total >= JORNADA;
  const extra    = cumplida && extraPara === clavePara(empleado, fecha);

  // La lista normal llega hasta la jornada, que es lo de siempre; estirarla a las
  // 24 h del día solo tiene sentido cuando se pidieron horas extra.
  pintarOpcionesHoras(empleado ? (extra ? libre : Math.min(libre, JORNADA)) : JORNADA);

  // Banner de jornada cumplida
  banner.hidden = !cumplida;
  if(cumplida){
    bannerSub.textContent = `${empleado} — ${fechaLarga(fecha)}`;
  }

  // Cumplida la jornada el formulario se guarda, y vuelve solo si se pidieron
  // horas extra: así nadie le agrega horas a un día terminado por descuido.
  if(listo) form.hidden = cumplida && !extra;

  // Pista de horas
  if(!empleado){
    hint.textContent = 'Selecciona un empleado para ver sus horas del día.';
  }else if(libre <= 0){
    hint.innerHTML = `${escapar(empleado)} ya tiene <strong>${fmtHoras(total)} h</strong> ` +
                     `en esta fecha: el día no da para más.`;
  }else if(extra){
    hint.innerHTML = `${escapar(empleado)}: <strong>${fmtHoras(total)} h</strong> registradas · ` +
                     `lo que anotes ahora es <strong>hora extra</strong>.`;
  }else if(total === 0){
    hint.innerHTML = `${escapar(empleado)}: sin horas en esta fecha · ` +
                     `la jornada es de <strong>${JORNADA} h</strong>.`;
  }else if(faltan > 0){
    hint.innerHTML = `${escapar(empleado)}: <strong>${fmtHoras(total)} h</strong> registradas · ` +
                     `faltan <strong>${fmtHoras(faltan)} h</strong> para las ${JORNADA}.`;
  }else{
    hint.textContent = '';
  }

  // El turno se abre igual que se registra: sin empleado no hay a quién, y con el
  // día lleno no habría dónde meter las horas al cerrarlo.
  btnReg.disabled = btnTurno.disabled = !empleado || libre <= 0;

  pintarTurnos();
  pintarDetalle(empleado, fecha, total);
  pintarResumen(fecha);
}

/** El rango del reloj que va debajo de las horas, si el registro se hizo así.
    Los registros de cuando la app descontaba el almuerzo traen ese descuento y
    se sigue mostrando: si no, en esas filas las horas no darían con el rango. */
function rangoDelRegistro(r){
  if(!r.entrada || !r.salida) return '';
  const almuerzo = r.almuerzo
    ? ` <span title="Se le descontó ${fmtHoras(r.almuerzo)} h de almuerzo">(−${fmtHoras(r.almuerzo)} h)</span>`
    : '';
  return `<span class="reloj-txt">${escapar(r.entrada)}–${escapar(r.salida)}${almuerzo}</span>`;
}

/** La nota del registro, si tiene. Va debajo de la actividad y no en una columna
    propia: es un texto largo y suelto, y en el celular una columna más no cabe. */
function notaDelRegistro(r){
  const nota = String(r.nota || '').trim();
  return nota ? `<span class="nota-txt">${escapar(nota)}</span>` : '';
}

/** Tabla con nombre, actividad, casa y horas del empleado en esa fecha. */
function pintarDetalle(empleado, fecha, total){
  const filas = empleado ? registrosDe(empleado, fecha) : [];
  detalle.hidden = !empleado || !filas.length;
  if(detalle.hidden) return;

  $('#detalle-nombre').textContent = empleado;
  $('#detalle-fecha').textContent  = fechaLarga(fecha);
  $('#progreso-total').textContent = fmtHoras(total);
  $('#progreso-fill').style.width  = Math.min(100, (total / JORNADA) * 100) + '%';

  // Lo que pasó de la jornada se dice aparte: la barra ya está llena y sola no
  // alcanzaría para contarlo.
  const deMas = total - JORNADA;
  const chipExtra = $('#progreso-extra');
  chipExtra.hidden = deMas <= 0;
  if(deMas > 0) chipExtra.textContent = `+${fmtHoras(deMas)} h extra`;

  $('#detalle-filas').innerHTML = filas.map(r => `
    <tr class="${r.id === ultimoId ? 'nuevo' : ''}">
      <td class="nombre col-nombre" data-label="Nombre">${escapar(r.empleado)}</td>
      <td data-label="Actividad">${escapar(r.actividad)}${notaDelRegistro(r)}</td>
      <td data-label="Casa">${escapar(r.casa)}</td>
      <td class="num" data-label="Horas">
        <span class="num-val">${fmtHoras(r.horas)} h${rangoDelRegistro(r)}</span></td>
      <td class="acc">
        <button type="button" class="icon-btn" data-quitar="${r.id}"
                title="Eliminar registro" aria-label="Eliminar registro">&times;</button>
      </td>
    </tr>`).join('');
}

$('#detalle-filas').addEventListener('click', e => {
  const btn = e.target.closest('[data-quitar]');
  if(!btn) return;
  const reg = db.registros.find(r => r.id === btn.dataset.quitar);
  if(!reg) return;
  if(!confirm(`¿Eliminar el registro de ${fmtHoras(reg.horas)} h (${reg.actividad} · ${reg.casa})?`)) return;
  db.registros = db.registros.filter(r => r.id !== reg.id);
  marcarBorrado(reg.id);
  if(ultimoId === reg.id) ultimoId = null;
  guardar();
  pintarRegistro();
});

/* ---------------- Horas por empleado ----------------
   Sirve para el resumen del día y para la vista Horas. Aparecen todos los
   empleados de Configuración, incluso con 0 horas: si no, quien no registró
   nada quedaría invisible y no se notaría que le faltan horas. */

/** Totales de cada empleado entre dos fechas (las dos incluidas). */
function horasPorEmpleado(desde, hasta){
  const hoy  = fechaHoy();
  const mapa = new Map();

  const entrada = nombre => {
    const clave = norm(nombre);
    if(!mapa.has(clave)) mapa.set(clave, { nombre, horas: 0, dias: new Map() });
    return mapa.get(clave);
  };

  db.empleados.forEach(e => entrada(e.nombre));

  for(const r of db.registros){
    if(r.fecha < desde || r.fecha > hasta) continue;
    const e = entrada(r.empleado);            // también los borrados de la lista
    const h = Number(r.horas || 0);
    e.horas += h;
    e.dias.set(r.fecha, (e.dias.get(r.fecha) || 0) + h);
  }

  const conRegistros  = new Set();
  const sinCompletar  = new Set();

  const lista = Array.from(mapa.values()).map(e => {
    let incompletos = 0;
    for(const [fecha, horas] of e.dias){
      conRegistros.add(fecha);
      // El día de hoy no cuenta como incompleto: la jornada sigue abierta.
      if(fecha < hoy && horas < JORNADA){ incompletos++; sinCompletar.add(fecha); }
    }
    return {
      nombre: e.nombre,
      horas: e.horas,
      horasHoy: e.dias.get(hoy) || 0,
      diasTrabajados:  e.dias.size,
      diasIncompletos: incompletos
    };
  }).sort((a, b) => a.horas - b.horas || a.nombre.localeCompare(b.nombre, 'es'));

  return {
    lista,
    total: lista.reduce((suma, e) => suma + e.horas, 0),
    dias: conRegistros.size,
    diasIncompletos: sinCompletar.size
  };
}

/** Color de la fila: verde completo, rojo si el día ya pasó, tenue si es hoy. */
function estadoJornada(horas, fecha){
  if(horas >= JORNADA) return 'completo';
  return fecha < fechaHoy() ? 'incompleto' : 'pendiente';
}

/** Panel lateral con el avance de todos los empleados del día. */
function pintarResumen(fecha){
  $('#resumen-fecha').textContent = fechaLarga(fecha);
  const items = horasPorEmpleado(fecha, fecha).lista;

  $('#resumen-lista').innerHTML = items.length
    ? items.map(i => `
        <li class="${estadoJornada(i.horas, fecha)}" data-empleado="${escapar(i.nombre)}">
          <div class="resumen-top">
            <span class="resumen-nombre">${escapar(i.nombre)}</span>
            <span class="resumen-horas">${fmtHoras(i.horas)} / ${JORNADA} h</span>
          </div>
          <div class="resumen-mini"><span style="width:${Math.min(100, (i.horas / JORNADA) * 100)}%"></span></div>
        </li>`).join('')
    : `<li class="vacio">Agrega empleados en Configuración</li>`;
}

$('#resumen-lista').addEventListener('click', e => {
  const li = e.target.closest('[data-empleado]');
  if(!li) return;
  combos.empleado.elegir(li.dataset.empleado);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------------- Guardar un registro ---------------- */

form.addEventListener('submit', e => {
  e.preventDefault();
  limpiarErrores();

  const fecha     = inFecha.value || fechaHoy();
  const empleado  = combos.empleado.valor;
  const actividad = combos.actividad.valor;
  const casa      = combos.casa.valor;
  const horas     = horasElegidas();
  const nota      = inNota.value.trim().slice(0, TOPE_NOTA);

  let hayError = false;
  const marcar = (campo, msg, el) => {
    mostrarError(campo, msg);
    el.setAttribute('aria-invalid', 'true');
    if(!hayError) el.focus();
    hayError = true;
  };

  if(!empleado)  marcar('empleado',  'Elige un empleado de la lista.',  combos.empleado.input);
  if(!actividad) marcar('actividad', 'Elige una actividad de la lista.', combos.actividad.input);
  if(!casa)      marcar('casa',      'Elige un número de casa de la lista.', combos.casa.input);
  if(!horas){
    if(modoHoras === 'cantidad'){
      marcar('horas', 'Selecciona la cantidad de horas.', selHoras);
    }else{
      const r = horasDelReloj();
      if(r.falta)   marcar('horas', 'Pon la hora de entrada y la de salida.',
                           inEntrada.value ? inSalida : inEntrada);
      else if(r.alReves) marcar('horas', 'La salida tiene que ser después de la entrada.', inSalida);
      else          marcar('horas', 'Ese rango no llega a la media hora.', inSalida);
    }
  }
  if(hayError) return;

  // Pasarse de la jornada está permitido —son horas extra—; pasarse del día no.
  const yaTiene = totalHoras(empleado, fecha);
  if(horas > TOPE_DIA - yaTiene){
    marcar('horas', `${empleado} ya tiene ${fmtHoras(yaTiene)} h en esta fecha: ` +
                    `no caben ${fmtHoras(horas)} h más en un día.`,
           modoHoras === 'cantidad' ? selHoras : inSalida);
    pintarRegistro();
    return;
  }

  const registro = {
    id: nuevoId(),
    fecha, empleado, actividad, casa, horas,
    creado: new Date().toISOString()
  };
  // Con el reloj se guarda además de dónde salieron esas horas, para verlas.
  if(modoHoras === 'reloj'){
    registro.entrada = inEntrada.value;
    registro.salida  = inSalida.value;
  }
  if(nota) registro.nota = nota;
  db.registros.push(registro);
  ultimoId = registro.id;
  guardar();

  // Se limpian actividad, casa y horas: el menú vuelve a desplegarse
  // para el siguiente registro mientras no se complete la jornada.
  combos.actividad.vaciar();
  combos.casa.vaciar();
  selHoras.value  = '';
  inEntrada.value = '';
  inSalida.value  = '';
  inNota.value    = '';
  verNota(false);
  pintarCalculo();

  pintarRegistro();

  // Si el formulario sigue a la vista (jornada sin cumplir, o horas extra) se
  // sigue anotando ahí; si se guardó, se lleva la vista al banner.
  if(form.hidden){
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }else{
    combos.actividad.input.focus();
  }
});

/* Volver a abrir el formulario con la jornada ya cumplida, para la hora extra. */
$('#btn-horas-extra').addEventListener('click', () => {
  extraPara = clavePara(combos.empleado.valor, inFecha.value || fechaHoy());
  pintarRegistro();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  combos.actividad.input.focus();
});

$('#btn-otro-empleado').addEventListener('click', () => {
  combos.empleado.vaciar();
  ultimoId = null;
  pintarRegistro();
  combos.empleado.input.focus();
});

/* ---------------- La nota ----------------
   Un texto libre para lo que haya que aclarar ("1 h esperando material"). No
   cambia ninguna cuenta: se guarda, se ve en la tabla del día y sale en el Excel.
   Como casi ningún registro necesita una, el campo no ocupa lugar hasta que se
   pide: en el celular el formulario ya es bastante largo. */

function verNota(ver){
  cajaNota.hidden = !ver;
  btnNota.hidden  = ver;
  if(ver) inNota.focus();
}

btnNota.addEventListener('click', () => verNota(true));

/* ---------------- Turnos abiertos ----------------
   Un turno abierto es la entrada de alguien a la que todavía le falta la salida.
   Sirve para anotar a la hora en que la gente llega, sin esperar a que termine la
   jornada. Todavía no es un registro: no suma horas, no sale en el resumen ni en
   el Excel. Al cerrarlo con la hora de salida nace un registro normal, idéntico a
   uno hecho de una sola vez con el reloj.

   Vive aparte de db a propósito. db es lo que se sube a la nube (ver
   datosActuales) y la fusión de allá solo sabe agregar y borrar, nunca modificar:
   un registro guardado a medias y completado después se perdería en la primera
   bajada (ver claveItem). Por eso el turno no es un registro hasta que está
   completo. La contra es que se cierra en el mismo dispositivo donde se abrió. */

let turnos   = [];      // los turnos abiertos de este navegador
let cerrando = null;    // id del turno que tiene el reloj de salida a la vista

/** Los turnos guardados. Se relee antes de cada escritura: con la app abierta en
    dos pestañas, abrir un turno en una y cerrar otro en la otra no se pisan. */
function leerTurnos(){
  try{
    const datos = JSON.parse(leerCrudo(CLAVE_TURNOS) || '[]');
    if(!Array.isArray(datos)) return [];
    return datos.filter(t => t && t.id && t.empleado && t.entrada && t.fecha);
  }catch(e){ return []; }
}

function escribirTurnos(lista){
  turnos = lista;
  try{
    localStorage.setItem(CLAVE_TURNOS, JSON.stringify(lista));
  }catch(e){
    console.warn('No se pudieron guardar los turnos abiertos:', e);
    avisarFallo(true);
  }
}

/** Las horas que daría un turno con esa salida, o el problema que tenga. Es la
    misma cuenta del formulario (horasDelReloj) con la entrada ya fija. */
function horasDelTurno(turno, salida){
  const entra = aMinutos(turno.entrada);
  const sale  = aMinutos(salida);
  if(entra === null || sale === null) return { falta: true };
  if(sale <= entra) return { alReves: true };
  const minutos = sale - entra;
  return { minutos, horas: aMediaHora(minutos / 60) };
}

/** La tira de turnos abiertos. Salen todos, sin importar la fecha que esté
    elegida: uno que quedó abierto ayer tiene que verse hoy o se pierde en
    silencio, y por eso los más viejos van primero.

    Cada turno es una línea, y el reloj de salida aparece solo en el que se está
    cerrando: en el celular, cinco turnos abiertos no pueden ser cinco
    formularios. */
function pintarTurnos(){
  const hoy   = fechaHoy();
  const lista = turnos.slice()
    .sort((a, b) => (a.fecha + a.entrada).localeCompare(b.fecha + b.entrada));

  cajaTurnos.hidden = !lista.length;
  if(!lista.length){ cerrando = null; return; }

  $('#turnos-tag').textContent = lista.length === 1 ? '1 abierto' : `${lista.length} abiertos`;

  $('#turnos-lista').innerHTML = lista.map(t => {
    const viejo   = t.fecha !== hoy;
    const cerrase = cerrando === t.id;
    return `
    <li class="turno${viejo ? ' turno-viejo' : ''}" data-turno="${escapar(t.id)}">
      <div class="turno-top">
        <div class="turno-quien">
          <span class="turno-nombre">${escapar(t.empleado)}</span>
          <span class="turno-sub">${escapar(t.actividad)} · casa ${escapar(t.casa)} ·
            entró <strong>${escapar(t.entrada)}</strong></span>
          ${viejo ? `<span class="turno-dia">Sin cerrar desde el ${escapar(fechaLarga(t.fecha))}</span>` : ''}
        </div>
        <button type="button" class="icon-btn" data-tirar="${escapar(t.id)}"
                title="Descartar turno" aria-label="Descartar turno">&times;</button>
      </div>

      <button type="button" class="btn btn-linea turno-btn" data-abrir="${escapar(t.id)}"
              aria-expanded="${cerrase}">${cerrase ? 'Cancelar' : 'Poner la salida'}</button>

      ${cerrase ? `
      <div class="turno-cierre">
        <div class="field-sub">
          <label for="salida-${escapar(t.id)}">Hora de salida</label>
          <input type="time" id="salida-${escapar(t.id)}" class="input" data-salida>
        </div>
        <div class="field-sub">
          <label for="nota-${escapar(t.id)}">Nota (opcional)</label>
          <input type="text" id="nota-${escapar(t.id)}" class="input" data-nota
                 maxlength="${TOPE_NOTA}" placeholder="Ej.: 1 h esperando material">
        </div>
        <p class="hint" data-calculo hidden></p>
        <p class="error" data-fallo hidden></p>
        <button type="button" class="btn btn-primary" data-listo="${escapar(t.id)}">Cerrar turno</button>
      </div>` : ''}
    </li>`;
  }).join('');
}

/* Abrir un turno pide lo mismo que un registro completo —si falta algo, faltaría
   igual al cerrarlo— menos las horas, que todavía no se saben. */
btnTurno.addEventListener('click', () => {
  limpiarErrores();

  const fecha     = fechaActual();
  const empleado  = combos.empleado.valor;
  const actividad = combos.actividad.valor;
  const casa      = combos.casa.valor;
  const entrada   = inEntrada.value;

  let hayError = false;
  const marcar = (campo, msg, el) => {
    mostrarError(campo, msg);
    el.setAttribute('aria-invalid', 'true');
    if(!hayError) el.focus();
    hayError = true;
  };

  if(!empleado)  marcar('empleado',  'Elige un empleado de la lista.',  combos.empleado.input);
  if(!actividad) marcar('actividad', 'Elige una actividad de la lista.', combos.actividad.input);
  if(!casa)      marcar('casa',      'Elige un número de casa de la lista.', combos.casa.input);
  if(aMinutos(entrada) === null) marcar('horas', 'Pon la hora de entrada.', inEntrada);

  // Nadie está en dos casas a la vez: si ya tiene un turno abierto, lo más
  // probable es que se olvidaran de cerrarlo.
  if(empleado && leerTurnos().some(t => norm(t.empleado) === norm(empleado))){
    marcar('empleado', `${empleado} ya tiene un turno abierto: ciérralo antes de abrir otro.`,
           combos.empleado.input);
  }
  if(hayError) return;

  escribirTurnos([...leerTurnos(), {
    id: nuevoId(),
    fecha, empleado, actividad, casa, entrada,
    abierto: new Date().toISOString()
  }]);

  // Se limpia el empleado y se deja lo demás puesto: lo normal es varias personas
  // llegando a la misma casa a la misma hora, así que lo único que cambia es el
  // nombre. Al revés que en un registro, donde la persona se queda y cambia lo
  // que hizo.
  combos.empleado.vaciar();
  pintarRegistro();
  cajaTurnos.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('#turnos-lista').addEventListener('click', e => {
  const abrir = e.target.closest('[data-abrir]');
  if(abrir){
    cerrando = cerrando === abrir.dataset.abrir ? null : abrir.dataset.abrir;
    pintarTurnos();
    const campo = $('#turnos-lista [data-salida]');
    if(campo) campo.focus();
    return;
  }

  const tirar = e.target.closest('[data-tirar]');
  if(tirar){
    const t = turnos.find(x => x.id === tirar.dataset.tirar);
    if(!t) return;
    if(!confirm(`¿Descartar el turno de ${t.empleado} (entró ${t.entrada})? ` +
                `No queda ninguna hora registrada.`)) return;
    if(cerrando === t.id) cerrando = null;
    escribirTurnos(leerTurnos().filter(x => x.id !== t.id));
    pintarTurnos();
    return;
  }

  const listo = e.target.closest('[data-listo]');
  if(listo) cerrarTurno(listo.dataset.listo);
});

/* Lo que va a quedar registrado, mientras se escribe la salida: el mismo aviso
   que da el formulario, para no enterarse del redondeo después de guardar. */
$('#turnos-lista').addEventListener('input', e => {
  if(!e.target.matches('[data-salida]')) return;
  const li = e.target.closest('[data-turno]');
  const t  = turnos.find(x => x.id === li.dataset.turno);
  if(!t) return;

  const r = horasDelTurno(t, e.target.value);
  let txt = '';
  if(r.alReves)     txt = 'La salida tiene que ser después de la entrada.';
  else if(r.falta)  txt = '';
  else if(!r.horas) txt = 'Ese rango no llega a la media hora.';
  else txt = (r.minutos === r.horas * 60 ? '' : `${fmtDuracion(r.minutos)} · `) +
             `se registran <strong>${fmtHoras(r.horas)} h</strong>`;

  const p = $('[data-calculo]', li);
  p.innerHTML = txt;
  p.hidden = !txt;
});

/** Cierra un turno: de aquí sale un registro normal, con su entrada y su salida.
    Recién ahora se puede revisar todo —que la salida vaya después de la entrada,
    que las horas quepan en el día—, porque hasta ahora no había horas. */
function cerrarTurno(id){
  const li = $(`#turnos-lista [data-turno="${id}"]`);
  const t  = turnos.find(x => x.id === id);
  if(!li || !t) return;

  const aviso  = $('[data-fallo]', li);
  const fallar = msg => { aviso.textContent = msg; aviso.hidden = false; };
  aviso.hidden = true;

  const salida = $('[data-salida]', li).value;
  const r      = horasDelTurno(t, salida);
  if(r.falta)   return fallar('Pon la hora de salida.');
  if(r.alReves) return fallar('La salida tiene que ser después de la entrada. Un turno ' +
                              'que cruza la medianoche hay que anotarlo en dos partes.');
  if(!r.horas)  return fallar('Ese rango no llega a la media hora.');

  // Pasarse de la jornada está permitido —son horas extra—; pasarse del día no.
  const yaTiene = totalHoras(t.empleado, t.fecha);
  if(r.horas > TOPE_DIA - yaTiene){
    return fallar(`${t.empleado} ya tiene ${fmtHoras(yaTiene)} h el ${fechaLarga(t.fecha)}: ` +
                  `no caben ${fmtHoras(r.horas)} h más en un día.`);
  }

  const nota = $('[data-nota]', li).value.trim().slice(0, TOPE_NOTA);

  // El registro nace ahora, pero queda anotado como creado a la hora en que se
  // abrió el turno: las horas extra se reparten por ese orden, y el que vale es el
  // de la jornada, no el de cuándo alguien se acordó de cerrarlo.
  const registro = {
    id: nuevoId(),
    fecha: t.fecha, empleado: t.empleado, actividad: t.actividad, casa: t.casa,
    horas: r.horas,
    creado: t.abierto || new Date().toISOString(),
    entrada: t.entrada,
    salida
  };
  if(nota) registro.nota = nota;

  db.registros.push(registro);
  escribirTurnos(leerTurnos().filter(x => x.id !== id));
  cerrando = null;
  guardar();

  // La vista se va al día y al empleado del turno: el registro que acaba de nacer
  // tiene que poder verse, aunque en pantalla hubiera otra fecha u otra persona.
  inFecha.value = t.fecha;
  if(norm(combos.empleado.valor) !== norm(t.empleado)) combos.empleado.fijar(t.empleado);
  ultimoId = registro.id;
  pintarRegistro();
  detalle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------- Cambio de fecha ---------------- */

/** Fecha seleccionada (si el campo quedó vacío, se usa la de hoy). */
function fechaActual(){
  return inFecha.value || fechaHoy();
}

function cambiarFecha(iso){
  inFecha.value = iso;
  ultimoId = null;
  limpiarErrores();
  pintarRegistro();
}

inFecha.addEventListener('change', () => cambiarFecha(fechaActual()));
$('#dia-prev').addEventListener('click', () => cambiarFecha(sumarDias(fechaActual(), -1)));
$('#dia-next').addEventListener('click', () => cambiarFecha(sumarDias(fechaActual(),  1)));
btnHoy.addEventListener('click',        () => cambiarFecha(fechaHoy()));

/* ============================================================
   Vista Horas: totales por día, semana o mes

   La jornada es por día, así que en semana y mes no se
   usa como meta: se muestran horas, días con registros y cuántos
   días quedaron sin completar.
   ============================================================ */

const selModo      = $('#horas-modo');
const inHorasFecha = $('#horas-fecha');

/** Lunes de la semana de esa fecha. */
function inicioSemana(iso){
  const [a, m, d] = String(iso).split('-').map(Number);
  const dia = (new Date(a, m - 1, d).getDay() + 6) % 7;   // lunes = 0
  return sumarDias(iso, -dia);
}

function primeroDelMes(iso){ return String(iso).slice(0, 8) + '01'; }

function ultimoDelMes(iso){
  const [a, m] = String(iso).split('-').map(Number);
  const dias = new Date(a, m, 0).getDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(dias).padStart(2, '0')}`;
}

/** Fechas ISO: se comparan como texto, así que sirven para filtrar rangos. */
function rangoHoras(modo, iso){
  if(modo === 'semana'){
    const desde = inicioSemana(iso);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  if(modo === 'mes') return { desde: primeroDelMes(iso), hasta: ultimoDelMes(iso) };
  return { desde: iso, hasta: iso };
}

function tituloRango(modo, desde, hasta){
  if(modo === 'dia') return fechaCompleta(desde);
  if(modo === 'mes'){
    const [a, m] = desde.split('-').map(Number);
    return capitalizar(new Date(a, m - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }));
  }
  const corto = iso => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-CR', { day: 'numeric', month: 'long' });
  };
  return `Semana del ${corto(desde)} al ${corto(hasta)} de ${hasta.slice(0, 4)}`;
}

function moverRango(pasos){
  const iso  = inHorasFecha.value || fechaHoy();
  const modo = selModo.value;
  if(modo === 'dia'){
    inHorasFecha.value = sumarDias(iso, pasos);
  }else if(modo === 'semana'){
    inHorasFecha.value = sumarDias(iso, pasos * 7);
  }else{
    const [a, m] = iso.split('-').map(Number);
    const f = new Date(a, m - 1 + pasos, 1);
    inHorasFecha.value = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`;
  }
  pintarHoras();
}

function pintarHoras(){
  const modo  = selModo.value;
  const iso   = inHorasFecha.value || fechaHoy();
  const { desde, hasta } = rangoHoras(modo, iso);
  const datos = horasPorEmpleado(desde, hasta);
  const esDia = modo === 'dia';
  const pasado = desde < fechaHoy();

  $('#horas-titulo').textContent = tituloRango(modo, desde, hasta);
  $('#horas-tag').textContent    = `${fmtHoras(datos.total)} h`;

  const incompletos = esDia
    ? (pasado ? datos.lista.filter(e => e.horas < JORNADA).length : 0)
    : datos.diasIncompletos;

  const conHoras = datos.lista.filter(e => e.horas > 0).length;
  const uno = (n, singular, plural) => (Number(n) === 1 ? singular : plural);

  const cifras = [
    { num: fmtHoras(datos.total), txt: uno(datos.total, 'hora en total', 'horas en total') },
    esDia
      ? { num: conHoras,   txt: uno(conHoras, 'empleado con horas', 'empleados con horas') }
      : { num: datos.dias, txt: uno(datos.dias, 'día con registros', 'días con registros') },
    { num: incompletos,
      txt: esDia
        ? uno(incompletos, 'empleado incompleto', 'empleados incompletos')
        : uno(incompletos, 'día incompleto', 'días incompletos'),
      alerta: incompletos > 0 }
  ];

  $('#horas-cifras').innerHTML = cifras.map(c => `
    <div class="cifra${c.alerta ? ' alerta' : ''}">
      <span class="cifra-num">${escapar(c.num)}</span>
      <span class="cifra-txt">${c.txt}</span>
    </div>`).join('');

  $('#horas-lista').innerHTML = datos.lista.length
    ? datos.lista.map(e => {
        /* Verde solo si no quedó nada pendiente: ni días pasados por debajo del
           límite ni la jornada de hoy a medias. */
        const estado = esDia                             ? estadoJornada(e.horas, desde)
                     : e.diasIncompletos                 ? 'incompleto'
                     : e.horasHoy > 0 && e.horasHoy < JORNADA ? 'pendiente'
                     : e.horas > 0                       ? 'completo'
                     :                                     'pendiente';

        const barra = esDia
          ? `<div class="resumen-mini"><span style="width:${Math.min(100, (e.horas / JORNADA) * 100)}%"></span></div>`
          : '';

        const detalle = esDia ? '' : `
          <p class="resumen-sub">${e.diasTrabajados} ${e.diasTrabajados === 1 ? 'día' : 'días'} con registros${
            e.diasIncompletos ? ` · ${e.diasIncompletos} sin completar las ${JORNADA} h` : ''
          }</p>`;

        return `
          <li class="${estado}">
            <div class="resumen-top">
              <span class="resumen-nombre">${escapar(e.nombre)}</span>
              <span class="resumen-horas">${fmtHoras(e.horas)}${esDia ? ` / ${JORNADA}` : ''} h</span>
            </div>
            ${barra}${detalle}
          </li>`;
      }).join('')
    : `<li class="vacio">Agrega empleados en Configuración</li>`;

  $('#horas-nota').textContent = esDia
    ? `La jornada es de ${JORNADA} h por empleado y por día; de ahí para arriba son horas extra. ` +
      `En días pasados, quien no llegó se marca en rojo.`
    : `Un día incompleto es un día con registros y menos de ${JORNADA} h. El día de hoy no se cuenta.`;

  $('#horas-csv').disabled = !datos.lista.length;
}

/* ---------------- Horas por empleado, actividad y casa ----------------
   El resumen de la pantalla dice cuánto trabajó cada uno; esto dice en qué y en
   dónde se le fueron las horas. Solo se usa en el Excel. */

/** Los registros del rango, cada uno con cuánto de sus horas fue extra.

    "Extra" no es un dato guardado: es lo que pasa de la jornada en un día. Para
    saber a qué registro le toca, dentro de cada día se ordenan por cuándo se
    anotaron —las primeras horas son las normales y lo que sigue es extra—. Ese
    es el mismo orden que impone la app, que cierra el formulario al cumplirse
    la jornada y obliga a apretar "Horas extra" para seguir. Un registro que
    cruce el límite queda partido: una parte normal y otra extra. */
function conHorasExtra(desde, hasta){
  // Agrupados por día y empleado, porque la jornada se cuenta por día. La fecha
  // va primero en la clave: mide siempre igual y así el nombre no la corre.
  const dias = new Map();
  for(const r of db.registros){
    if(r.fecha < desde || r.fecha > hasta) continue;
    const clave = r.fecha + '|' + norm(r.empleado || '');
    if(!dias.has(clave)) dias.set(clave, []);
    dias.get(clave).push(r);
  }

  const salida = [];
  for(const registros of dias.values()){
    registros.sort((a, b) => String(a.creado || '').localeCompare(String(b.creado || '')));

    let lleva = 0;
    for(const r of registros){
      const horas    = Number(r.horas || 0);
      const normales = Math.max(0, Math.min(horas, JORNADA - lleva));
      lleva += horas;
      salida.push({ ...r, extra: horas - normales });
    }
  }

  return salida;
}

/** Cruce empleado × actividad × casa: cuántas horas puso cada uno en cada cosa
    y en cuál casa, cuántas de esas fueron extra y qué notas dejaron.

    La casa va en su propia fila y no junta varias en una celda: así el Excel
    puede filtrar y sumar por casa, que es para lo que sirve tenerla.

    Las notas sí se juntan, porque una fila puede ser la suma de varios registros
    y cada uno pudo traer la suya. Las repetidas van una sola vez: si tres días
    seguidos se esperó material, decirlo tres veces en la misma celda no agrega
    nada. Se separan con "·" y no con ";", que es lo que separa las columnas del
    archivo: una nota que trae un punto y coma no tiene por qué parecer dos. */
function cruceParaExcel(desde, hasta){
  const mapa = new Map();

  for(const r of conHorasExtra(desde, hasta)){
    const empleado  = r.empleado  || '(sin empleado)';
    const actividad = r.actividad || '(sin actividad)';
    const casa      = r.casa      || '(sin casa)';
    const clave     = JSON.stringify([norm(empleado), norm(actividad), norm(casa)]);
    if(!mapa.has(clave)) mapa.set(clave, { empleado, actividad, casa, horas: 0, extra: 0, notas: [] });

    const fila = mapa.get(clave);
    fila.horas += Number(r.horas || 0);
    fila.extra += r.extra;

    const nota = String(r.nota || '').trim();
    if(nota && !fila.notas.includes(nota)) fila.notas.push(nota);
  }

  return Array.from(mapa.values()).sort((a, b) =>
    a.empleado.localeCompare(b.empleado, 'es') ||
    b.horas - a.horas ||
    a.actividad.localeCompare(b.actividad, 'es') ||
    a.casa.localeCompare(b.casa, 'es', { numeric: true }));
}

/* ---------------- Exportar a Excel ----------------
   CSV en UTF-8 con BOM y separador ";": Excel en español lo abre en
   columnas con doble clic y las tildes salen bien. */

function csvCampo(valor){
  const texto = String(valor ?? '');
  return /[;"\n\r]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

function bajarCSV(nombre, filas){
  const texto = '\uFEFF' + ['sep=;', ...filas.map(f => f.map(csvCampo).join(';'))].join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Una sola tabla: cuánto puso cada empleado en cada actividad. Las primeras
   columnas repiten de qué fechas habla la fila, así el archivo se entiende
   solo y se pueden pegar varios uno debajo del otro. */
$('#horas-csv').addEventListener('click', () => {
  const modo  = selModo.value;
  const iso   = inHorasFecha.value || fechaHoy();
  const { desde, hasta } = rangoHoras(modo, iso);
  const esDia = modo === 'dia';

  const colFecha = esDia ? ['Fecha'] : ['Desde', 'Hasta'];
  const valFecha = esDia ? [desde]   : [desde, hasta];

  const cruce = cruceParaExcel(desde, hasta);
  const suma  = campo => cruce.reduce((total, x) => total + x[campo], 0);

  // La columna de extra va siempre, aunque el período no tenga ninguna: sale en
  // blanco. Si apareciera y desapareciera, dos archivos no se podrían pegar uno
  // debajo del otro, que es medio la idea de repetir las fechas en cada fila.
  const extra = h => h > 0 ? fmtHoras(h) : '';

  const filas = [[...colFecha, 'Empleado', 'Actividad', 'Casa', 'Horas', 'Horas extra', 'Nota']];
  cruce.forEach(x => filas.push([...valFecha, x.empleado, x.actividad, x.casa,
                                 fmtHoras(x.horas), extra(x.extra), x.notas.join(' · ')]));
  filas.push([...valFecha.map(() => ''), 'TOTAL', '', '',
              fmtHoras(suma('horas')), extra(suma('extra')), '']);

  const sufijo = modo === 'dia'   ? desde
               : modo === 'mes'   ? desde.slice(0, 7)
               : `semana-${desde}`;
  bajarCSV(`horas-${sufijo}.csv`, filas);
});

selModo.addEventListener('change', pintarHoras);
inHorasFecha.addEventListener('change', pintarHoras);
$('#horas-prev').addEventListener('click', () => moverRango(-1));
$('#horas-next').addEventListener('click', () => moverRango(1));

/* ============================================================
   Arranque
   ============================================================ */

cargar();
turnos = leerTurnos();
// Los textos que dicen las horas de la jornada salen de JORNADA, para que no se contradigan
// con él si algún día cambia.
$('#banner-titulo').textContent  = `${JORNADA} horas cumplidas`;
$('#progreso-limite').textContent = `/ ${JORNADA} h`;
$('#nota-almuerzo').textContent  = `Dentro de las ${JORNADA} h va la hora de almuerzo.`;
inNota.maxLength = TOPE_NOTA;
inFecha.value      = fechaHoy();
inHorasFecha.value = fechaHoy();
pintarConfig();
pintarRegistro();
