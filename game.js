const EMOJIS = ["😀", "😂", "🔥", "❤️", "👍", "🎉", "🚀", "🤝", "✅"];

const state = {
  currentUser: null,
  activeChatId: null,
  chats: [],
  typingTimers: new Map(),
  rateWindow: []
};

const refs = {
  authSection: document.getElementById("authSection"),
  authForm: document.getElementById("authForm"),
  usernameInput: document.getElementById("usernameInput"),
  emailInput: document.getElementById("emailInput"),
  profileSection: document.getElementById("profileSection"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileName: document.getElementById("profileName"),
  profileEmail: document.getElementById("profileEmail"),
  toggleStatusBtn: document.getElementById("toggleStatusBtn"),
  chatList: document.getElementById("chatList"),
  chatHeader: document.getElementById("chatHeader"),
  messageFeed: document.getElementById("messageFeed"),
  typingIndicator: document.getElementById("typingIndicator"),
  composer: document.getElementById("composer"),
  messageInput: document.getElementById("messageInput"),
  emojiBtn: document.getElementById("emojiBtn"),
  fileInput: document.getElementById("fileInput"),
  newGroupBtn: document.getElementById("newGroupBtn")
};

const users = [
  { id: "u-alex", username: "Alex", avatar: avatarFromSeed("Alex"), status: "online", email: "alex@pulse.app" },
  { id: "u-jamie", username: "Jamie", avatar: avatarFromSeed("Jamie"), status: "online", email: "jamie@pulse.app" },
  { id: "u-lee", username: "Lee", avatar: avatarFromSeed("Lee"), status: "offline", email: "lee@pulse.app" },
  { id: "u-sam", username: "Sam", avatar: avatarFromSeed("Sam"), status: "online", email: "sam@pulse.app" }
];

function seedChats() {
  const now = Date.now();
  return [
    {
      id: "c-jamie",
      type: "direct",
      name: "Jamie",
      participantIds: ["u-alex", "u-jamie"],
      messages: [
        mkMessage("m1", "u-jamie", "Hey Alex — API gateway deploy is done.", now - 1000 * 60 * 24, "seen", 1),
        mkMessage("m2", "u-alex", "Nice. Any latency impact?", now - 1000 * 60 * 18, "seen", 2),
        mkMessage("m3", "u-jamie", "p95 improved by ~14ms 🎉", now - 1000 * 60 * 14, "delivered", 3)
      ],
      nextSeq: 4
    },
    {
      id: "c-lee",
      type: "direct",
      name: "Lee",
      participantIds: ["u-alex", "u-lee"],
      messages: [
        mkMessage("m4", "u-lee", "Can you review the moderation queue rules?", now - 1000 * 60 * 45, "seen", 1)
      ],
      nextSeq: 2
    },
    {
      id: "g-product",
      type: "group",
      name: "Product Launch",
      participantIds: ["u-alex", "u-jamie", "u-sam"],
      messages: [
        mkMessage("m5", "u-sam", "Kickoff at 3 PM UTC.", now - 1000 * 60 * 70, "seen", 1),
        mkMessage("m6", "u-jamie", "Deck + demo script uploaded.", now - 1000 * 60 * 62, "seen", 2)
      ],
      nextSeq: 3
    }
  ];
}

function mkMessage(id, senderId, text, sentAt, status, seq, attachment = null) {
  return { id, senderId, text, sentAt, status, seq, attachment };
}

function avatarFromSeed(seed) {
  const initials = encodeURIComponent(seed.slice(0, 2).toUpperCase());
  return `https://api.dicebear.com/9.x/initials/svg?seed=${initials}&radius=50&backgroundType=gradientLinear`;
}

function findUser(id) {
  return users.find(user => user.id === id);
}

function sanitize(text) {
  return text.replace(/[<>]/g, "").trim();
}

function isRateLimited() {
  const now = Date.now();
  state.rateWindow = state.rateWindow.filter(ts => now - ts < 10_000);
  if (state.rateWindow.length >= 6) return true;
  state.rateWindow.push(now);
  return false;
}

function moderateText(text) {
  const banned = ["scam", "phish", "abuse"];
  return !banned.some(word => text.toLowerCase().includes(word));
}

function getActiveChat() {
  return state.chats.find(chat => chat.id === state.activeChatId);
}

function latestMessage(chat) {
  return chat.messages.slice().sort((a, b) => b.seq - a.seq)[0];
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function renderProfile() {
  if (!state.currentUser) return;
  refs.authSection.classList.add("hidden");
  refs.profileSection.classList.remove("hidden");
  refs.profileAvatar.src = state.currentUser.avatar;
  refs.profileName.textContent = state.currentUser.username;
  refs.profileEmail.textContent = state.currentUser.email || "No email provided";
  refs.toggleStatusBtn.textContent = state.currentUser.status === "online" ? "Go Offline" : "Go Online";
}

function renderChatList() {
  refs.chatList.innerHTML = "";
  const template = document.getElementById("chatItemTemplate");
  const sorted = state.chats
    .slice()
    .sort((a, b) => (latestMessage(b)?.sentAt || 0) - (latestMessage(a)?.sentAt || 0));

  sorted.forEach(chat => {
    const node = template.content.firstElementChild.cloneNode(true);
    const partner = findUser(chat.participantIds.find(id => id !== state.currentUser.id));
    const preview = latestMessage(chat);

    node.querySelector(".avatar").src = chat.type === "group" ? avatarFromSeed(chat.name) : partner?.avatar || avatarFromSeed(chat.name);
    node.querySelector(".chat-name").textContent = chat.name;
    node.querySelector(".chat-preview").textContent = preview ? preview.text || "Sent an attachment" : "No messages yet";
    node.querySelector(".chat-time").textContent = preview ? formatTimestamp(preview.sentAt) : "";

    if (chat.id === state.activeChatId) node.classList.add("active");
    node.addEventListener("click", () => {
      state.activeChatId = chat.id;
      renderChatList();
      renderActiveChat();
      markSeen(chat.id);
    });

    refs.chatList.appendChild(node);
  });
}

function renderActiveChat() {
  const chat = getActiveChat();
  refs.messageFeed.innerHTML = "";

  if (!chat) {
    refs.chatHeader.innerHTML = `<div><h2>Select a conversation</h2><p>Pick a chat to start messaging.</p></div>`;
    refs.composer.classList.add("hidden");
    refs.typingIndicator.textContent = "";
    return;
  }

  refs.composer.classList.remove("hidden");
  const participants = chat.participantIds.map(findUser).filter(Boolean);
  const statuses = participants
    .filter(user => user.id !== state.currentUser.id)
    .map(user => `${user.username} · ${user.status}`)
    .join(" • ");

  refs.chatHeader.innerHTML = `<div><h2>${chat.name}</h2><p>${statuses || "group"}</p></div>`;

  const template = document.getElementById("messageTemplate");
  chat.messages
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .forEach(message => {
      const node = template.content.firstElementChild.cloneNode(true);
      const sender = findUser(message.senderId);
      node.querySelector(".sender").textContent = sender?.username || "Unknown";
      node.querySelector(".timestamp").textContent = formatTimestamp(message.sentAt);
      node.querySelector(".text").textContent = message.text;
      node.querySelector(".receipt").textContent = message.senderId === state.currentUser.id ? `✓ ${message.status}` : "";

      if (message.attachment) {
        const attachmentEl = node.querySelector(".attachment");
        if (message.attachment.kind === "image") {
          const img = document.createElement("img");
          img.src = message.attachment.url;
          img.alt = message.attachment.name;
          attachmentEl.appendChild(img);
        } else {
          const link = document.createElement("a");
          link.href = message.attachment.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = `📄 ${message.attachment.name}`;
          attachmentEl.appendChild(link);
        }
      }

      if (message.senderId === state.currentUser.id) {
        node.classList.add("self");
      }

      refs.messageFeed.appendChild(node);
    });

  refs.messageFeed.scrollTop = refs.messageFeed.scrollHeight;
}

function sendTypingSignal() {
  const chat = getActiveChat();
  if (!chat || chat.type !== "direct") return;

  const otherUserId = chat.participantIds.find(id => id !== state.currentUser.id);
  const otherUser = findUser(otherUserId);
  if (!otherUser || otherUser.status === "offline") return;

  refs.typingIndicator.textContent = `${otherUser.username} is typing...`;

  clearTimeout(state.typingTimers.get(chat.id));
  const timer = setTimeout(() => {
    refs.typingIndicator.textContent = "";
  }, 1200);
  state.typingTimers.set(chat.id, timer);
}

function queueDeliveryUpdate(chat, message) {
  setTimeout(() => {
    message.status = "delivered";
    renderActiveChat();
    renderChatList();
  }, 350);

  setTimeout(() => {
    if (chat.id === state.activeChatId) {
      message.status = "seen";
      renderActiveChat();
      renderChatList();
    }
  }, 1200);
}

function markSeen(chatId) {
  const chat = state.chats.find(item => item.id === chatId);
  if (!chat) return;

  chat.messages.forEach(message => {
    if (message.senderId !== state.currentUser.id) {
      message.status = "seen";
    }
  });
  renderActiveChat();
}

function maybeAutoReply(chat, prompt) {
  if (chat.type !== "direct") return;
  const recipientId = chat.participantIds.find(id => id !== state.currentUser.id);
  const recipient = findUser(recipientId);
  if (!recipient || recipient.status === "offline") return;

  refs.typingIndicator.textContent = `${recipient.username} is typing...`;

  setTimeout(() => {
    refs.typingIndicator.textContent = "";
    const reply = mkMessage(
      `m-${crypto.randomUUID()}`,
      recipient.id,
      `Ack: ${prompt.slice(0, 80) || "Received your update."}`,
      Date.now(),
      "seen",
      chat.nextSeq++
    );

    chat.messages.push(reply);
    chat.messages.sort((a, b) => a.seq - b.seq);
    renderActiveChat();
    renderChatList();
  }, 900 + Math.random() * 900);
}

function createAttachment(file) {
  const url = URL.createObjectURL(file);
  return {
    name: file.name,
    kind: file.type.startsWith("image/") ? "image" : "file",
    url
  };
}

function submitMessage(event) {
  event.preventDefault();
  const chat = getActiveChat();
  if (!chat || !state.currentUser) return;

  const text = sanitize(refs.messageInput.value);
  const file = refs.fileInput.files[0];

  if (!text && !file) return;
  if (isRateLimited()) {
    alert("Rate limit: wait a moment before sending more messages.");
    return;
  }
  if (text && !moderateText(text)) {
    alert("Message blocked by moderation rules in this demo.");
    return;
  }

  const message = mkMessage(
    `m-${crypto.randomUUID()}`,
    state.currentUser.id,
    text,
    Date.now(),
    "sending",
    chat.nextSeq++,
    file ? createAttachment(file) : null
  );

  chat.messages.push(message);
  chat.messages.sort((a, b) => a.seq - b.seq);
  refs.messageInput.value = "";
  refs.fileInput.value = "";
  refs.typingIndicator.textContent = "";
  renderActiveChat();
  renderChatList();

  queueDeliveryUpdate(chat, message);
  maybeAutoReply(chat, text);
}

function signIn(event) {
  event.preventDefault();
  const username = sanitize(refs.usernameInput.value);
  if (!username) return;

  const email = sanitize(refs.emailInput.value) || `${username.toLowerCase()}@pulse.app`;
  state.currentUser = {
    id: `u-${username.toLowerCase().replace(/\s+/g, "-")}`,
    username,
    email,
    status: "online",
    avatar: avatarFromSeed(username)
  };

  if (!users.find(user => user.id === state.currentUser.id)) {
    users.unshift(state.currentUser);
  }

  state.chats = seedChats().map(chat => ({
    ...chat,
    participantIds: chat.participantIds.map(id => (id === "u-alex" ? state.currentUser.id : id)),
    messages: chat.messages.map(message => ({
      ...message,
      senderId: message.senderId === "u-alex" ? state.currentUser.id : message.senderId
    }))
  }));

  state.activeChatId = state.chats[0]?.id || null;
  renderProfile();
  renderChatList();
  renderActiveChat();
}

function toggleStatus() {
  if (!state.currentUser) return;
  state.currentUser.status = state.currentUser.status === "online" ? "offline" : "online";
  const realUser = users.find(user => user.id === state.currentUser.id);
  if (realUser) realUser.status = state.currentUser.status;
  refs.toggleStatusBtn.textContent = state.currentUser.status === "online" ? "Go Offline" : "Go Online";
  renderActiveChat();
}

function createGroup() {
  if (!state.currentUser) return;
  const name = prompt("Group name:", "New Project Group");
  if (!name) return;

  const participant = users.find(user => user.id !== state.currentUser.id && user.status === "online");
  const group = {
    id: `g-${crypto.randomUUID()}`,
    type: "group",
    name: sanitize(name),
    participantIds: [state.currentUser.id, participant?.id || "u-jamie"],
    messages: [],
    nextSeq: 1
  };

  state.chats.unshift(group);
  state.activeChatId = group.id;
  renderChatList();
  renderActiveChat();
}

function insertEmoji() {
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  refs.messageInput.value += emoji;
  refs.messageInput.focus();
}

function autoGrowComposer() {
  refs.messageInput.style.height = "auto";
  refs.messageInput.style.height = `${Math.min(refs.messageInput.scrollHeight, 130)}px`;
}

function wireEvents() {
  refs.authForm.addEventListener("submit", signIn);
  refs.composer.addEventListener("submit", submitMessage);
  refs.toggleStatusBtn.addEventListener("click", toggleStatus);
  refs.newGroupBtn.addEventListener("click", createGroup);
  refs.emojiBtn.addEventListener("click", insertEmoji);
  refs.messageInput.addEventListener("input", () => {
    autoGrowComposer();
    sendTypingSignal();
  });
}

wireEvents();
