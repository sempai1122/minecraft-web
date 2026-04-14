const refs = {
  connectionState: document.getElementById("connectionState"),
  authForm: document.getElementById("authForm"),
  authUsername: document.getElementById("authUsername"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  loginBtn: document.getElementById("loginBtn"),
  profileSection: document.getElementById("profileSection"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileName: document.getElementById("profileName"),
  profileEmail: document.getElementById("profileEmail"),
  statusSelect: document.getElementById("statusSelect"),
  chatActions: document.getElementById("chatActions"),
  newDirectChatBtn: document.getElementById("newDirectChatBtn"),
  newGroupBtn: document.getElementById("newGroupBtn"),
  conversationSection: document.getElementById("conversationSection"),
  conversationCount: document.getElementById("conversationCount"),
  conversationSearch: document.getElementById("conversationSearch"),
  conversationList: document.getElementById("conversationList"),
  chatTitle: document.getElementById("chatTitle"),
  chatSubtitle: document.getElementById("chatSubtitle"),
  typingIndicator: document.getElementById("typingIndicator"),
  messageList: document.getElementById("messageList"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  emojiBtn: document.getElementById("emojiBtn"),
  fileInput: document.getElementById("fileInput"),
  selectedFileName: document.getElementById("selectedFileName")
};

const state = {
  token: "",
  me: null,
  chats: [],
  selectedChatId: "",
  typingUsers: new Set(),
  pendingFile: null,
  typingTimer: null,
  socket: null
};

const emojiSet = ["😀", "😂", "🔥", "❤️", "👏", "🎉", "🚀"];

const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${state.token}` });

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function setConnection(online) {
  refs.connectionState.textContent = online ? "Online" : "Offline";
  refs.connectionState.classList.toggle("online", online);
  refs.connectionState.classList.toggle("offline", !online);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelative(iso) {
  const date = new Date(iso);
  const now = new Date();
  if (now.toDateString() === date.toDateString()) return formatTime(iso);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function currentChat() {
  return state.chats.find(chat => chat.id === state.selectedChatId);
}

function resetTyping() {
  state.typingUsers.clear();
  refs.typingIndicator.textContent = "";
}

function updateTypingLabel() {
  const names = [...state.typingUsers];
  refs.typingIndicator.textContent = names.length ? `${names.join(", ")} typing...` : "";
}

function renderProfile() {
  if (!state.me) return;
  refs.profileSection.classList.remove("hidden");
  refs.chatActions.classList.remove("hidden");
  refs.conversationSection.classList.remove("hidden");
  refs.profileName.textContent = state.me.username;
  refs.profileEmail.textContent = state.me.email;
  refs.profileAvatar.src = state.me.avatar;
  refs.statusSelect.value = state.me.status;
}

function renderConversations() {
  const search = refs.conversationSearch.value.trim().toLowerCase();
  const template = document.getElementById("conversationTemplate");
  refs.conversationList.innerHTML = "";

  const visible = state.chats.filter(chat => chat.name.toLowerCase().includes(search));
  refs.conversationCount.textContent = String(visible.length);

  visible.forEach(chat => {
    const node = template.content.firstElementChild.cloneNode(true);
    const last = chat.messages.at(-1);
    node.querySelector(".conversation-name").textContent = chat.name;
    node.querySelector(".conversation-last").textContent = last?.text || (last?.attachmentName ? `📎 ${last.attachmentName}` : "No messages yet");
    node.querySelector(".conversation-time").textContent = last ? formatRelative(last.createdAt) : "";

    const unread = chat.messages.filter(m => !m.readBy.includes(state.me.id) && m.senderId !== state.me.id).length;
    const badge = node.querySelector(".unread-badge");
    if (unread > 0) {
      badge.classList.remove("hidden");
      badge.textContent = String(unread);
    }

    node.classList.toggle("active", chat.id === state.selectedChatId);
    node.addEventListener("click", () => {
      state.selectedChatId = chat.id;
      renderConversations();
      renderMessages();
      markRead(chat.id);
    });

    refs.conversationList.appendChild(node);
  });
}

function renderMessages() {
  const chat = currentChat();
  refs.messageList.innerHTML = "";
  resetTyping();

  if (!chat) {
    refs.chatTitle.textContent = "Welcome 👋";
    refs.chatSubtitle.textContent = "Pick a chat from the left panel.";
    refs.messageForm.classList.add("hidden");
    return;
  }

  refs.messageForm.classList.remove("hidden");
  refs.chatTitle.textContent = chat.name;
  refs.chatSubtitle.textContent = chat.isGroup ? `${chat.members.length} members` : "Direct message";

  const template = document.getElementById("messageTemplate");
  chat.messages.forEach(message => {
    const node = template.content.firstElementChild.cloneNode(true);
    const mine = message.senderId === state.me.id;
    node.classList.toggle("mine", mine);
    node.querySelector(".message-author").textContent = mine ? "You" : message.senderName;
    node.querySelector(".message-body").textContent = message.text || "";

    const image = node.querySelector(".message-image");
    if (message.attachment?.startsWith("data:image")) {
      image.classList.remove("hidden");
      image.src = message.attachment;
    }

    const receipt = mine
      ? message.readBy.length === chat.members.length
        ? "Seen"
        : "Delivered"
      : "";
    node.querySelector(".message-meta").textContent = `${formatTime(message.createdAt)} ${receipt}`.trim();
    refs.messageList.appendChild(node);
  });

  refs.messageList.scrollTop = refs.messageList.scrollHeight;
}

async function refreshChats() {
  const data = await api("/api/chats", { headers: headers() });
  state.chats = data.chats;
  if (!state.selectedChatId && state.chats.length) {
    state.selectedChatId = state.chats[0].id;
  }
  renderConversations();
  renderMessages();
}

async function markRead(chatId) {
  await api(`/api/chats/${chatId}/read`, { method: "POST", headers: headers() });
}

async function submitAuth(mode) {
  const payload = {
    username: refs.authUsername.value.trim(),
    email: refs.authEmail.value.trim(),
    password: refs.authPassword.value
  };

  const data = await api(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  state.token = data.token;
  state.me = data.user;
  refs.authForm.classList.add("hidden");
  renderProfile();
  await refreshChats();
  setupSocket();
}

async function createDirectChat() {
  const target = prompt("Enter username for direct chat:");
  if (!target) return;
  await api("/api/chats/direct", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ targetUsername: target.trim() })
  });
  await refreshChats();
}

async function createGroupChat() {
  const name = prompt("Group name:");
  if (!name) return;
  const users = prompt("Add usernames (comma separated):", "");
  const memberUsernames = users ? users.split(",").map(item => item.trim()).filter(Boolean) : [];
  await api("/api/chats/group", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: name.trim(), memberUsernames })
  });
  await refreshChats();
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupSocket() {
  state.socket = io({ auth: { token: state.token } });
  state.socket.on("connect", () => setConnection(true));
  state.socket.on("disconnect", () => setConnection(false));

  state.socket.on("chat:message", ({ chatId, message }) => {
    const chat = state.chats.find(item => item.id === chatId);
    if (!chat) return;
    if (chat.messages.some(item => item.id === message.id)) return;
    chat.messages.push(message);
    renderConversations();
    if (chatId === state.selectedChatId) {
      renderMessages();
      markRead(chatId);
    }
  });

  state.socket.on("chat:read", ({ chatId, messageIds, userId }) => {
    const chat = state.chats.find(item => item.id === chatId);
    if (!chat) return;
    chat.messages.forEach(message => {
      if (messageIds.includes(message.id) && !message.readBy.includes(userId)) {
        message.readBy.push(userId);
      }
    });
    if (chatId === state.selectedChatId) renderMessages();
    renderConversations();
  });

  state.socket.on("chat:typing", ({ chatId, username, isTyping }) => {
    if (chatId !== state.selectedChatId || username === state.me.username) return;
    if (isTyping) state.typingUsers.add(username);
    else state.typingUsers.delete(username);
    updateTypingLabel();
  });

  state.socket.on("presence:update", ({ userId, status }) => {
    const chat = currentChat();
    if (!chat || chat.isGroup) return;
    const other = chat.members.find(m => m.id !== state.me.id);
    if (other?.id === userId) refs.chatSubtitle.textContent = `Direct message • ${status}`;
  });
}

async function sendMessage(event) {
  event.preventDefault();
  const chat = currentChat();
  if (!chat) return;

  const text = refs.messageInput.value.trim();
  if (!text && !state.pendingFile) return;

  const payload = {
    text,
    attachment: state.pendingFile?.dataUrl || "",
    attachmentName: state.pendingFile?.name || ""
  };

  await api(`/api/chats/${chat.id}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload)
  });

  refs.messageInput.value = "";
  refs.fileInput.value = "";
  state.pendingFile = null;
  refs.selectedFileName.textContent = "";
}

function wireEvents() {
  refs.authForm.addEventListener("submit", event => {
    event.preventDefault();
    submitAuth("signup").catch(error => alert(error.message));
  });

  refs.loginBtn.addEventListener("click", () => {
    submitAuth("login").catch(error => alert(error.message));
  });

  refs.statusSelect.addEventListener("change", async () => {
    if (!state.socket) return;
    const status = refs.statusSelect.value;
    await api("/api/users/me/status", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ status })
    });
    state.socket.emit("presence:set", { status });
  });

  refs.newDirectChatBtn.addEventListener("click", () => {
    createDirectChat().catch(error => alert(error.message));
  });

  refs.newGroupBtn.addEventListener("click", () => {
    createGroupChat().catch(error => alert(error.message));
  });

  refs.conversationSearch.addEventListener("input", renderConversations);

  refs.messageForm.addEventListener("submit", event => {
    sendMessage(event).catch(error => alert(error.message));
  });

  refs.messageInput.addEventListener("input", () => {
    if (!state.socket || !state.selectedChatId) return;
    state.socket.emit("chat:typing", { chatId: state.selectedChatId, isTyping: true });
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      state.socket.emit("chat:typing", { chatId: state.selectedChatId, isTyping: false });
    }, 900);
  });

  refs.emojiBtn.addEventListener("click", () => {
    refs.messageInput.value += emojiSet[Math.floor(Math.random() * emojiSet.length)];
    refs.messageInput.focus();
  });

  refs.fileInput.addEventListener("change", async () => {
    const file = refs.fileInput.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    state.pendingFile = { name: file.name, dataUrl };
    refs.selectedFileName.textContent = file.name;
  });
}

wireEvents();
