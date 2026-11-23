import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = firebaseConfig.apiKey !== "COLE_SUA_API_KEY" && firebaseConfig.projectId !== "SEU_PROJECT_ID";
const $ = (id) => document.getElementById(id);
const authView = $("authView"), chatView = $("chatView"), pendingView = $("pendingView"), authStatus = $("authStatus");
const approvedUids = ["7XPrjKOzd7czUWdFwPLdPI63Hwu2", "3E0MnEx8kwclQ7sajJndriPJpZ62"];
const vapidKey = "BA1o3SI2iCWEiAqyOf8EjoX4bBVDQQdakDYhd8O_k99BpYH8dq-ogPwjmUGciSun5I2Jkeg7l-WOO2lU8bsgorc";
let signupMode = false;
let auth, db, stopMessages, messaging;

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  isSupported().then(supported => { if (supported) { messaging = getMessaging(app); onMessage(messaging, payload => { if (Notification.permission === "granted") new Notification(payload.notification?.title || "Entre Nós", { body: payload.notification?.body || "Você recebeu uma nova mensagem.", icon: "./icon.svg" }); }); } }).catch(() => {});
  onAuthStateChanged(auth, user => {
    const approved = !!user && approvedUids.includes(user.uid);
    authView.classList.toggle("hidden", !!user);
    chatView.classList.toggle("hidden", !approved);
    pendingView.classList.toggle("hidden", !user || approved);
    if (approved) {
      $("userLabel").textContent = user.email || "Conectado";
      $("enableNotifications").classList.remove("hidden");
      refreshNotificationStatus(user);
      listenMessages();
    } else {
      if (stopMessages) { stopMessages(); stopMessages = null; }
      $("enableNotifications").classList.add("hidden");
      if (user) $("pendingUid").textContent = user.uid;
    }
  });
} else {
  authStatus.textContent = "Falta conectar o aplicativo ao seu projeto Firebase.";
  $("loginButton").disabled = true;
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!configured) return;
  $("loginButton").disabled = true;
  authStatus.textContent = signupMode ? "Criando sua conta..." : "Entrando...";
  try {
    const email = $("email").value.trim(), password = $("password").value;
    if (signupMode) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) { authStatus.textContent = friendlyError(error); }
  finally { $("loginButton").disabled = false; }
});

$("signupToggle").addEventListener("click", () => {
  signupMode = !signupMode;
  $("loginButton").textContent = signupMode ? "Criar conta" : "Entrar";
  $("signupToggle").textContent = signupMode ? "Já tenho conta — entrar" : "Primeiro acesso? Criar conta";
  $("authHeading").textContent = signupMode ? "Vamos criar seu acesso." : "Que bom ter você aqui.";
  $("authSubtitle").textContent = signupMode ? "Cadastre seu e-mail e crie uma senha segura." : "Entre no espaço privado de vocês dois.";
  $("password").autocomplete = signupMode ? "new-password" : "current-password";
  authStatus.textContent = signupMode ? "Após o cadastro, o acesso ficará aguardando aprovação." : "";
});

$("pendingLogout").addEventListener("click", () => signOut(auth));
$("copyUid").addEventListener("click", async () => {
  const value = $("pendingUid").textContent;
  try {
    await navigator.clipboard.writeText(value);
    $("copyUid").textContent = "UID copiado!";
  } catch {
    $("copyUid").textContent = "Selecione e copie o código acima.";
  }
});

$("logoutButton").addEventListener("click", () => signOut(auth));

async function saveNotificationToken(user) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Este navegador não oferece suporte a notificações neste modo.");
  }
  const registration = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
  if (!messaging) messaging = getMessaging(auth.app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Não foi possível gerar o token de notificações.");
  await setDoc(doc(db, "pushTokens", user.uid), {
    token, uid: user.uid, updatedAt: serverTimestamp()
  });
}

async function refreshNotificationStatus(user) {
  const button = $("enableNotifications");
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    button.disabled = true;
    button.textContent = "Verificando notificações...";
    try {
      await saveNotificationToken(user);
      button.textContent = "Notificações ativadas ✓";
    } catch (error) {
      button.disabled = false;
      button.textContent = "Tentar ativar novamente";
      console.warn("Não foi possível atualizar o token de notificações:", error);
    }
  } else if (Notification.permission === "denied") {
    button.disabled = true;
    button.textContent = "Permita notificações nas configurações do navegador";
  } else {
    button.disabled = false;
    button.textContent = "Ativar notificações";
  }
}

$("enableNotifications").addEventListener("click", async () => {
  const button = $("enableNotifications");
  button.disabled = true;
  button.textContent = "Ativando...";
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Este navegador não oferece suporte a notificações neste modo.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("A permissão atual é: " + permission + ". Verifique as permissões do site no navegador.");
    }
    await saveNotificationToken(auth.currentUser);
    button.textContent = "Notificações ativadas ✓";
  } catch (error) {
    button.disabled = false;
    button.textContent = "Ativar notificações";
    alert(error.message || "Não foi possível ativar as notificações.");
  }
});

let cachedMessages = [];
function renderMessages() {
  const box = $("messages");
  const term = ($("messageSearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const filtered = cachedMessages.filter(item => {
    const d = item.data;
    return !term || String(d.text || "").toLocaleLowerCase("pt-BR").includes(term) ||
      String(d.senderName || d.senderEmail || "").toLocaleLowerCase("pt-BR").includes(term);
  });
  box.innerHTML = "";
  if (!cachedMessages.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    empty.textContent = "Suas conversas aparecerão aqui. Envie a primeira mensagem. 💙"; box.append(empty); return;
  }
  if (!filtered.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    empty.textContent = "Nenhuma mensagem encontrada para essa busca."; box.append(empty); return;
  }
  filtered.forEach(({data}) => {
    const bubble = document.createElement("div");
    bubble.className = "bubble" + (data.uid === auth.currentUser?.uid ? " mine" : "");
    const body = document.createElement("div"); body.textContent = data.text || "";
    const meta = document.createElement("small"); meta.textContent = data.senderName || data.senderEmail || "Entre Nós";
    const time = document.createElement("small");
    if (data.createdAt?.toDate) time.textContent = data.createdAt.toDate().toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
    bubble.append(body, meta, time); box.append(bubble);
  });
  if (!term) box.scrollTop = box.scrollHeight;
}
function listenMessages() {
  if (stopMessages) stopMessages();
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
  stopMessages = onSnapshot(q, snapshot => {
    cachedMessages = snapshot.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }));
    renderMessages();
  }, error => { $("messages").textContent = "Não foi possível carregar as mensagens. Verifique as regras do Firestore."; });
}
$("messageSearch")?.addEventListener("input", renderMessages);

function updateConnectionStatus() {
  const el = $("connectionStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "Conectado à internet" : "Sem internet";
  el.classList.toggle("offline", !online);
}
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
updateConnectionStatus();

const emojiButton = $("emojiButton");
const emojiPicker = $("emojiPicker");
const emojiList = ["😀","😂","🥰","😍","😘","❤️","💕","💙","💜","💋","😊","😉","🥹","🤗","🌹","✨","🙏","☀️","🌙","☕","🎶","🫶"];
if (emojiButton && emojiPicker) {
  emojiList.forEach(emoji => {
    const item = document.createElement("button");
    item.type = "button"; item.className = "emoji-choice"; item.textContent = emoji;
    item.setAttribute("aria-label", "Inserir " + emoji);
    item.addEventListener("click", () => {
      const input = $("messageInput");
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0,start) + emoji + input.value.slice(end);
      input.focus();
      const cursor = start + emoji.length;
      input.setSelectionRange(cursor,cursor);
      emojiPicker.classList.add("hidden");
      emojiButton.setAttribute("aria-expanded","false");
    });
    emojiPicker.append(item);
  });
  emojiButton.addEventListener("click", () => {
    const open = emojiPicker.classList.toggle("hidden") === false;
    emojiButton.setAttribute("aria-expanded", String(open));
  });
}

$("messageForm").addEventListener("submit", async event => {
  event.preventDefault(); const text = $("messageInput").value.trim();
  if (!text || !auth?.currentUser) return;
  const button = $("messageForm").querySelector("button"); button.disabled = true;
  try {
    const messageRef = await addDoc(collection(db, "messages"), {
      text, uid: auth.currentUser.uid, senderEmail: auth.currentUser.email || "",
      senderName: auth.currentUser.email || "Entre Nós", createdAt: serverTimestamp()
    });
    $("messageInput").value = "";
    try {
      const idToken = await auth.currentUser.getIdToken();
      const notificationResponse = await fetch("https://entre-nos-notificacoes.filemonsk8.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, messageId: messageRef.id })
      });
      if (!notificationResponse.ok) {
        const notificationError = await notificationResponse.json().catch(() => ({}));
        console.warn("Mensagem enviada, mas a notificação não foi enviada:", notificationError.error || notificationResponse.status);
      }
    } catch (notificationError) {
      console.warn("Mensagem enviada, mas não foi possível conectar ao serviço de notificações.", notificationError);
    }
  } catch (error) { alert("Não foi possível enviar. Confira a configuração e as regras do Firestore."); }
  finally { button.disabled = false; }
});

function friendlyError(error) {
  const map = {
    "auth/invalid-credential":"E-mail ou senha incorretos.",
    "auth/user-disabled":"Este acesso está desativado.",
    "auth/email-already-in-use":"Este e-mail já possui uma conta. Tente entrar.",
    "auth/weak-password":"A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email":"Digite um e-mail válido.",
    "auth/too-many-requests":"Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed":"Falha de conexão. Verifique a internet."
  };
  return map[error.code] || "Não foi possível entrar. Confira os dados e tente novamente.";
}