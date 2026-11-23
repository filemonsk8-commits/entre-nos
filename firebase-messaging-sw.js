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
