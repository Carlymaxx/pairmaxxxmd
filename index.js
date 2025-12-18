console.log("index.js loaded successfully")
console.log("index.js loaded successfully");

const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const sockets = {}; // sessionId => sock

async function startBotSession(sessionId) {
  if (sockets[sessionId]) return sockets[sessionId];

  const sessionPath = path.join(__dirname, "sessions", sessionId);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ["MAXX-XMD", "Chrome", "1.0"]
  });

  sockets[sessionId] = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`📲 QR for session ${sessionId}`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log(`✅ [${sessionId}] WhatsApp connected`);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ [${sessionId}] Disconnected`, reason);

      if (reason === DisconnectReason.loggedOut) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        delete sockets[sessionId];
      } else {
        setTimeout(() => startBotSession(sessionId), 5000);
      }
    }
  });

  // SIMPLE COMMAND TEST
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message?.conversation) return;

    if (msg.message.conversation === ".ping") {
      await sock.sendMessage(msg.key.remoteJid, { text: "PONG ✅" });
    }
  });

  return sock;
}

module.exports = {
  startBotSession,
  sockets
};
