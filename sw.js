// Permet d'ouvrir l'appli sans réseau (chantier, cave…). Changer VERSION à chaque mise à jour.
const VERSION = 'mes-devis-v1';
const FICHIERS = [
  './', 'index.html', 'styles.css', 'app.js', 'pdf.js', 'prix.js', 'manifest.webmanifest',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
  'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
// Réseau d'abord (pour avoir la dernière version), sinon la copie gardée.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((rep) => {
        const copie = rep.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copie));
        return rep;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
