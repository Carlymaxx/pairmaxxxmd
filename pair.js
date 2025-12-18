require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const bot = require("./index.js");

const PORT = process.env.PORT || 10000;
const SESSION_PREFIX = "MAXX-XMD";
const CODE_EXPIRY = 5 * 60 * 1000; // 5 minutes

const DB_FILE = path.join(__dirname, "db.json");
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ sessions: {} }, null, 2));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const writeDB = (d) => fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ROOT */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});

/* ===============================
   GENERATE / REGENERATE CODE
================================ */
app.post("/generate", async (req, res) => {
  try {
    const number = req.body.number?.trim();
    if (!number) {
      return res.status(400).json({ success: false, error: "Number required" });
    }

    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    const sessionId = `${SESSION_PREFIX}-${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

    const db = readDB();

    // Remove old sessions for same number
    for (const k in db.sessions) {
      if (db.sessions[k].number === number && !db.sessions[k].verified) {
        delete db.sessions[k];
      }
    }

    db.sessions[sessionId] = {
      number,
      code,
      verified: false,
      used: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + CODE_EXPIRY
    };

    writeDB(db);

    res.json({
      success: true,
      code,
      expiresIn: "5 minutes",
      message: "8-digit linking code generated"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Failed to generate code" });
  }
});

/* ===============================
   VERIFY CODE (ONE-TIME)
================================ */
app.post("/verify", async (req, res) => {
  try {
    const { number, code } = req.body;
    const db = readDB();

    const sessionKey = Object.keys(db.sessions).find(k => {
      const s = db.sessions[k];
      return (
        s.number === number &&
        s.code === code &&
        !s.used &&
        !s.verified &&
        s.expiresAt > Date.now()
      );
    });

    if (!sessionKey) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired code"
      });
    }

    const session = db.sessions[sessionKey];
    session.used = true;
    session.verified = true;

    writeDB(db);

    await bot.sendMessage(
      number,
      `✅ MAXX-XMD LINK SUCCESSFUL\n\nSESSION ID:\n${sessionKey}\n\n⚠️ Keep it safe`
    );

    res.json({
      success: true,
      sessionId: sessionKey
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

/* ===============================
   ADMIN SESSION PANEL
================================ */
app.get("/admin/sessions", (req, res) => {
  const db = readDB();
  res.json(db.sessions);
});

/* ===============================
   AUTO CLEANUP
================================ */
setInterval(() => {
  const db = readDB();
  const now = Date.now();
  let changed = false;

  for (const k in db.sessions) {
    if (db.sessions[k].expiresAt < now && !db.sessions[k].verified) {
      delete db.sessions[k];
      changed = true;
    }
  }

  if (changed) writeDB(db);
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 MAXX-XMD running on port ${PORT}`);
});
