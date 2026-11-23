import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = firebaseConfig.apiKey !== "COLE_SUA_API_KEY" && firebaseConfig.projectId !== "SEU_PROJECT_ID";
const $ = (id) => document.getElementById(id);
const authView = $("authView"), chatView = $("chatView"), authStatus = $("authStatus");
let auth, db, stopMessages;

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, user => {
    authView.classList.toggle("hidden", !!user);
    chatView.classList.toggle("hidden", !user);
    if (user) {
      $("userLabel").textContent = user.email || "Conectado";
      listenMessages();
    } else if (stopMessages) { stopMessages(); stopMessages = null; }
  });
} else {
  authStatus.textContent = "Falta conectar o aplicativo ao seu projeto Firebase.";
  $("loginButton").disabled = true;
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!configured) return;
  $("loginButton").disabled = true; authStatus.textContent = "Entrando...";
  try { await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value); }
  catch (error) { authStatus.textContent = friendlyError(error); }
  finally { $("loginButton").disabled = false; }
});

$("logoutButton").addEventListener("click", () => signOut(auth));

function listenMessages() {
  if (stopMessages) stopMessages();
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
  stopMessages = onSnapshot(q, snapshot => {
    const box = $("messages"); box.innerHTML = "";
    if (snapshot.empty) {
      const empty = document.createElement("div"); empty.className = "empty";
      empty.textContent = "Suas conversas aparecerão aqui. Envie a primeira mensagem. 💙"; box.append(empty); return;
    }
    snapshot.forEach(docSnap => {
      const data = docSnap.data(), bubble = document.createElement("div");
      bubble.className = "bubble" + (data.uid === auth.currentUser?.uid ? " mine" : "");
      const body = document.createElement("div"); body.textContent = data.text || "";
      const meta = document.createElement("small"); meta.textContent = data.senderName || data.senderEmail || "Entre Nós";
      const time = document.createElement("small");
      if (data.createdAt?.toDate) time.textContent = data.createdAt.toDate().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      bubble.append(body, meta, time); box.append(bubble);
    });
    box.scrollTop = box.scrollHeight;
  }, error => { $("messages").textContent = "Não foi possível carregar as mensagens. Verifique as regras do Firestore."; });
}

$("messageForm").addEventListener("submit", async event => {
  event.preventDefault(); const text = $("messageInput").value.trim();
  if (!text || !auth?.currentUser) return;
  const button = $("messageForm").querySelector("button"); button.disabled = true;
  try {
    await addDoc(collection(db, "messages"), {
      text, uid: auth.currentUser.uid, senderEmail: auth.currentUser.email || "",
      senderName: auth.currentUser.email || "Entre Nós", createdAt: serverTimestamp()
    });
    $("messageInput").value = "";
  } catch (error) { alert("Não foi possível enviar. Confira a configuração e as regras do Firestore."); }
  finally { button.disabled = false; }
});

function friendlyError(error) {
  const map = {
    "auth/invalid-credential":"E-mail ou senha incorretos.",
    "auth/user-disabled":"Este acesso está desativado.",
    "auth/too-many-requests":"Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed":"Falha de conexão. Verifique a internet."
  };
  return map[error.code] || "Não foi possível entrar. Confira os dados e tente novamente.";
}