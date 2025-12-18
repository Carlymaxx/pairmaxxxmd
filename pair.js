require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const bot = require("./index.js"); // your WhatsApp bot logic

const PORT = process.env.PORT || 10000;
const SESSION_PREFIX = process.env.SESSION_PREFIX || "MAXX-XMD";

const DB_FILE = path.join(__dirname, "db.json");
const SESSIONS_DIR = path.join(__dirname, "sessions");

// Create storage if not exists
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ sessions: {} }, null, 2));

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (d) => fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----- Start main bot session -----
bot.startBotSession("main").catch(console.error);

// ----- Serve dashboard -----
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});

// ----- Generate 6-digit code & send to WhatsApp -----
app.post("/generate", async (req, res) => {
  try {
    const number = req.body.number;
    if (!number) return res.status(400).json({ success: false, error: "Number required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const sessionId = `${SESSION_PREFIX}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

    // Save session temporarily
    const db = readDB();
    db.sessions[sessionId] = { number, code, verified: false, createdAt: Date.now() };
    writeDB(db);

    // Send code via WhatsApp
    await bot.sendMessage(number, `Your Maxx XMD code: ${code}`);

    res.json({ success: true, message: "Code sent to WhatsApp", sessionId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Failed to generate code" });
  }
});

// ----- Verify code -----
app.post("/verify", async (req, res) => {
  try {
    const { number, code } = req.body;
    const db = readDB();
    const sessionEntry = Object.values(db.sessions).find(s => s.number === number && s.code === code);

    if (!sessionEntry) return res.status(400).json({ success: false, error: "Invalid code" });

    sessionEntry.verified = true;
    const sessionId = Object.keys(db.sessions).find(k => db.sessions[k] === sessionEntry);

    // Send session ID to WhatsApp
    await bot.sendMessage(number, `✅ Maxx XMD session linked! Session ID: ${sessionId}`);

    writeDB(db);

    res.json({ success: true, sessionId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

// ----- Cleanup expired sessions -----
setInterval(() => {
  const db = readDB();
  const now = Date.now();

  for (const id in db.sessions) {
    if (db.sessions[id].expiresAt && db.sessions[id].expiresAt < now) {
      delete db.sessions[id];
      if (bot.sockets) delete bot.sockets[id];
      console.log(`🗑 Session ${id} expired`);
    }
  }

  writeDB(db);
}, 10 * 60 * 1000);

// ----- Start server -----
app.listen(PORT, () => console.log(`🚀 MAXX-XMD server running on port ${PORT}`));
