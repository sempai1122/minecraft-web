const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

const db = {
  users: [],
  chats: []
};

let messageSeq = 1;

app.use(express.json({ limit: "5mb" }));
app.use(rateLimit({ windowMs: 60_000, max: 150 }));
app.use(express.static(path.resolve(__dirname)));

function makeToken(userId) {
  return Buffer.from(JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
}

function parseToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (!payload.userId || payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

function avatarFromUsername(username) {
  const seed = encodeURIComponent(username.trim().toLowerCase());
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    status: user.status
  };
}

function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  const userId = parseToken(token);
  const user = db.users.find(item => item.id === userId);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

function withChatView(chat) {
  return {
    id: chat.id,
    name: chat.name,
    isGroup: chat.isGroup,
    members: chat.memberIds.map(userId => sanitizeUser(db.users.find(item => item.id === userId))),
    messages: chat.messages.map(message => ({ ...message }))
  };
}

function socketUser(socket) {
  const token = socket.handshake.auth?.token || "";
  const userId = parseToken(token);
  return db.users.find(item => item.id === userId);
}

function seedData() {
  const now = new Date().toISOString();
  const users = [
    { id: "u_alex", username: "alex", email: "alex@example.com", passwordHash: "", avatar: avatarFromUsername("alex"), status: "online" },
    { id: "u_sam", username: "sam", email: "sam@example.com", passwordHash: "", avatar: avatarFromUsername("sam"), status: "away" }
  ];

  users.forEach(user => {
    user.passwordHash = bcrypt.hashSync("password123", SALT_ROUNDS);
    db.users.push(user);
  });

  db.chats.push({
    id: "c_general",
    name: "Alex + Sam",
    isGroup: false,
    memberIds: ["u_alex", "u_sam"],
    messages: [
      {
        id: "m_1",
        sequence: messageSeq++,
        senderId: "u_sam",
        senderName: "sam",
        text: "Hey Alex — welcome to PulseChat!",
        attachment: "",
        attachmentName: "",
        createdAt: now,
        deliveredAt: now,
        readBy: ["u_sam"]
      }
    ]
  });
}

app.post("/api/auth/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "Missing signup fields" });
  if (db.users.some(user => user.email === email || user.username === username)) {
    return res.status(409).json({ error: "Username or email already exists" });
  }

  const user = {
    id: `u_${crypto.randomUUID().slice(0, 8)}`,
    username,
    email,
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
    avatar: avatarFromUsername(username),
    status: "online"
  };
  db.users.push(user);

  res.json({ token: makeToken(user.id), user: sanitizeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, email, password } = req.body;
  const user = db.users.find(item => item.email === email || item.username === username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  user.status = "online";
  res.json({ token: makeToken(user.id), user: sanitizeUser(user) });
});

app.post("/api/users/me/status", authRequired, (req, res) => {
  const status = ["online", "away", "offline"].includes(req.body.status) ? req.body.status : "online";
  req.user.status = status;
  io.emit("presence:update", { userId: req.user.id, status });
  res.json({ ok: true });
});

app.get("/api/chats", authRequired, (req, res) => {
  const chats = db.chats
    .filter(chat => chat.memberIds.includes(req.user.id))
    .map(chat => {
      const view = withChatView(chat);
      if (!chat.isGroup) {
        const other = view.members.find(member => member.id !== req.user.id);
        view.name = other ? other.username : view.name;
      }
      return view;
    })
    .sort((a, b) => new Date(b.messages.at(-1)?.createdAt || 0) - new Date(a.messages.at(-1)?.createdAt || 0));

  res.json({ chats });
});

app.post("/api/chats/direct", authRequired, (req, res) => {
  const target = db.users.find(user => user.username === req.body.targetUsername);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === req.user.id) return res.status(400).json({ error: "Cannot create self chat" });

  const existing = db.chats.find(chat => !chat.isGroup && chat.memberIds.includes(req.user.id) && chat.memberIds.includes(target.id));
  if (existing) return res.json({ chat: withChatView(existing) });

  const chat = {
    id: `c_${crypto.randomUUID().slice(0, 8)}`,
    name: `${req.user.username} + ${target.username}`,
    isGroup: false,
    memberIds: [req.user.id, target.id],
    messages: []
  };
  db.chats.push(chat);
  res.json({ chat: withChatView(chat) });
});

app.post("/api/chats/group", authRequired, (req, res) => {
  const { name, memberUsernames = [] } = req.body;
  if (!name) return res.status(400).json({ error: "Group name required" });

  const memberIds = new Set([req.user.id]);
  memberUsernames.forEach(username => {
    const user = db.users.find(item => item.username === username);
    if (user) memberIds.add(user.id);
  });

  const chat = {
    id: `c_${crypto.randomUUID().slice(0, 8)}`,
    name,
    isGroup: true,
    memberIds: [...memberIds],
    messages: []
  };
  db.chats.push(chat);
  res.json({ chat: withChatView(chat) });
});

app.post("/api/chats/:chatId/messages", authRequired, (req, res) => {
  const { chatId } = req.params;
  const chat = db.chats.find(item => item.id === chatId && item.memberIds.includes(req.user.id));
  if (!chat) return res.status(404).json({ error: "Chat not found" });

  const messageId = req.body.clientMessageId || `m_${crypto.randomUUID().slice(0, 12)}`;
  if (chat.messages.some(message => message.id === messageId)) {
    return res.json({ duplicate: true });
  }

  const now = new Date().toISOString();
  const message = {
    id: messageId,
    sequence: messageSeq++,
    senderId: req.user.id,
    senderName: req.user.username,
    text: req.body.text || "",
    attachment: req.body.attachment || "",
    attachmentName: req.body.attachmentName || "",
    createdAt: now,
    deliveredAt: now,
    readBy: [req.user.id]
  };

  chat.messages.push(message);
  io.to(chat.id).emit("chat:message", { chatId: chat.id, message });
  res.json({ message });
});

app.post("/api/chats/:chatId/read", authRequired, (req, res) => {
  const chat = db.chats.find(item => item.id === req.params.chatId && item.memberIds.includes(req.user.id));
  if (!chat) return res.status(404).json({ error: "Chat not found" });

  const updated = [];
  chat.messages.forEach(message => {
    if (!message.readBy.includes(req.user.id)) {
      message.readBy.push(req.user.id);
      updated.push(message.id);
    }
  });

  if (updated.length) {
    io.to(chat.id).emit("chat:read", { chatId: chat.id, userId: req.user.id, messageIds: updated });
  }

  res.json({ updated });
});

io.use((socket, next) => {
  const user = socketUser(socket);
  if (!user) return next(new Error("Unauthorized"));
  socket.user = user;
  next();
});

io.on("connection", socket => {
  const userChats = db.chats.filter(chat => chat.memberIds.includes(socket.user.id));
  userChats.forEach(chat => socket.join(chat.id));

  socket.on("chat:typing", ({ chatId, isTyping }) => {
    const chat = db.chats.find(item => item.id === chatId && item.memberIds.includes(socket.user.id));
    if (!chat) return;
    socket.to(chat.id).emit("chat:typing", { chatId, username: socket.user.username, isTyping: Boolean(isTyping) });
  });

  socket.on("presence:set", ({ status }) => {
    socket.user.status = ["online", "away", "offline"].includes(status) ? status : "online";
    io.emit("presence:update", { userId: socket.user.id, status: socket.user.status });
  });

  socket.on("disconnect", () => {
    socket.user.status = "offline";
    io.emit("presence:update", { userId: socket.user.id, status: "offline" });
  });
});

seedData();

server.listen(PORT, () => {
  console.log(`PulseChat running on http://localhost:${PORT}`);
});
