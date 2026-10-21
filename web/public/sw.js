const cacheName = "riceball-v27";
const appFiles = ["./", "./index.html", "./styles.css", "./app.js", "./db.js", "./manifest.webmanifest", "./icons/riceball.svg"];

self.addEventListener("install", (event) => event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appFiles))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
