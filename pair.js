require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Pino = require("pino");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SESSIONS_DIR = path.join(__dirname, "sessions");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const sessions = {}; // active sockets
const pairingCodes = {}; // store generated pairing codes

/* 🔌 CREATE USER SESSION */
async function createSession(number) {
  if (sessions[number]) return sessions[number];

  const sessionPath = path.join(SESSIONS_DIR, number);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    if (u.connection === "open") {
      console.log(`✅ ${number} connected`);
    }
    if (u.connection === "close") {
      delete sessions[number];
      console.log(`❌ ${number} disconnected`);
    }
  });

  sessions[number] = sock;
  return sock;
}

/* 🌟 GENERATE PAIRING CODE */
app.post("/generate", async (req, res) => {
  const { number } = req.body;
  if (!number) return res.json({ success: false, error: "Number required" });

  try {
    const sock = await createSession(number);

    // 8-character alphanumeric code
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();

    // store code with expiration (5 min)
    pairingCodes[number] = {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    res.json({
      success: true,
      code,
      expiresIn: 300 // seconds
    });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: "Failed to generate pairing code" });
  }
});

/* 🌟 VERIFY CODE AND LINK SESSION */
app.post("/verify", async (req, res) => {
  const { number, code } = req.body;
  if (!number || !code) return res.json({ success: false, error: "Number & code required" });

  const entry = pairingCodes[number];
  if (!entry || entry.code !== code) return res.json({ success: false, error: "Invalid code" });
  if (Date.now() > entry.expiresAt) return res.json({ success: false, error: "Code expired" });

  try {
    const sock = await createSession(number);
    const sessionId = `${number}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

    // Optionally send session ID via WhatsApp
    await sock.sendMessage(number + "@s.whatsapp.net", {
      text: `✅ MAXX-XMD session linked! Session ID: ${sessionId}`
    });

    delete pairingCodes[number]; // remove used code
    res.json({ success: true, sessionId });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: "Failed to link session" });
  }
});

/* Serve dashboard */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 MAXX‑XMD MULTI‑USER PAIRING SERVER ONLINE");
});
