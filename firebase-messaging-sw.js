importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAl0dndJxsKF94LfZL66syWUz03D2jbChE",
  authDomain: "entrenos-1ca26.firebaseapp.com",
  projectId: "entrenos-1ca26",
  storageBucket: "entrenos-1ca26.firebasestorage.app",
  messagingSenderId: "657106810627",
  appId: "1:657106810627:web:f45e29c7dfda6f02ca1b36"
});

const messaging = firebase.messaging();
const SHELL_CACHE = "entre-nos-shell-v20";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js?v=20",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("entre-nos-shell-") && key !== SHELL_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Mantém os arquivos essenciais disponíveis como estrutura de abertura
// quando a conexão oscila. O chat e o Firebase continuam exigindo internet.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put("./index.html", response.clone());
        return response;
      } catch {
        return await cache.match(request) || await cache.match("./") ||
          await cache.match("./index.html") || Response.error();
      }
    })());
    return;
  }

  const isAppAsset = /\/(?:app\.js|firebase-config\.js|manifest\.webmanifest|icon\.svg)$/.test(url.pathname);
  if (!isAppAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || Response.error();
    }
  })());
});

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "Entre Nós";
  const options = {
    body: payload.notification?.body || "Você recebeu uma nova mensagem.",
    icon: "./icon.svg",
    badge: "./icon.svg",
    data: { url: "./" }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./"));
});
