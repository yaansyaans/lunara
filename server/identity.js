// Who is making a request. Every browser gets an anonymous device token; signing in to
// Lunara CloudSync (username + passcode, no email) swaps it for an account session.
// Wallets, inventory and AI usage hang off whichever of the two the request carries.
import crypto from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import { db, save, today } from "./store.js";

const scrypt = promisify(crypto.scrypt);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");

const trustProxy = process.env.TRUST_PROXY === "1";
export const clientIp = (req) => {
    if (trustProxy) {
        const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
        if (forwarded)
            return forwarded;
    }
    return req.socket.remoteAddress ?? "";
};

// Fixed-window counters keyed by anything (IP, account). Used for every limit that
// does not need to survive a restart.
const windows = new Map();
export const hit = (key, limit, windowMs) => {
    const now = Date.now();
    let entry = windows.get(key);
    if (!entry || now >= entry.reset) {
        entry = { count: 0, reset: now + windowMs };
        windows.set(key, entry);
    }
    entry.count++;
    return { ok: entry.count <= limit, retryAfter: Math.ceil((entry.reset - now) / 1000) };
};
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows)
        if (now >= entry.reset)
            windows.delete(key);
}, 60_000).unref();

export const newProfile = () => ({
    coins: 0,
    credits: 0,
    inventory: [],
    equipped: { title: null, text: null },
    searches: { count: 0, target: 5 + crypto.randomInt(3) },
    earned: { day: today(), coins: 0 },
    ai: { day: today(), used: 0 }
});

const resolveToken = (token) => {
    if (typeof token !== "string" || token.length < 20 || token.length > 100)
        return null;
    const hash = sha(token);
    const session = db.sessions[hash];
    if (session) {
        const account = db.accounts[session.user];
        if (account)
            return { key: `u:${session.user}`, username: session.user, profile: account.profile, account, sessionHash: hash };
        delete db.sessions[hash];
        save();
    }
    const device = db.devices[hash];
    if (device) {
        device.seen = Date.now();
        return { key: `d:${hash.slice(0, 16)}`, username: null, profile: device.profile, device, deviceHash: hash };
    }
    return null;
};

export const identify = (req) => resolveToken(req.get("x-lunara-token"));

// Middleware for routes that need a wallet. Anonymous visitors must first ask for a
// device token, which the client does on boot.
export const requireIdentity = (req, res, next) => {
    const who = identify(req);
    if (!who) {
        res.status(401).json({ error: "Missing or unknown Lunara token. Reload the page." });
        return;
    }
    req.who = who;
    next();
};

const usernameOk = (value) => typeof value === "string" && /^[a-z0-9_]{3,20}$/.test(value);
const passcodeOk = (value) => typeof value === "string" && value.length >= 6 && value.length <= 64;

const hashPasscode = async (passcode, salt = crypto.randomBytes(16).toString("hex")) => {
    const key = await scrypt(passcode, salt, 64);
    return { salt, hash: key.toString("hex") };
};

export const endSessions = (user) => {
    let count = 0;
    for (const [key, session] of Object.entries(db.sessions)) {
        if (session.user === user) {
            delete db.sessions[key];
            count++;
        }
    }
    return count;
};

const startSession = (user) => {
    const token = newToken();
    db.sessions[sha(token)] = { user, created: Date.now() };
    return token;
};

// Coins and purchases made before signing in follow the user into the account, so
// nobody loses progress by creating one later. Daily AI usage is merged too, so signing
// in is not a way to reset it.
const absorbDevice = (account, device) => {
    if (!device)
        return;
    const from = device.profile;
    const to = account.profile;
    to.coins += from.coins;
    to.credits += from.credits;
    to.inventory = [...new Set([...to.inventory, ...from.inventory])];
    if (from.ai.day === today()) {
        if (to.ai.day !== today())
            to.ai = { day: today(), used: 0 };
        to.ai.used += from.ai.used;
    }
    from.coins = 0;
    from.credits = 0;
    from.inventory = [];
};

const publicProfile = (who) => ({
    username: who.username,
    coins: who.profile.coins,
    credits: who.profile.credits,
    inventory: who.profile.inventory,
    equipped: who.profile.equipped
});
export { publicProfile };

export const router = express.Router();
const json = express.json({ limit: "8kb" });

router.post("/api/id/device", (req, res) => {
    const limit = hit(`device:${clientIp(req)}`, 20, 24 * 3600_000);
    if (!limit.ok) {
        res.status(429).json({ error: "Too many new devices from this network today." });
        return;
    }
    const token = newToken();
    db.devices[sha(token)] = { created: Date.now(), seen: Date.now(), profile: newProfile() };
    save();
    res.json({ token });
});

router.get("/api/account/me", requireIdentity, (req, res) => {
    res.json(publicProfile(req.who));
});

const authLimit = (req, res) => {
    const limit = hit(`auth:${clientIp(req)}`, 15, 10 * 60_000);
    if (!limit.ok)
        res.status(429).json({ error: `Too many attempts. Try again in ${limit.retryAfter}s.` });
    return limit.ok;
};

router.post("/api/account/signup", json, async (req, res) => {
    if (!authLimit(req, res))
        return;
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const passcode = req.body?.passcode;
    if (!usernameOk(username)) {
        res.status(400).json({ error: "Usernames are 3-20 characters: a-z, 0-9 and _." });
        return;
    }
    if (!passcodeOk(passcode)) {
        res.status(400).json({ error: "Passcodes are 6-64 characters." });
        return;
    }
    if (db.accounts[username]) {
        res.status(409).json({ error: "That username is taken." });
        return;
    }
    const account = { created: Date.now(), passcode: await hashPasscode(passcode), profile: newProfile(), sync: null };
    db.accounts[username] = account;
    absorbDevice(account, identify(req)?.device);
    const token = startSession(username);
    save();
    res.json({ token, username });
});

router.post("/api/account/login", json, async (req, res) => {
    if (!authLimit(req, res))
        return;
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const passcode = req.body?.passcode;
    const account = usernameOk(username) ? db.accounts[username] : null;
    // Hash even when the account does not exist so timing does not reveal which names are taken.
    const { hash } = await hashPasscode(String(passcode ?? ""), account?.passcode.salt ?? "0".repeat(32));
    if (!account || !crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(account.passcode.hash, "hex"))) {
        res.status(401).json({ error: "Wrong username or passcode." });
        return;
    }
    absorbDevice(account, identify(req)?.device);
    const token = startSession(username);
    save();
    res.json({ token, username });
});

router.post("/api/account/logout", requireIdentity, (req, res) => {
    if (req.who.sessionHash) {
        delete db.sessions[req.who.sessionHash];
        save();
    }
    res.status(204).end();
});

router.get("/api/account/sync", requireIdentity, (req, res) => {
    if (!req.who.account) {
        res.status(403).json({ error: "Sign in to CloudSync first." });
        return;
    }
    res.json({ settings: req.who.account.sync?.settings ?? null, updated: req.who.account.sync?.updated ?? 0 });
});

router.put("/api/account/sync", requireIdentity, express.json({ limit: "64kb" }), (req, res) => {
    if (!req.who.account) {
        res.status(403).json({ error: "Sign in to CloudSync first." });
        return;
    }
    const settings = req.body?.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        res.status(400).json({ error: "Expected a settings object." });
        return;
    }
    req.who.account.sync = { settings, updated: Date.now() };
    save();
    res.json({ updated: req.who.account.sync.updated });
});

router.get("/api/account/export", requireIdentity, (req, res) => {
    if (!req.who.account) {
        res.status(403).json({ error: "Sign in to CloudSync first." });
        return;
    }
    const { account, username } = req.who;
    res.json({
        exported: new Date().toISOString(),
        username,
        created: new Date(account.created).toISOString(),
        wallet: { coins: account.profile.coins, aiCredits: account.profile.credits },
        inventory: account.profile.inventory,
        equipped: account.profile.equipped,
        aiUsageToday: account.profile.ai.day === today() ? account.profile.ai.used : 0,
        syncedSettings: account.sync?.settings ?? null
    });
});

router.delete("/api/account", requireIdentity, json, async (req, res) => {
    if (!req.who.account) {
        res.status(403).json({ error: "Not signed in." });
        return;
    }
    const { hash } = await hashPasscode(String(req.body?.passcode ?? ""), req.who.account.passcode.salt);
    // 403, not 401: the client treats 401 as "unknown token" and starts a new session.
    if (!crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(req.who.account.passcode.hash, "hex"))) {
        res.status(403).json({ error: "Wrong passcode." });
        return;
    }
    endSessions(req.who.username);
    delete db.accounts[req.who.username];
    save();
    res.status(204).end();
});

// Forget anonymous devices nobody has used for 60 days, so the file does not grow forever.
setInterval(() => {
    const cutoff = Date.now() - 60 * 24 * 3600_000;
    let changed = false;
    for (const [key, device] of Object.entries(db.devices)) {
        if ((device.seen ?? device.created) < cutoff) {
            delete db.devices[key];
            changed = true;
        }
    }
    if (changed)
        save();
}, 6 * 3600_000).unref();
