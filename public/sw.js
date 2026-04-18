self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open("gen-z-pwa-v1").then((cache) => cache.addAll(["/", "/index.html"]))
  );
});

self.addEventListener("fetch", (e) => {
  console.log("Service Worker Fetch", e.request.url);
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
