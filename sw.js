// Service worker : met l'appli en cache pour qu'elle marche hors connexion.
// Changer VERSION à chaque mise à jour des fichiers pour forcer le rafraîchissement.
// Une nouvelle version s'installe en arrière-plan puis attend : l'appli affiche « Nouvelle version » et
// c'est l'utilisateur qui redémarre (message MAJ). Message VERSION : renvoie la version de ce service worker.
const VERSION = "kanji-v18";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "srs.js", "data.js", "manifest.webmanifest", "themes.css", "themes.js", "nihon-192.png", "nihon-512.png", "logo.svg"];

self.addEventListener("install", (e) => {
  // cache: "reload" : on télécharge les fichiers frais, pas ceux du cache HTTP du navigateur
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: "reload" })))));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => {
  if (!e.data) return;
  if (e.data.type === "MAJ") self.skipWaiting();
  if (e.data.type === "VERSION" && e.ports[0]) e.ports[0].postMessage(VERSION);
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
