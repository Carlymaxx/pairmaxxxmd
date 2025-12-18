require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const bot = require("./index.js");

const PORT = process.env.PORT || 10000;
const SESSION_PREFIX = process.env.SESSION_PREFIX || "MAXX-XMD";

const DB_FILE = path.join(__dirname, "db.json");
const SESSIONS_DIR = path.join(__dirname, "sessions");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 SERVE DASHBOARD
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});


/* INIT STORAGE */
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ sessions: {} }, null, 2));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (d) => fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));

/* EXPRESS */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* START MAIN BOT */
bot.startBotSession("main").catch(console.error);

/* ROOT */
app.get("/", (req, res) => {
  res.send("<h1>MAXX-XMD ONLINE ✅</h1>");
});

/* CREATE SESSION */
app.post("/generate", async (req, res) => {
  try {
    const number = req.body.number;
    if (!number) return res.status(400).json({ error: "Number required" });

    const sessionId = `${SESSION_PREFIX}-${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

    const db = readDB();
    db.sessions[sessionId] = {
      number,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    };

    writeDB(db);

    await bot.startBotSession(sessionId);

    res.json({
      success: true,
      sessionId,
      message: "Scan QR from Render logs"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/* CLEANUP */
setInterval(() => {
  const db = readDB();
  const now = Date.now();

  for (const id in db.sessions) {
    if (db.sessions[id].expiresAt < now) {
      delete db.sessions[id];
      delete bot.sockets[id];
      console.log(`🗑 Session ${id} expired`);
    }
  }

  writeDB(db);
}, 10 * 60 * 1000);

/* START SERVER */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});
