// Workshop Cue — Service Worker（GitHub Pages 用・ビルド時に scripts/make-sw.mjs が完成させる）
// ・ビルドした全ファイルを最初にまとめて端末へ保存する（初回からオフラインで開ける）
// ・保存名はファイル内容から自動生成。更新を公開すると自動で新しい名前になり、古い保存は削除される
const CACHE_NAME = "workshop-cue-a12b169321";
const PRECACHE = [
  "./",
  "./.nojekyll",
  "./apple-touch-icon.png",
  "./assets/index-CxsQhSrK.js",
  "./assets/index-DDJK_b5M.css",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("workshop-cue-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    }),
  );
});
