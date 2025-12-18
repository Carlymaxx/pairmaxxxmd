require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const bot = require("./index.js"); // MUST export sendMessage()

const PORT = process.env.PORT || 10000;
const SESSION_PREFIX = "MAXX-XMD";

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

/* GENERATE 6-DIGIT CODE */
app.post("/generate", async (req, res) => {
  try {
    const number = req.body.number?.trim();
    if (!number) {
      return res.status(400).json({ success: false, error: "Number required" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionId = `${SESSION_PREFIX}-${Math.random().toString(36).slice(2,10).toUpperCase()}`;

    const db = readDB();
    db.sessions[sessionId] = {
      number,
      code,
      verified: false,
      createdAt: Date.now()
    };
    writeDB(db);

    res.json({
      success: true,
      code,
      message: "Code generated. Copy and link WhatsApp."
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Failed to generate code" });
  }
});

/* VERIFY CODE + SEND SESSION ID TO WHATSAPP */
app.post("/verify", async (req, res) => {
  try {
    const { number, code } = req.body;
    const db = readDB();

    const sessionKey = Object.keys(db.sessions).find(
      k => db.sessions[k].number === number && db.sessions[k].code === code
    );

    if (!sessionKey) {
      return res.status(400).json({ success: false, error: "Invalid code" });
    }

    db.sessions[sessionKey].verified = true;
    writeDB(db);

    // 🔥 SEND SESSION ID TO WHATSAPP
    await bot.sendMessage(
      number,
      `✅ MAXX-XMD SESSION LINKED\n\nSESSION ID:\n${sessionKey}\n\nKeep it safe.`
    );

    res.json({
      success: true,
      sessionId: sessionKey,
      message: "Session ID sent to WhatsApp"
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 MAXX-XMD running on port ${PORT}`);
});
