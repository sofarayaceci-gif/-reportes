/* ============================================================
   Registro de Horas — service worker

   Sirve para dos cosas: que Chrome ofrezca "Instalar" y que la app
   abra sin internet. Los datos no pasan por acá: viven en el
   localStorage del navegador y en jsonbin.

   Estrategia: primero la red y lo que llegue se guarda en caché.
   Así una versión nueva de app.js se ve en cuanto se publica, y sin
   señal se abre la última que sí cargó.

   Al cambiar los archivos de la app conviene subirle el número a
   CACHE: obliga a soltar la copia vieja en todos los dispositivos.
   ============================================================ */
'use strict';

const CACHE = 'horas-v10';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './nube.js',
  './acceso.js',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png',
  './icono-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS))
      .catch(() => {})                    // si un archivo falla, la app igual sirve
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const peticion = e.request;

  // Solo los archivos de la app: las llamadas a jsonbin pasan directo.
  if(peticion.method !== 'GET') return;
  if(new URL(peticion.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(peticion)
      .then(respuesta => {
        if(respuesta && respuesta.ok){
          const copia = respuesta.clone();
          caches.open(CACHE).then(c => c.put(peticion, copia)).catch(() => {});
        }
        return respuesta;
      })
      .catch(() => caches.match(peticion).then(guardada => {
        if(guardada) return guardada;
        // Sin señal y sin copia exacta: al abrir la app se devuelve la pantalla.
        if(peticion.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
