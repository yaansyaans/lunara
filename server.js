import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import ipaddr from "ipaddr.js";
import fs from "node:fs";
import crypto from "node:crypto";
try {
    process.loadEnvFile();
}
catch { }
const { router: identityRouter, identify } = await import("./server/identity.js");
const { router: economyRouter, chatCosmetics } = await import("./server/economy.js");
const { router: aiRouter } = await import("./server/ai.js");
const { router: gamesRouter, warmGames } = await import("./server/games.js");
const { router: musicRouter } = await import("./server/music.js");
const { router: imageRouter } = await import("./server/image.js");
const { router: moviesRouter } = await import("./server/movies.js");
const { saveNow } = await import("./server/store.js");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "public");
const app = express();
app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));
// lunara://chat. One in-memory room; nothing is written to disk and history is lost on restart.
const chat = {
    messages: [],
    clients: new Set(),
    lastPost: new Map(),
    maxHistory: 100,
    maxClients: 500,
    minIntervalMs: 800
};
const sendEvent = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const broadcast = (event, data) => {
    for (const client of chat.clients)
        sendEvent(client, event, data);
};
const clean = (value, max) => String(value ?? "")
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, " ")
    .trim()
    .slice(0, max);
app.get("/api/chat/stream", (req, res) => {
    if (chat.clients.size >= chat.maxClients) {
        res.status(503).end();
        return;
    }
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
    });
    res.write("retry: 3000\n\n");
    sendEvent(res, "history", chat.messages);
    chat.clients.add(res);
    broadcast("presence", { online: chat.clients.size });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
        clearInterval(heartbeat);
        chat.clients.delete(res);
        broadcast("presence", { online: chat.clients.size });
    });
});
app.post("/api/chat", express.json({ limit: "4kb" }), (req, res) => {
    const ip = req.socket.remoteAddress ?? "";
    const now = Date.now();
    if (now - (chat.lastPost.get(ip) ?? 0) < chat.minIntervalMs) {
        res.status(429).json({ error: "Slow down a little." });
        return;
    }
    const text = clean(req.body?.text, 500);
    const nick = clean(req.body?.nick, 24) || "anon";
    if (!text) {
        res.status(400).json({ error: "Message is empty." });
        return;
    }
    chat.lastPost.set(ip, now);
    if (chat.lastPost.size > 10_000)
        chat.lastPost.clear();
    const who = identify(req);
    const cosmetics = who ? chatCosmetics(who.profile) : { title: null, style: null };
    const message = { nick, text, at: now, ...cosmetics };
    chat.messages.push(message);
    if (chat.messages.length > chat.maxHistory)
        chat.messages.shift();
    broadcast("message", message);
    res.status(204).end();
});
// Build facts for Settings > About. "Built" is the newest source file's modification
// time and the build id is a hash of every source file, so both change on each deploy.
const buildInfo = (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
                walk(full);
            else
                files.push(full);
        }
    };
    walk(staticRoot);
    walk(path.join(__dirname, "server"));
    files.push(fileURLToPath(import.meta.url));
    const hash = crypto.createHash("sha256");
    let newest = 0;
    for (const file of files.sort()) {
        hash.update(file).update(fs.readFileSync(file));
        newest = Math.max(newest, fs.statSync(file).mtimeMs);
    }
    return { version: pkg.version, build: hash.digest("hex").slice(0, 10), built: new Date(newest).toISOString(), node: process.version };
})();
app.get("/api/build", (_req, res) => res.json(buildInfo));
app.use(identityRouter, economyRouter, aiRouter, gamesRouter, musicRouter, imageRouter, moviesRouter);
app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
app.use("/baremod/", express.static(dirOf("@mercuryworkshop/bare-transport")));
app.use(express.static(staticRoot, {
    setHeaders(res, filePath) {
        if (path.basename(filePath).endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
const bareServer = createBareServer("/bare/", {
    filterRemote(url) {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        if (ipaddr.isValid(hostname) &&
            ipaddr.parse(hostname).range() !== "unicast") {
            throw new RangeError("Forbidden IP");
        }
    },
    connectionLimiter: {
        maxConnectionsPerIP: 2000,
        windowDuration: 60,
        blockDuration: 10
    }
});
const handleRequest = (req, res) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
        return;
    }
    app(req, res);
};
const server = http.createServer(handleRequest);
server.on("upgrade", (req, socket, head) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
        return;
    }
    const wispPath = new URL(req.url ?? "/", "http://localhost").pathname;
    if (wispPath === "/wisp/") {
        req.url = wispPath;
        wisp.routeRequest(req, socket, head);
        return;
    }
    socket.end();
});
const listenWithFallback = (target, startPort, attempts = 20) => {
    let port = startPort;
    let left = attempts;
    const onError = (error) => {
        if (error.code !== "EADDRINUSE" || left-- <= 0) {
            console.error(`Could not listen on port ${port}: ${error.message}`);
            process.exit(1);
        }
        console.warn(`Port ${port} is in use, trying ${port + 1}...`);
        port += 1;
        target.listen(port);
    };
    target.on("error", onError);
    target.listen(port, () => {
        target.off("error", onError);
        process.send?.({ type: "listening", port });
        console.log(process.env.BACKEND_ONLY
            ? `Backend listening on http://localhost:${port}`
            : `Lunara listening on http://localhost:${port}`);
    });
};
const port = Number(process.env.PORT) || Number("8080");
listenWithFallback(server, port);
void warmGames();
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        saveNow();
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
    });
}
