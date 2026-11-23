import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = firebaseConfig.apiKey !== "COLE_SUA_API_KEY" && firebaseConfig.projectId !== "SEU_PROJECT_ID";
const $ = (id) => document.getElementById(id);
const authView = $("authView"), chatView = $("chatView"), pendingView = $("pendingView"), authStatus = $("authStatus");
const approvedUids = ["7XPrjKOzd7czUWdFwPLdPI63Hwu2", "3E0MnEx8kwclQ7sajJndriPJpZ62"];
const vapidKey = "BA1o3SI2iCWEiAqyOf8EjoX4bBVDQQdakDYhd8O_k99BpYH8dq-ogPwjmUGciSun5I2Jkeg7l-WOO2lU8bsgorc";
let signupMode = false;
let auth, db, stopMessages, messaging;

function applyThemePreference() {
  const saved = localStorage.getItem("entre-nos-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  const button = $("themeToggle");
  if (button) {
    button.textContent = saved === "light" ? "☾ Tema escuro" : "☀ Tema claro";
    button.setAttribute("aria-pressed", String(saved === "light"));
  }
}
function loadProfilePhoto() {
  const user = auth?.currentUser;
  const avatar = $("profileAvatar");
  if (!user || !avatar) return;
  const saved = localStorage.getItem("entre-nos-avatar-" + user.uid);
  avatar.style.backgroundImage = saved ? `url("${saved}")` : "";
  avatar.classList.toggle("has-photo", !!saved);
  avatar.textContent = saved ? "" : "♡";
}
function displayName(uid) {
  if (uid === "7XPrjKOzd7czUWdFwPLdPI63Hwu2") return "Eduardo";
  if (uid === "3E0MnEx8kwclQ7sajJndriPJpZ62") return "Nádia";
  return "Entre Nós";
}

applyThemePreference();
$("profilePhotoButton")?.addEventListener("click", () => $("profilePhotoInput")?.click());
$("profilePhotoInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  const user = auth?.currentUser;
  if (!file || !user) return;
  if (!file.type.startsWith("image/")) { alert("Escolha um arquivo de imagem."); return; }
  if (file.size > 8 * 1024 * 1024) { alert("A imagem deve ter até 8 MB."); event.target.value = ""; return; }
  try {
    const source = await createImageBitmap(file);
    const scale = Math.min(1, 320 / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    const compact = canvas.toDataURL("image/jpeg", 0.78);
    localStorage.setItem("entre-nos-avatar-" + user.uid, compact);
    loadProfilePhoto();
    source.close();
  } catch { alert("Não foi possível processar essa imagem neste aparelho."); }
  event.target.value = "";
});
$("themeToggle")?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem("entre-nos-theme", next);
  applyThemePreference();
});

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
      $("userLabel").textContent = displayName(user.uid) + " • Conectado";
      $("enableNotifications").classList.remove("hidden");
      refreshNotificationStatus(user);
      restoreDraft(user);
      loadFavorites();
      loadProfilePhoto();
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
let replyTarget = null;
let favoriteIds = new Set();
let showOnlyFavorites = false;
function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem("entre-nos-favorites-" + auth.currentUser.uid) || "[]");
    favoriteIds = new Set(Array.isArray(saved) ? saved : []);
  } catch { favoriteIds = new Set(); }
}
function saveFavorites() {
  try {
    localStorage.setItem("entre-nos-favorites-" + auth.currentUser.uid, JSON.stringify([...favoriteIds]));
  } catch { alert("Não foi possível salvar as favoritas neste aparelho."); }
}
function renderMessages() {
  const box = $("messages");
  const term = ($("messageSearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const normalMessages = cachedMessages.filter(item => item.data.type !== "reaction");
  const filtered = normalMessages.filter(item => {
    const d = item.data;
    const matchesSearch = !term || String(d.text || "").toLocaleLowerCase("pt-BR").includes(term) ||
      String(d.senderName || d.senderEmail || "").toLocaleLowerCase("pt-BR").includes(term);
    return matchesSearch && (!showOnlyFavorites || favoriteIds.has(item.id));
  });
  const count = $("messageCount");
  if (count) {
    const hasFilter = !!term || showOnlyFavorites;
    count.textContent = hasFilter
      ? `Mostrando ${filtered.length} de ${normalMessages.length}`
      : `${normalMessages.length} ${normalMessages.length === 1 ? "mensagem" : "mensagens"}`;
  }
  const clearSearch = $("clearSearch");
  if (clearSearch) clearSearch.classList.toggle("hidden", !term);
  box.innerHTML = "";
  if (!cachedMessages.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    empty.textContent = "Suas conversas aparecerão aqui. Envie a primeira mensagem. 💙"; box.append(empty); return;
  }
  if (!filtered.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    empty.textContent = "Nenhuma mensagem encontrada para essa busca."; box.append(empty); return;
  }
  let previousDay = "";
  filtered.forEach(({id, data}) => {
    const date = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    const dayKey = date ? date.toLocaleDateString("pt-BR") : "";
    if (dayKey && dayKey !== previousDay) {
      const separator = document.createElement("div");
      separator.className = "date-separator";
      separator.textContent = date.toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
      box.append(separator);
      previousDay = dayKey;
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble" + (data.uid === auth.currentUser?.uid ? " mine" : "");
    if (data.replyTo) {
      const quote = document.createElement("div");
      quote.className = "reply-quote";
      quote.textContent = "↪ " + (data.replyTo.sender || "Mensagem") + ": " + data.replyTo.text;
      bubble.append(quote);
    }
    const body = document.createElement("div");
    const rawText = String(data.text || "");
    const urlPattern = /(https:\/\/[^\s]+|www\.[^\s]+)/gi;
    let lastIndex = 0, match;
    while ((match = urlPattern.exec(rawText)) !== null) {
      body.append(document.createTextNode(rawText.slice(lastIndex, match.index)));
      const anchor = document.createElement("a");
      const href = match[0].startsWith("www.") ? "https://" + match[0] : match[0];
      anchor.href = href; anchor.textContent = match[0];
      anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
      body.append(anchor); lastIndex = urlPattern.lastIndex;
    }
    body.append(document.createTextNode(rawText.slice(lastIndex)));
    const meta = document.createElement("small"); meta.textContent = displayName(data.uid);
    const time = document.createElement("small");
    if (data.createdAt?.toDate) time.textContent = data.createdAt.toDate().toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
    if (data.editedAt) time.textContent += " · editada";
    const copy = document.createElement("button");
    copy.type = "button"; copy.className = "copy-message"; copy.textContent = "Copiar";
    copy.setAttribute("aria-label", "Copiar esta mensagem");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.text || "");
        copy.textContent = "Copiado ✓";
        setTimeout(() => { copy.textContent = "Copiar"; }, 1600);
      } catch {
        copy.textContent = "Não foi possível copiar";
      }
    });
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const reply = document.createElement("button");
    reply.type = "button"; reply.className = "message-action"; reply.textContent = "Responder";
    reply.addEventListener("click", () => {
      const source = cachedMessages.find(item => item.data === data);
      replyTarget = { id: source?.id || "", sender: displayName(data.uid), text: String(data.text || "").slice(0,180) };
      showReplyPreview();
      $("messageInput").focus();
    });
    actions.append(reply);
    if (data.uid === auth.currentUser?.uid && data.type !== "reaction") {
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "message-action"; edit.textContent = "Editar";
      edit.addEventListener("click", async () => {
        const revised = window.prompt("Edite sua mensagem:", String(data.text || ""));
        if (revised === null) return;
        const clean = revised.trim();
        if (!clean) { alert("A mensagem não pode ficar vazia."); return; }
        if (clean.length > 4000) { alert("A mensagem ultrapassa 4.000 caracteres."); return; }
        if (clean === String(data.text || "")) return;
        try {
          await updateDoc(doc(db, "messages", id), { text: clean, editedAt: serverTimestamp() });
        } catch (error) {
          alert("Não foi possível editar. As regras atuais do Firestore podem não permitir alterações.");
        }
      });
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "message-action"; remove.textContent = "Apagar";
      remove.addEventListener("click", async () => {
        if (!window.confirm("Apagar esta mensagem? Essa ação não pode ser desfeita.")) return;
        try {
          await deleteDoc(doc(db, "messages", id));
          favoriteIds.delete(id);
          saveFavorites();
        } catch (error) {
          alert("Não foi possível apagar. As regras atuais do Firestore podem não permitir exclusões.");
        }
      });
      actions.append(edit, remove);
    }
    const sourceForFavorite = { id, data };
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "message-action";
    const isFavorite = !!sourceForFavorite && favoriteIds.has(sourceForFavorite.id);
    favorite.textContent = isFavorite ? "★ Favorita" : "☆ Favoritar";
    favorite.setAttribute("aria-label", isFavorite ? "Remover das favoritas" : "Adicionar às favoritas");
    favorite.addEventListener("click", () => {
      if (!sourceForFavorite) return;
      if (favoriteIds.has(sourceForFavorite.id)) favoriteIds.delete(sourceForFavorite.id);
      else favoriteIds.add(sourceForFavorite.id);
      saveFavorites();
      renderMessages();
    });
    actions.append(favorite);
    const reactionBar = document.createElement("div");
    reactionBar.className = "reaction-bar";
    ["❤️","😂","👍","🥰","🙏"].forEach(emoji => {
      const reactionButton = document.createElement("button");
      reactionButton.type = "button"; reactionButton.className = "reaction-button";
      const source = cachedMessages.find(item => item.data === data);
      const count = cachedMessages.filter(item => item.data.type === "reaction" && item.data.targetMessageId === source?.id && item.data.emoji === emoji).length;
      reactionButton.textContent = emoji + (count ? " " + count : "");
      reactionButton.setAttribute("aria-label", "Reagir com " + emoji);
      reactionButton.addEventListener("click", async () => {
        if (!source) return;
        const alreadyReacted = cachedMessages.some(item => item.data.type === "reaction" && item.data.targetMessageId === source.id && item.data.emoji === emoji && item.data.uid === auth.currentUser.uid);
        if (alreadyReacted) return;
        try {
          await addDoc(collection(db, "messages"), { type:"reaction", targetMessageId:source.id, emoji, uid:auth.currentUser.uid, senderName:auth.currentUser.email || "Entre Nós", createdAt:serverTimestamp() });
        } catch (error) { alert("Não foi possível registrar a reação. Confira as permissões do Firestore."); }
      });
      reactionBar.append(reactionButton);
    });
    actions.append(reactionBar);
    bubble.append(body, meta, time, copy, actions); box.append(bubble);
  });
  if (!term && !showOnlyFavorites) box.scrollTop = box.scrollHeight;
}
function showReplyPreview() {
  const preview = $("replyPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!replyTarget) { preview.classList.add("hidden"); return; }
  preview.classList.remove("hidden");
  const label = document.createElement("span");
  label.textContent = "Respondendo a " + replyTarget.sender + ": " + replyTarget.text;
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "message-action"; cancel.textContent = "Cancelar";
  cancel.addEventListener("click", () => { replyTarget = null; showReplyPreview(); });
  preview.append(label, cancel);
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
$("clearSearch")?.addEventListener("click", () => {
  const search = $("messageSearch");
  if (!search) return;
  search.value = "";
  search.focus();
  renderMessages();
});
$("favoritesToggle")?.addEventListener("click", () => {
  showOnlyFavorites = !showOnlyFavorites;
  $("favoritesToggle").textContent = showOnlyFavorites ? "Ver conversa" : "★ Favoritas";
  $("favoritesToggle").setAttribute("aria-pressed", String(showOnlyFavorites));
  renderMessages();
});

const messagesBox = $("messages");
const jumpButton = $("jumpToLatest");
if (messagesBox && jumpButton) {
  messagesBox.addEventListener("scroll", () => {
    const away = messagesBox.scrollHeight - messagesBox.scrollTop - messagesBox.clientHeight > 140;
    jumpButton.classList.toggle("hidden", !away);
  });
  jumpButton.addEventListener("click", () => {
    messagesBox.scrollTo({ top: messagesBox.scrollHeight, behavior: "smooth" });
    jumpButton.classList.add("hidden");
  });
}

function downloadConversation(format) {
  if (!cachedMessages.length) {
    alert("Ainda não há mensagens para exportar.");
    return;
  }
  const dateTag = new Date().toISOString().slice(0,10);
  const messages = cachedMessages.filter(item => item.data.type !== "reaction");
  const reactions = cachedMessages.filter(item => item.data.type === "reaction");
  let content, mime, extension;
  if (format === "json") {
    const payload = {
      app: "Entre Nós",
      exportedAt: new Date().toISOString(),
      messages: messages.map(({id, data}) => ({
        id, text: String(data.text || ""),
        favorite: favoriteIds.has(id),
        sender: data.senderName || data.senderEmail || "Entre Nós",
        senderUid: data.uid || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        replyTo: data.replyTo || null,
        reactions: reactions.filter(r => r.data.targetMessageId === id).map(r => ({
          emoji: r.data.emoji, sender: r.data.senderName || "Entre Nós",
          uid: r.data.uid || null
        }))
      }))
    };
    content = JSON.stringify(payload, null, 2);
    mime = "application/json;charset=utf-8";
    extension = "json";
  } else {
    const lines = ["ENTRE NÓS — CÓPIA DA CONVERSA", "Exportado em: " + new Date().toLocaleString("pt-BR"), ""];
    messages.forEach(({id, data}) => {
      const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("pt-BR") : "Data não disponível";
      const sender = data.senderName || data.senderEmail || "Entre Nós";
      lines.push("[" + date + "] " + sender + ":");
      if (data.replyTo) lines.push("  ↪ Respondendo a " + data.replyTo.sender + ": " + data.replyTo.text);
      lines.push(String(data.text || ""));
      const related = reactions.filter(r => r.data.targetMessageId === id);
      if (related.length) lines.push("  Reações: " + related.map(r => r.data.emoji).join(" "));
      lines.push("");
    });
    content = "\uFEFF" + lines.join("\n");
    mime = "text/plain;charset=utf-8";
    extension = "txt";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "entre-nos-conversa-" + dateTag + "." + extension;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("exportConversation")?.addEventListener("click", () => downloadConversation("txt"));
$("exportJson")?.addEventListener("click", () => downloadConversation("json"));

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
  event.preventDefault(); const input = $("messageInput"); const text = input.value.trim();
  if (!text || !auth?.currentUser) return;
  const button = $("messageForm").querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const messageData = {
      text, uid: auth.currentUser.uid, senderEmail: auth.currentUser.email || "",
      senderName: displayName(auth.currentUser.uid), createdAt: serverTimestamp()
    };
    if (replyTarget) messageData.replyTo = { id: replyTarget.id, sender: replyTarget.sender, text: replyTarget.text };
    const messageRef = await addDoc(collection(db, "messages"), messageData);
    replyTarget = null;
    showReplyPreview();
    input.value = "";
    saveDraft(auth.currentUser, "");
    updateDraftCounter();
    input.style.height = "auto";
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

function draftKey(user) { return "entre-nos-draft-" + user.uid; }
function saveDraft(user, value) {
  if (!user) return;
  try { localStorage.setItem(draftKey(user), value); } catch {}
}
function restoreDraft(user) {
  const input = $("messageInput");
  try { input.value = localStorage.getItem(draftKey(user)) || ""; } catch { input.value = ""; }
  updateDraftCounter();
  resizeComposer();
}
function updateDraftCounter() {
  const counter = $("draftCounter"), input = $("messageInput");
  if (counter && input) counter.textContent = input.value.length.toLocaleString("pt-BR") + "/4000";
}
function resizeComposer() {
  const input = $("messageInput");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
}
$("messageInput")?.addEventListener("input", () => {
  if (auth?.currentUser) saveDraft(auth.currentUser, $("messageInput").value);
  updateDraftCounter();
  resizeComposer();
});
$("messageInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    $("messageForm").requestSubmit();
  }
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