/* ============================================================
   Registro de Horas — pantalla de acceso

   La app no tiene servidor: todo vive en este navegador. Por eso
   la contraseña NO se guarda tal cual, solo una huella cifrada
   (hash SHA-256 con sal y varias vueltas). Es un candado local
   para que nadie abra la app y toque los registros de paso; no
   es una protección real frente a alguien con conocimientos
   técnicos y acceso al dispositivo.

   Como no hay servidor ni correo para recuperarla, quien olvide
   la contraseña puede ponerle una nueva desde la misma pantalla
   de acceso, sin perder los registros.

   La sesión se guarda en sessionStorage: al cerrar la ventana
   hay que volver a iniciar sesión.
   ============================================================ */
'use strict';

(function(){

const CLAVE_CUENTA = 'registroHoras.cuenta.v1';
const CLAVE_SESION = 'registroHoras.sesion.v1';
const CLAVE_DATOS  = 'registroHoras.v1';        // datos de la app (solo para el borrado total)

const MIN_USUARIO = 2;
const MIN_CLAVE   = 4;
const VUELTAS     = 60;                         // encarece probar contraseñas a la fuerza

const q = (sel, ctx = document) => ctx.querySelector(sel);

/* ---------------- Guardado de la cuenta ---------------- */

function leerCuenta(){
  try{
    const crudo = localStorage.getItem(CLAVE_CUENTA);
    if(!crudo) return null;
    const c = JSON.parse(crudo);
    return (c && c.usuario && c.sal && c.hash) ? c : null;
  }catch(e){
    return null;
  }
}

function guardarCuenta(cuenta){
  try{
    localStorage.setItem(CLAVE_CUENTA, JSON.stringify(cuenta));
    return true;
  }catch(e){
    console.warn('No se pudo guardar el acceso:', e);
    return false;
  }
}

/* ---------------- Sesión abierta ---------------- */

function leerSesion(){
  try{ return sessionStorage.getItem(CLAVE_SESION); }catch(e){ return null; }
}

function abrirSesion(usuario){
  try{ sessionStorage.setItem(CLAVE_SESION, usuario); }catch(e){}
}

function borrarSesion(){
  try{ sessionStorage.removeItem(CLAVE_SESION); }catch(e){}
}

/* ---------------- Huella de la contraseña ---------------- */

function normal(txt){
  return String(txt ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

function aHex(buffer){
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
}

function nuevaSal(){
  const bytes = new Uint8Array(16);
  if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else for(let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return aHex(bytes);
}

/* Reserva para navegadores sin crypto.subtle. Es más débil que
   SHA-256, así que solo se usa cuando no hay alternativa. */
function hashSimple(texto){
  let h = 0x811c9dc5;
  for(let vuelta = 0; vuelta < 3000; vuelta++){
    const dato = texto + '#' + vuelta;
    for(let i = 0; i < dato.length; i++){
      h = ((h ^ dato.charCodeAt(i)) * 16777619) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

/** Devuelve { algo, hash } o null si el algoritmo pedido no está disponible. */
async function derivar(clave, sal, algo){
  const datos = sal + '::' + clave;

  if(algo === 'simple') return { algo: 'simple', hash: hashSimple(datos) };

  if(algo === 'sha256' || !algo){
    if(window.crypto && window.crypto.subtle){
      try{
        let buf = new TextEncoder().encode(datos);
        for(let i = 0; i < VUELTAS; i++){
          buf = await window.crypto.subtle.digest('SHA-256', buf);
        }
        return { algo: 'sha256', hash: aHex(buf) };
      }catch(e){
        console.warn('crypto.subtle no disponible, se usa el método de reserva:', e);
      }
    }
    // Al crear la cuenta se acepta el método de reserva; al verificar, no
    // (mezclarlos daría huellas distintas y nadie podría entrar).
    if(!algo) return { algo: 'simple', hash: hashSimple(datos) };
  }

  return null;
}

async function coincide(cuenta, clave){
  const r = await derivar(clave, cuenta.sal, cuenta.algo || 'sha256');
  if(!r) return null;                       // no se pudo comprobar
  return r.hash === cuenta.hash;
}

/* ============================================================
   Pantalla de acceso
   ============================================================ */

const pantalla  = q('#pantalla-acceso');
const formAcc   = q('#form-acceso');
const inUsuario = q('#acceso-usuario');
const inClave   = q('#acceso-clave');
const inClave2  = q('#acceso-clave2');
const campoConf = q('#campo-confirmar');
const errAcc    = q('#acceso-error');
const btnAcc    = q('#btn-acceso');
const titulo    = q('#acceso-titulo');
const subtitulo = q('#acceso-sub');
const nota      = q('#acceso-nota');
const ayuda     = q('#acceso-ayuda');

const formReset      = q('#form-restablecer');
const inResUsu       = q('#reset-usuario');
const inResCla       = q('#reset-clave');
const inResCla2      = q('#reset-clave2');
const errReset       = q('#reset-error');
const okReset        = q('#reset-ok');
const btnRestablecer = q('#btn-restablecer');

let modo = 'entrar';     // 'entrar' cuando ya hay cuenta, 'crear' la primera vez

function fallar(msg, campo){
  errAcc.textContent = msg;
  errAcc.hidden = false;
  if(campo){
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
    campo.select && campo.select();
  }
}

function limpiarError(){
  errAcc.hidden = true;
  [inUsuario, inClave, inClave2].forEach(i => i.removeAttribute('aria-invalid'));
}

/* Deja el panel de "¿Olvidaste la contraseña?" como recién abierto. */
function limpiarReset(){
  errReset.hidden = true;
  okReset.hidden  = true;
  inResUsu.value = inResCla.value = inResCla2.value = '';
  [inResUsu, inResCla, inResCla2].forEach(i => i.removeAttribute('aria-invalid'));
}

function prepararPantalla(){
  const cuenta = leerCuenta();
  modo = cuenta ? 'entrar' : 'crear';
  limpiarError();
  limpiarReset();

  if(modo === 'crear'){
    titulo.textContent    = 'Crear acceso';
    subtitulo.textContent = 'Es la primera vez que se abre la app en este navegador. ' +
                            'Elige un usuario y una contraseña para proteger los registros.';
    btnAcc.textContent    = 'Crear acceso y entrar';
    campoConf.hidden      = false;
    ayuda.hidden          = true;
    nota.textContent      = `La contraseña debe tener al menos ${MIN_CLAVE} caracteres. ` +
                            'Anótala en un lugar seguro: si se olvida hay que cambiarla desde ' +
                            'esta misma pantalla.';
    inUsuario.value = '';
    inClave.value   = '';
    inClave2.value  = '';
    inUsuario.focus();
  }else{
    titulo.textContent    = 'Iniciar sesión';
    subtitulo.textContent = 'Ingresa tus datos para abrir la aplicación.';
    btnAcc.textContent    = 'Entrar';
    campoConf.hidden      = true;
    ayuda.hidden          = false;
    ayuda.open            = false;
    nota.textContent      = 'Los datos se guardan solo en este navegador y en este dispositivo.';
    inUsuario.value = cuenta.usuario;
    inClave.value   = '';
    inClave2.value  = '';
    inClave.focus();
  }
}

function abrirApp(usuario){
  q('#sesion-usuario').textContent = usuario;
  q('#cuenta-usuario').textContent = usuario;
  pantalla.hidden = true;
  document.body.classList.remove('bloqueado');

  inClave.value  = '';
  inClave2.value = '';

  // Si la app ya se cargó, el cursor arranca en el primer campo útil.
  try{
    if(typeof combos !== 'undefined' && combos.empleado &&
       window.matchMedia('(min-width: 700px)').matches){
      combos.empleado.input.focus();
    }
  }catch(e){ /* la app aún no está lista: no pasa nada */ }

  // La sincronización con la nube arranca solo con la sesión abierta.
  document.dispatchEvent(new CustomEvent('acceso:abierto', { detail: { usuario } }));
}

function cerrarApp(){
  borrarSesion();
  document.dispatchEvent(new CustomEvent('acceso:cerrado'));
  document.body.classList.add('bloqueado');
  pantalla.hidden = false;
  window.scrollTo({ top: 0 });
  prepararPantalla();
}

formAcc.addEventListener('submit', async e => {
  e.preventDefault();
  limpiarError();

  const usuario = inUsuario.value.trim().replace(/\s+/g, ' ');
  const clave   = inClave.value;

  if(!usuario)                    return fallar('Escribe tu usuario.', inUsuario);
  if(usuario.length < MIN_USUARIO) return fallar(`El usuario debe tener al menos ${MIN_USUARIO} caracteres.`, inUsuario);
  if(!clave)                      return fallar('Escribe tu contraseña.', inClave);

  btnAcc.disabled = true;
  const textoBtn  = btnAcc.textContent;
  btnAcc.textContent = 'Un momento…';

  try{
    if(modo === 'crear'){
      if(clave.length < MIN_CLAVE)  return fallar(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`, inClave);
      if(clave !== inClave2.value)  return fallar('Las dos contraseñas no son iguales.', inClave2);

      const sal = nuevaSal();
      const d   = await derivar(clave, sal, null);
      if(!d) return fallar('Este navegador no permite guardar el acceso.', inClave);

      const ok = guardarCuenta({
        usuario, sal, algo: d.algo, hash: d.hash,
        creado: new Date().toISOString()
      });
      if(!ok) return fallar('No se pudo guardar el acceso en este navegador.', inClave);

      abrirSesion(usuario);
      abrirApp(usuario);
      return;
    }

    const cuenta = leerCuenta();
    if(!cuenta){ prepararPantalla(); return; }

    const mismoUsuario = normal(usuario) === normal(cuenta.usuario);
    const claveOk      = await coincide(cuenta, clave);

    if(claveOk === null){
      return fallar('Este navegador no puede comprobar la contraseña. Ábrela en Chrome, Edge o Firefox actualizado.', inClave);
    }
    if(!mismoUsuario || !claveOk){
      return fallar('Usuario o contraseña incorrectos.', inClave);
    }

    abrirSesion(cuenta.usuario);
    abrirApp(cuenta.usuario);

  }finally{
    btnAcc.disabled    = false;
    btnAcc.textContent = textoBtn;
  }
});

/* Mostrar / ocultar contraseña */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-ver]');
  if(!btn) return;
  const campo = document.getElementById(btn.dataset.ver);
  if(!campo) return;
  const oculto = campo.type === 'password';
  campo.type = oculto ? 'text' : 'password';
  btn.textContent = oculto ? 'Ocultar' : 'Ver';
  btn.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

/* Salir */
q('#btn-salir').addEventListener('click', () => {
  if(!confirm('¿Cerrar la sesión? Habrá que ingresar la contraseña para volver a entrar.')) return;
  cerrarApp();
});

/* ------------------------------------------------------------
   Olvidé la contraseña: ponerle una nueva

   No hay servidor ni correo, así que no hay a quién pedirle
   permiso: se pide el usuario de la cuenta y se reemplaza la
   huella guardada. Los registros de horas no se tocan.
   ------------------------------------------------------------ */

formReset.addEventListener('submit', async e => {
  e.preventDefault();

  okReset.hidden  = true;
  errReset.hidden = true;
  [inResUsu, inResCla, inResCla2].forEach(i => i.removeAttribute('aria-invalid'));

  const fallarReset = (msg, campo) => {
    errReset.textContent = msg;
    errReset.hidden = false;
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
  };

  const cuenta = leerCuenta();
  if(!cuenta){ prepararPantalla(); return; }

  const usuario = inResUsu.value.trim();
  const nueva   = inResCla.value;

  if(!usuario)                  return fallarReset('Escribe el usuario de la cuenta.', inResUsu);
  if(normal(usuario) !== normal(cuenta.usuario))
                                return fallarReset('Ese usuario no es el de la cuenta guardada en este navegador.', inResUsu);
  if(nueva.length < MIN_CLAVE)  return fallarReset(`La contraseña nueva debe tener al menos ${MIN_CLAVE} caracteres.`, inResCla);
  if(nueva !== inResCla2.value) return fallarReset('Las dos contraseñas nuevas no son iguales.', inResCla2);

  btnRestablecer.disabled    = true;
  const textoBtn             = btnRestablecer.textContent;
  btnRestablecer.textContent = 'Un momento…';
  try{
    const sal = nuevaSal();
    const d   = await derivar(nueva, sal, null);
    if(!d) return fallarReset('Este navegador no permite guardar la contraseña nueva.', inResCla);

    if(!guardarCuenta({ ...cuenta, sal, algo: d.algo, hash: d.hash }))
      return fallarReset('No se pudo guardar la contraseña nueva en este navegador.', inResCla);

    inResUsu.value = inResCla.value = inResCla2.value = '';
    okReset.hidden = false;

    // El usuario entra con la contraseña nueva en el formulario de arriba.
    limpiarError();
    inClave.value = '';
    inClave.focus();
  }finally{
    btnRestablecer.disabled    = false;
    btnRestablecer.textContent = textoBtn;
  }
});

/* Borrado total: empezar de cero, sin acceso y sin registros */
q('#btn-reset').addEventListener('click', () => {
  if(!confirm('Esto borra el acceso Y TODOS los registros de horas guardados en este navegador.\n\n' +
              'No se puede deshacer. ¿Continuar?')) return;
  const palabra = prompt('Para confirmar, escribe: BORRAR');
  if(normal(palabra) !== 'borrar') return;

  try{
    localStorage.removeItem(CLAVE_CUENTA);
    localStorage.removeItem(CLAVE_DATOS);
    localStorage.removeItem(CLAVE_DATOS + '.respaldo');   // si no, se recuperaría al recargar
  }catch(e){}
  borrarSesion();
  location.reload();
});

/* ============================================================
   Cambio de contraseña (pestaña Configuración)
   ============================================================ */

const formClave = q('#form-clave');
const errClave  = q('#clave-error');
const okClave   = q('#clave-ok');

formClave.addEventListener('submit', async e => {
  e.preventDefault();

  const actual = q('#clave-actual');
  const nueva  = q('#clave-nueva');
  const nueva2 = q('#clave-nueva2');

  okClave.hidden  = true;
  errClave.hidden = true;
  [actual, nueva, nueva2].forEach(i => i.removeAttribute('aria-invalid'));

  const fallarClave = (msg, campo) => {
    errClave.textContent = msg;
    errClave.hidden = false;
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
  };

  const cuenta = leerCuenta();
  if(!cuenta) return fallarClave('No hay una cuenta guardada en este navegador.', actual);

  if(!actual.value)                 return fallarClave('Escribe la contraseña actual.', actual);
  if(nueva.value.length < MIN_CLAVE) return fallarClave(`La contraseña nueva debe tener al menos ${MIN_CLAVE} caracteres.`, nueva);
  if(nueva.value !== nueva2.value)   return fallarClave('Las dos contraseñas nuevas no son iguales.', nueva2);

  const btnGuardar = q('button[type="submit"]', formClave);
  btnGuardar.disabled = true;
  try{
    const ok = await coincide(cuenta, actual.value);
    if(ok === null) return fallarClave('Este navegador no puede comprobar la contraseña.', actual);
    if(!ok)         return fallarClave('La contraseña actual no es correcta.', actual);

    const sal = nuevaSal();
    const d   = await derivar(nueva.value, sal, null);
    if(!d) return fallarClave('No se pudo guardar la contraseña nueva.', nueva);

    if(!guardarCuenta({ ...cuenta, sal, algo: d.algo, hash: d.hash }))
      return fallarClave('No se pudo guardar la contraseña nueva.', nueva);

    actual.value = nueva.value = nueva2.value = '';
    okClave.hidden = false;
  }finally{
    btnGuardar.disabled = false;
  }
});

/* ============================================================
   Arranque: la app no se muestra hasta que haya sesión
   ============================================================ */

const cuentaGuardada = leerCuenta();
const sesion         = leerSesion();

if(cuentaGuardada && sesion && normal(sesion) === normal(cuentaGuardada.usuario)){
  abrirApp(cuentaGuardada.usuario);       // ya inició sesión en esta ventana
}else{
  borrarSesion();
  prepararPantalla();
}

})();
