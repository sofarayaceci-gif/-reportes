/* ══════════════════════════════════════════════════════════════════════════
   sw.js — Hace que la app instalada abra sin servidor y sin internet.
   Los datos no pasan por acá: viven en IndexedDB.

   Estrategia: primero el caché, y en paralelo se intenta refrescar desde el
   servidor si está encendido. Así la app instalada abre al instante y con el
   servidor apagado, pero igual recoge los cambios la próxima vez que se abra
   con el servidor prendido.
   ══════════════════════════════════════════════════════════════════════════ */

/* Subir este número cada vez que cambie un archivo de la app. Al activarse
   descarta el caché viejo y vuelve a bajar todo del servidor, así no queda
   ningún archivo a medias. La pantalla que ya está abierta sigue con lo viejo:
   los cambios se ven al cerrarla y volver a abrirla. */
const CACHE = 'reportes-v12';

const ARCHIVOS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'css/estilos.css',
  'js/textos.js',
  'js/almacen.js',
  'js/nube.js',
  'js/excel.js',
  'js/app.js',
  'vendor/xlsx.full.min.js',
  'iconos/logo.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png'
];

/* Las rutas que forman la app. Solo estas se guardan: así el caché no se
   llena con archivos de datos que alguien haya descargado por el camino. */
const RUTAS = ARCHIVOS.map(archivo => new URL(archivo, self.location.href).pathname);

function esDeLaApp(peticion) {
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return false;
  return RUTAS.indexOf(url.pathname) !== -1;
}

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres.filter(n => n !== CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  if (!esDeLaApp(peticion) && peticion.mode !== 'navigate') return;

  evento.respondWith(
    caches.match(peticion).then(guardada => {
      const desdeLaRed = fetch(peticion).then(respuesta => {
        if (respuesta && respuesta.ok && esDeLaApp(peticion)) {
          const copia = respuesta.clone();
          caches.open(CACHE).then(cache => cache.put(peticion, copia));
        }
        return respuesta;
      }).catch(() => null);

      /* Si está en caché se devuelve de una y la red refresca por detrás. */
      if (guardada) return guardada;

      return desdeLaRed.then(respuesta =>
        respuesta || caches.match('index.html')
      );
    })
  );
});
