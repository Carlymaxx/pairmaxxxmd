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


const sessions = {}; // active sockets

/* 🔌 CREATE USER SESSION */
async function createSession(number) {
  if (sessions[number]) return sessions[number];

  const sessionPath = path.join(__dirname, "sessions", number);
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
const path = require("path");

// Serve dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});


/* 🔢 REAL PAIRING CODE */
app.post("/generate", async (req, res) => {
  const { number } = req.body;
  if (!number) {
    return res.json({ success: false, error: "Number required" });
  }

  try {
    const sock = await createSession(number);
    const code = await sock.requestPairingCode(number);

    res.json({
      success: true,
      code,
      expiresIn: 300,
      server: true
    });
  } catch (e) {
    console.error(e);
    res.json({
      success: false,
      error: "Failed to generate pairing code"
    });
  }
});

/* 🌍 FRONTEND */
app.use(express.static("public"));

app.listen(3000, () => {
  console.log("🚀 MAXX‑XMD MULTI‑USER PAIRING SERVER ONLINE");
});
