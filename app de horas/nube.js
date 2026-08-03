/* ============================================================
   Registro de Horas — sincronización con jsonbin.io

   Guarda empleados, actividades, casas y registros en un bin de
   jsonbin.io para poder verlos desde otro dispositivo. El acceso
   (usuario y contraseña) NO se sincroniza: es de cada dispositivo.

   Plan gratis de jsonbin: 10.000 peticiones y 100 KB por bin. Por
   eso los cambios seguidos se agrupan en una sola subida.

   Si dos dispositivos editan a la vez no gana ninguno: cada
   sincronización baja el bin, lo junta con lo de aquí (fusionar,
   en app.js) y sube el resultado. Lo registrado en un lado no
   borra lo del otro.
   ============================================================ */
'use strict';

(function(){

const API        = 'https://api.jsonbin.io/v3/b';
const CLAVE_CFG  = 'registroHoras.nube.v1';
const CLAVE_PEND = 'registroHoras.nube.pendiente';
const CLAVE_OFF  = 'registroHoras.nube.apagada';   // se presionó Desconectar a propósito

/* Bin y clave de la empresa, iguales en todos los dispositivos: los campos de
   Configuración aparecen llenos y solo hay que presionar "Conectar".

   OJO: la clave viaja al navegador de cualquiera que abra la app, así que
   quien tenga la dirección puede leer y sobrescribir este bin. Es una decisión
   tomada a cambio de no configurar nada en cada dispositivo. Para limitar el
   daño, la Access Key no debería tener el permiso delete, y si se filtra se
   regenera en jsonbin.io → API Keys y se cambia esta línea. */
const BIN_FIJO   = '6a691979da38895dfe9d35dc';
const CLAVE_FIJA = '$2a$10$whh4ymGI3tUrYHWg81LyxuyCq4J0I0d1d6/g33Wx4eaXjcbmdgEgC';

const RETRASO    = 2000;    // ms de espera antes de subir (agrupa cambios)
const REINTENTO  = 20000;   // ms antes de volver a intentar tras un fallo de red
const MAX_REINTENTOS = 5;   // después se espera a que vuelva la red o a otro cambio
const TOPE_KB    = 100;     // límite del plan gratis
const AVISO_KB   = 85;      // desde aquí se avisa que queda poco

/* Revisión automática de la nube. Ojo con el plan gratis de jsonbin: son
   10.000 peticiones por mes, y revisar cada 10 s son 360 por hora. Por eso
   solo se revisa con la pestaña a la vista y mientras alguien esté usando la
   app; una pestaña olvidada no gasta nada. Subir a 30000 o 60000 alcanza para
   muchos más días si el mes queda corto. */
const REFRESCO    = 10000;          // ms entre revisiones
const INACTIVIDAD = 3 * 60 * 1000;  // sin tocar nada, se dejan de hacer revisiones

const q = (sel, ctx = document) => ctx.querySelector(sel);

let cfg          = { binId: '', clave: '', tipo: 'access' };  // tipo: 'access' o 'master'
let temporizador = null;
let reloj        = null;    // revisiones cada REFRESCO
let ultimoToque  = 0;       // última señal de que alguien está usando la app
let reintentos   = 0;
let subiendo     = false;   // hay un PUT en curso
let sincronizando = false;  // hay un ciclo bajar-fusionar-subir en curso
let pendiente    = false;   // hay cambios locales sin subir
let abierta      = false;   // sesión iniciada
let estado       = 'apagada';
let mensaje      = '';
let ultimaHora   = '';

/* ============================================================
   Configuración guardada en este dispositivo
   ============================================================ */

function leerCfg(){
  try{
    const c = JSON.parse(localStorage.getItem(CLAVE_CFG) || 'null');
    if(c && typeof c.binId === 'string' && typeof c.clave === 'string'){
      return {
        binId: c.binId.trim(),
        clave: c.clave.trim(),
        tipo:  c.tipo === 'master' ? 'master' : 'access'   // las cfg viejas eran Access Key
      };
    }
  }catch(e){}
  return { binId: '', clave: '', tipo: 'access' };
}

function guardarCfg(){
  try{ localStorage.setItem(CLAVE_CFG, JSON.stringify(cfg)); }catch(e){}
}

function activa(){ return !!(cfg.binId && cfg.clave); }

/* Desconectar es a propósito y tiene que aguantar el cierre de la pestaña:
   si no, al recargar volvería a conectarse solo. */
function apagada(){
  try{ return localStorage.getItem(CLAVE_OFF) === '1'; }catch(e){ return false; }
}

function marcarApagada(valor){
  try{
    if(valor) localStorage.setItem(CLAVE_OFF, '1');
    else      localStorage.removeItem(CLAVE_OFF);
  }catch(e){}
}

function marcarPendiente(valor){
  pendiente = valor;
  try{
    if(valor) localStorage.setItem(CLAVE_PEND, '1');
    else      localStorage.removeItem(CLAVE_PEND);
  }catch(e){}
}

/* ============================================================
   Estado visible
   ============================================================ */

const ETIQUETA = {
  apagada:  'Apagada',
  ok:       'Al día',
  subiendo: 'Guardando…',
  bajando:  'Buscando…',
  sinred:   'Sin conexión',
  error:    'Error'
};

function fijarEstado(nuevo, texto){
  estado  = nuevo;
  mensaje = texto || '';
  // Solo las sincronizaciones de verdad traen mensaje: esas marcan la hora.
  if(nuevo === 'ok' && texto) ultimaHora = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  pintarEstado();
}

function pintarEstado(){
  const chip  = q('#nube-chip');
  const tag   = q('#nube-tag');
  const error = q('#nube-error');
  const info  = q('#nube-info');

  const etiqueta = ETIQUETA[estado] || estado;

  chip.hidden = !activa();
  chip.dataset.estado = estado;
  chip.setAttribute('aria-label', 'Sincronización: ' + etiqueta + (mensaje ? '. ' + mensaje : ''));
  chip.title = chip.getAttribute('aria-label');
  q('#nube-chip-texto').textContent = etiqueta;

  tag.textContent   = etiqueta;
  tag.dataset.estado = estado;

  const esFallo = estado === 'error' || estado === 'sinred';
  error.textContent = esFallo ? mensaje : '';
  error.hidden      = !esFallo || !mensaje;

  q('#nube-desconectar').hidden = !activa();
  q('#nube-ahora').hidden       = !activa();
  q('#nube-conectar').hidden    = activa();

  // Peso de los datos: el bin del plan gratis admite 100 KB.
  const partes = [];
  if(activa()){
    const kb = pesoKB();
    partes.push(`Espacio usado: ${kb} KB de ${TOPE_KB} KB.`);
    if(kb >= AVISO_KB) partes.push('Queda poco: conviene archivar los meses viejos.');
    if(!esFallo && mensaje) partes.push(mensaje);
    if(estado === 'ok' && ultimaHora) partes.push(`Última sincronización: ${ultimaHora}`);
    if(pendiente && estado !== 'subiendo') partes.push('Hay cambios sin subir.');
  }else{
    partes.push('Sin conectar: los datos se guardan solo en este navegador.');
  }
  info.textContent = partes.join(' ');
}

function pesoKB(){
  try{ return Math.round(JSON.stringify(datosActuales()).length / 1024 * 10) / 10; }
  catch(e){ return 0; }
}

/* ============================================================
   Llamadas a jsonbin
   ============================================================ */

/* jsonbin recibe la Access Key y el Master Key en encabezados distintos. */
function cabecera(){
  return cfg.tipo === 'master' ? { 'X-Master-Key': cfg.clave } : { 'X-Access-Key': cfg.clave };
}

/** Prueba la clave como Access Key y, si jsonbin la rechaza, como Master Key.
    El tipo que funcione queda en cfg.tipo para no gastar peticiones de más
    en las siguientes subidas y bajadas. */
async function conLaClave(hacer){
  let fallo;
  for(const tipo of ['access', 'master']){
    cfg.tipo = tipo;
    try{
      return await hacer();
    }catch(e){
      fallo = e;
      if(e.status === 401 || e.status === 403) continue;   // quizá es del otro tipo
      throw e;
    }
  }
  throw fallo;
}

async function pedir(metodo, cuerpo){
  const opciones = { method: metodo, headers: cabecera() };

  if(metodo === 'GET'){
    opciones.headers['X-Bin-Meta'] = 'false';    // devuelve los datos sin envoltorio
  }
  if(cuerpo !== undefined){
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
    opciones.keepalive = true;                   // sobrevive al cerrar la pestaña
  }

  const url = metodo === 'GET' ? `${API}/${cfg.binId}/latest` : `${API}/${cfg.binId}`;
  const respuesta = await fetch(url, opciones);
  const texto = await respuesta.text();

  let datos = null;
  try{ datos = texto ? JSON.parse(texto) : null; }catch(e){}

  if(!respuesta.ok){
    const err = new Error((datos && datos.message) || `Error ${respuesta.status}`);
    err.status = respuesta.status;
    throw err;
  }
  return datos;
}

/** Muestra el fallo y dice si vale la pena reintentar solo.
    Con clave o bin mal puestos no se reintenta: gastaría peticiones
    del plan gratis sin arreglar nada; hace falta corregir los datos. */
function fijarFallo(e){
  if(!navigator.onLine || e instanceof TypeError){
    fijarEstado('sinred', 'Sin conexión. Los cambios quedaron guardados aquí y se subirán al volver.');
    return true;
  }
  if(e.status === 401 || e.status === 403){
    fijarEstado('error', 'jsonbin rechazó la clave. Revisa que esté completa y que tenga los ' +
                         'permisos read y update (y create para crear el bin).');
  }else if(e.status === 404){
    fijarEstado('error', 'No se encontró ese Bin ID en la cuenta de la Access Key.');
  }else if(e.status === 429){
    fijarEstado('error', 'jsonbin rechazó la petición por exceso de uso. Intenta más tarde.');
  }else if(e.status >= 500){
    fijarEstado('error', 'jsonbin no responde bien en este momento. Se intentará de nuevo.');
    return true;
  }else{
    fijarEstado('error', e.message || 'No se pudo conectar con jsonbin.');
  }
  return false;
}

function programarSubida(retraso){
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { temporizador = null; sincronizar(); },
                            retraso === undefined ? RETRASO : retraso);
}

function programarReintento(){
  if(!pendiente || temporizador || !navigator.onLine) return;
  if(reintentos >= MAX_REINTENTOS) return;   // se retoma al volver la red o al próximo cambio
  reintentos++;
  programarSubida(REINTENTO);
}

/* ---------------- Bajar, fusionar y subir ----------------

   Un solo camino para todo: se baja el bin, se junta con lo que hay aquí y se
   sube el resultado si al bin le faltaba algo. Así una bajada nunca borra un
   registro recién hecho, y una subida nunca borra lo que registró otro
   dispositivo. En modo silencioso (las revisiones automáticas) no se anuncia
   nada cuando no cambió nada: si no, la pantalla parpadearía cada diez
   segundos. */

async function sincronizar(silencioso){
  if(!activa() || sincronizando) return false;
  sincronizando = true;
  clearTimeout(temporizador);
  temporizador = null;
  if(!silencioso) fijarEstado('bajando');

  try{
    const antes  = revLocal();
    const remoto = await pedir('GET');
    const juntado = fusionar(remoto);
    if(!juntado){
      fijarEstado('error', 'El bin no contiene un objeto JSON válido. Debe tener ' +
                           '{"empleados":[],"actividades":[],"casas":[],"registros":[]}.');
      return false;
    }

    // Al bin le falta algo, o se registró algo aquí mientras bajaba.
    if(juntado.faltaSubir || revLocal() !== antes) return await subir();

    marcarPendiente(false);
    reintentos = 0;
    fijarEstado('ok', juntado.cambioAqui ? 'Datos traídos de la nube.'
                    : silencioso         ? '' : 'Todo igual que en la nube.');
    return true;
  }catch(e){
    if(fijarFallo(e)) programarReintento();
    return false;
  }finally{
    sincronizando = false;
  }
}

/** Sube lo que hay aquí tal cual, sin mirar antes el bin: es lo que se hace al
    cerrar la pestaña, cuando no hay tiempo para el ciclo completo. Si el bin
    tenía algo que este dispositivo no vio, no se pierde: sigue guardado en el
    otro dispositivo y la próxima fusión lo devuelve. */
async function subir(){
  if(!activa()) return false;
  if(subiendo){ marcarPendiente(true); return false; }

  clearTimeout(temporizador);
  temporizador = null;
  subiendo = true;
  fijarEstado('subiendo');

  const antes = revLocal();
  const kb    = pesoKB();

  try{
    if(kb > TOPE_KB){
      fijarEstado('error',
        `Los datos pesan ${kb} KB y el bin del plan gratis admite ${TOPE_KB} KB. ` +
        'No se subió nada: hay que archivar registros viejos o pasar al plan Pro.');
      return false;
    }
    await pedir('PUT', datosActuales());
    reintentos = 0;
    if(revLocal() !== antes){
      // Se registró algo mientras subía: queda pendiente y se sube enseguida.
      marcarPendiente(true);
      fijarEstado('subiendo', 'Cambios sin subir…');
      programarSubida();
    }else{
      marcarPendiente(false);
      fijarEstado('ok', 'Guardado en la nube.');
    }
    return true;
  }catch(e){
    if(fijarFallo(e)) programarReintento();
    return false;
  }finally{
    subiendo = false;
  }
}

/* ============================================================
   Revisión automática

   Al abrir el link se sincroniza una vez, y de ahí en adelante
   cada REFRESCO mientras la pestaña esté a la vista y alguien
   esté usando la app.
   ============================================================ */

function tocar(){ ultimoToque = Date.now(); }

function arrancarReloj(){
  if(reloj || !activa()) return;
  reloj = setInterval(revisar, REFRESCO);
}

function pararReloj(){
  clearInterval(reloj);
  reloj = null;
}

function revisar(){
  if(!activa() || !abierta || subiendo || sincronizando) return;
  if(document.visibilityState !== 'visible') return;   // pestaña en segundo plano
  if(!navigator.onLine) return;
  if(Date.now() - ultimoToque > INACTIVIDAD) return;   // pestaña olvidada: no se gastan peticiones
  sincronizar(true);
}

/* Cualquier señal de que la persona está ahí reanuda las revisiones. */
['pointerdown', 'keydown', 'focusin'].forEach(ev => {
  document.addEventListener(ev, tocar, true);
});

/* ============================================================
   Cambios locales
   ============================================================ */

function cambioLocal(){
  if(!activa()) return;
  tocar();
  marcarPendiente(true);
  reintentos = 0;                      // un cambio nuevo merece otra ronda de intentos
  if(!abierta) return;                 // sin sesión no se sube nada
  fijarEstado('subiendo', 'Cambios sin subir…');
  programarSubida();
}

/* ============================================================
   Panel de Configuración

   No hay campos que llenar: el bin y la clave salen de las
   constantes de arriba, iguales en todos los dispositivos. Acá
   solo se conecta, se sincroniza a mano o se desconecta.
   ============================================================ */

const formNube = q('#form-nube');

formNube.addEventListener('submit', async e => {
  e.preventDefault();

  const anterior = cfg;
  cfg = { binId: BIN_FIJO, clave: CLAVE_FIJA, tipo: cfg.tipo || 'access' };

  const btnConectar = q('#nube-conectar');
  btnConectar.disabled = true;
  fijarEstado('bajando');

  try{
    // Con la clave recién probada se hace el ciclo completo a mano: si hay
    // datos en los dos lados no hay que elegir, se juntan.
    const remoto  = await conLaClave(() => pedir('GET'));
    const juntado = fusionar(remoto);
    if(!juntado){
      cfg = anterior;
      fijarEstado('error', 'El bin no contiene un objeto JSON válido. Debe tener ' +
                           '{"empleados":[],"actividades":[],"casas":[],"registros":[]}.');
      return;
    }

    guardarCfg();
    marcarApagada(false);
    tocar();
    arrancarReloj();

    if(juntado.faltaSubir){
      await subir();
    }else{
      marcarPendiente(false);
      fijarEstado('ok', juntado.cambioAqui ? 'Datos traídos de la nube.' : 'Todo igual que en la nube.');
    }

  }catch(e){
    cfg = anterior;
    fijarFallo(e);
  }finally{
    btnConectar.disabled = false;
    pintarEstado();
  }
});

q('#nube-desconectar').addEventListener('click', () => {
  if(!confirm('¿Desconectar la sincronización?\n\nLos datos siguen guardados en este navegador, ' +
              'pero dejan de subirse y de bajarse del bin, también al recargar la página.')) return;
  cfg = { binId: '', clave: '', tipo: 'access' };
  try{ localStorage.removeItem(CLAVE_CFG); }catch(e){}
  marcarApagada(true);
  marcarPendiente(false);
  pararReloj();
  clearTimeout(temporizador);
  temporizador = null;
  fijarEstado('apagada');
});

q('#nube-ahora').addEventListener('click', () => {
  if(!activa()) return;
  tocar();
  sincronizar();
});

/* ============================================================
   Arranque y eventos
   ============================================================ */

document.addEventListener('acceso:abierto', () => {
  abierta = true;
  tocar();
  if(!activa()) return;
  sincronizar();          // primera sincronización al abrir el link
  arrancarReloj();
});

document.addEventListener('acceso:cerrado', () => {
  abierta = false;
  pararReloj();
  clearTimeout(temporizador);
  temporizador = null;
  if(activa() && pendiente) subir();
});

window.addEventListener('online', () => {
  reintentos = 0;
  if(!activa() || !abierta) return;
  sincronizar();
  arrancarReloj();
});

window.addEventListener('offline', () => {
  if(activa()) fijarEstado('sinred', 'Sin conexión. Los cambios quedan guardados aquí.');
});

/* Al esconder la pestaña se sube lo que quede pendiente y se paran las
   revisiones; al volver a ella se mira la nube de una y se reanudan. */
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){
    pararReloj();
    if(activa() && pendiente && !subiendo) subir();
    return;
  }
  tocar();
  if(!activa() || !abierta) return;
  sincronizar(true);
  arrancarReloj();
});

/* En el celular la pestaña a veces se cierra sin pasar por visibilitychange. */
window.addEventListener('pagehide', () => {
  if(activa() && pendiente && !subiendo) subir();
});

cfg = leerCfg();
try{ pendiente = localStorage.getItem(CLAVE_PEND) === '1'; }catch(e){}

/* La sincronización viene encendida: el bin y la clave están en el código, así
   que no hay nada que configurar ni que apretar. Solo queda apagada si alguien
   presionó Desconectar en este navegador. Lo que diga una configuración vieja
   guardada acá no cuenta: manda el código, para que todos los dispositivos
   apunten al mismo bin. */
if(apagada()){
  cfg = { binId: '', clave: '', tipo: 'access' };
}else{
  cfg = { binId: BIN_FIJO, clave: CLAVE_FIJA, tipo: cfg.tipo };
  guardarCfg();
}

q('#nube-bin-texto').textContent = BIN_FIJO;
q('#nube-ritmo').textContent = `cada ${Math.round(REFRESCO / 1000)} segundos`;
fijarEstado(activa() ? (navigator.onLine ? 'ok' : 'sinred') : 'apagada');

window.nube = { cambioLocal, sincronizar, subir, activa };

})();
