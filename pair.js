require('dotenv').config();
const path = require("path");
const fs = require('fs');
const express = require("express");
const cors = require("cors");

// Import your original bot
const bot = require("./index.js"); // <-- your original index.js bot

// --- Constants ---
const PORT = process.env.PORT || 3000;
const BOT_OWNER = process.env.BOT_OWNER || 'MAXX';
const BOT_DEV = process.env.BOT_DEVELOPER || 'MAXX TECH';
const SESSION_PREFIX = process.env.SESSION_PREFIX || 'MAXX-XMD';
const DB_FILE = path.join(__dirname, 'db.json');
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// --- Initialize DB ---
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, sessions: {} }, null, 2));
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- Express setup ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // serve dashboard

// --- Bot instance ---
let sock;
async function startBot() {
    try {
        sock = await bot.startBot(); // assumes your index.js exports startBot()
        console.log("✅ MAXX-XMD bot connected");
    } catch (err) {
        console.error("❌ Bot startup error:", err);
    }
}
startBot();

// --- Status route ---
app.get('/status', (req, res) => {
    res.json({ connected: sock ? sock.ws?.readyState === 1 : false });
});

// --- Helper to send WhatsApp message ---
async function sendWhatsApp(number, message) {
    if (!sock) throw new Error('Bot not ready');
    const jid = number.includes('@') ? number : number + '@s.whatsapp.net';
    return await sock.sendMessage(jid, { text: message });
}

// --- Routes ---

// 1️⃣ Generate verification code
app.post('/generate', async (req, res) => {
    try {
        const number = (req.body.number || '').trim();
        if (!/^\d{6,15}$/.test(number)) return res.status(400).json({ error: 'Invalid phone number' });

        const db = readDB();
        db.users[number] = db.users[number] || { code: null, session: null, sessionExpiresAt: null };

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        db.users[number].code = code;
        db.users[number].lastSentAt = Date.now();
        writeDB(db);

        const message = `🔐 MAXX-XMD VERIFICATION CODE\nYour code: *${code}*\nOwner: ${BOT_OWNER}\nDeveloper: ${BOT_DEV}`;
        await sendWhatsApp(number, message);

        res.json({ message: 'Verification code sent to WhatsApp ✅' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2️⃣ Verify code and create session
app.post('/verify', async (req, res) => {
    try {
        const { number, code } = req.body;
        if (!number || !code) return res.status(400).json({ error: 'Number and code required' });

        const db = readDB();
        const user = db.users[number];
        if (!user || user.code !== code) return res.status(400).json({ error: 'Invalid or expired code' });

        const sessionId = `${SESSION_PREFIX}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

        db.sessions[sessionId] = { number, createdAt: Date.now(), expiresAt };
        user.session = sessionId;
        user.sessionExpiresAt = expiresAt;
        user.code = null;
        writeDB(db);

        await sendWhatsApp(number, `✅ MAXX-XMD session generated!\nSession ID: ${sessionId}\nValid 24h`);
        res.json({ message: 'Verification successful! Session sent to WhatsApp', sessionId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// 3️⃣ Cleanup expired sessions
setInterval(() => {
    try {
        const db = readDB();
        const now = Date.now();
        for (const sid in db.sessions) {
            if (db.sessions[sid].expiresAt <= now) {
                const num = db.sessions[sid].number;
                if (db.users[num]) db.users[num].session = db.users[num].sessionExpiresAt = null;
                delete db.sessions[sid];
            }
        }
        writeDB(db);
    } catch (e) {
        console.error('Cleanup error', e);
    }
}, 10 * 60 * 1000); // every 10 min

// --- Start server ---
app.listen(PORT, () => console.log(`🚀 MAXX-XMD server listening on port ${PORT}`));
