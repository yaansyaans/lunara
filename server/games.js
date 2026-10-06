// lunara://games, built from every gmshelf repository (https://github.com/gmshelf).
//
// Two things here:
//   GET /api/games        One combined, deduplicated catalog with per-source counts.
//   GET /gm/:source/*     The game files themselves, relayed from jsDelivr.
//
// The relay exists because jsDelivr serves every .html file as text/plain (an iframe
// would show the source code), and because many games start Web Workers or load
// relative files, which only works when the game is served from this origin. When a
// file is over jsDelivr's 20 MB limit the relay falls back to raw.githubusercontent.com.
import path from "node:path";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import express from "express";

export const sources = [
    { id: "seraph", label: "Seraph" },
    { id: "ckv", label: "CKV" },
    { id: "truffled", label: "Truffled" },
    { id: "ugs", label: "UGS" }
];
const sourceIds = new Set(sources.map(s => s.id));

const cdn = (source, file) => `https://cdn.jsdelivr.net/gh/gmshelf/${source}@main/${file}`;
const raw = (source, file) => `https://raw.githubusercontent.com/gmshelf/${source}/main/${file}`;
const encodePath = (file) => file.split("/").map(encodeURIComponent).join("/");

const fetchJson = async (url, timeoutMs = 20_000) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "lunara" } });
    if (!response.ok)
        throw new Error(`${url} → HTTP ${response.status}`);
    return response.json();
};

const norm = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

// seraph and truffled ship a covers/ folder but their index points every game at a
// placeholder, so match covers to games by folder name, file name, or title.
const coverIndex = async (source) => {
    try {
        const tree = await fetchJson(`https://api.github.com/repos/gmshelf/${source}/git/trees/main:covers`);
        return new Map((tree.tree ?? []).map(entry => [norm(entry.path.replace(/\.[^.]+$/, "")), `covers/${entry.path}`]));
    }
    catch {
        return new Map();
    }
};

const prettify = (name) => /\s/.test(name) || /[A-Z]/.test(name) ? name : name.charAt(0).toUpperCase() + name.slice(1);

const loadSource = async ({ id }) => {
    const data = await fetchJson(cdn(id, `${id}.json`)).catch(() => fetchJson(raw(id, `${id}.json`)));
    const list = Array.isArray(data) ? data : Object.values(data).flat();
    const covers = id === "seraph" || id === "truffled" ? await coverIndex(id) : new Map();
    const seen = new Set();
    const games = [];
    for (const entry of list) {
        if (!entry || typeof entry.url !== "string" || typeof entry.name !== "string")
            continue;
        const file = entry.url.replace(/^\/+/, "");
        if (!file || file.includes("..") || seen.has(file))
            continue;
        seen.add(file);
        let cover = typeof entry.img === "string" && !entry.img.includes("placeholder")
            ? entry.img.replace(/^\/+/, "")
            : "";
        if (!cover && covers.size) {
            const parts = file.split("/");
            const keys = [parts.length > 2 ? parts[1] : "", parts.at(-1).replace(/\.[^.]+$/, ""), entry.name].map(norm);
            cover = keys.map(key => key && covers.get(key)).find(Boolean) ?? "";
        }
        games.push({ n: prettify(entry.name.trim()), f: file, c: cover });
    }
    return games;
};

let catalog = null;
let loadedAt = 0;
let loading = null;
let failed = false;
const maxAgeMs = 6 * 3600_000;
const retryMs = 2 * 60_000;

const buildCatalog = async () => {
    const results = await Promise.allSettled(sources.map(loadSource));
    const previous = catalog?.json;
    const counts = [];
    const games = [];
    failed = results.some(result => result.status === "rejected");
    results.forEach((result, index) => {
        const source = sources[index];
        let list = result.status === "fulfilled" ? result.value : null;
        if (!list) {
            console.warn(`games: could not load ${source.id}: ${result.reason?.message}`);
            // Keep the last good copy of a source rather than dropping it.
            list = previous?.games.filter(g => g.s === index).map(({ n, f, c }) => ({ n, f, c })) ?? [];
        }
        counts.push({ ...source, count: list.length });
        for (const game of list)
            games.push({ ...game, s: index });
    });
    const json = { sources: counts, total: games.length, games, updated: Date.now() };
    const body = Buffer.from(JSON.stringify(json));
    catalog = { json, body, gzip: zlib.gzipSync(body) };
    loadedAt = Date.now();
    return catalog;
};

const getCatalog = () => {
    if (catalog && Date.now() - loadedAt < (failed ? retryMs : maxAgeMs))
        return Promise.resolve(catalog);
    loading ??= buildCatalog().finally(() => (loading = null));
    // Serve a stale catalog while refreshing in the background.
    return catalog ? Promise.resolve(catalog) : loading;
};

export const warmGames = () => getCatalog().then(c => console.log(`games: ${c.json.total} games from ${c.json.sources.map(s => `${s.id} ${s.count}`).join(", ")}`), e => console.warn("games:", e.message));

const types = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json", ".map": "application/json",
    ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".wav": "audio/wav",
    ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".mid": "audio/midi",
    ".mp4": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
    ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".swf": "application/x-shockwave-flash"
};

// Unity and Emscripten builds ship pre-compressed .gz/.br files and expect the server
// to label them, exactly as their hosting docs ask.
const describe = (file) => {
    const lower = file.toLowerCase();
    const encoding = lower.endsWith(".gz") ? "gzip" : lower.endsWith(".br") ? "br" : null;
    const inner = encoding ? lower.replace(/\.(gz|br)$/, "") : lower;
    const ext = path.extname(inner);
    if (encoding && !types[ext])
        return { type: "application/octet-stream", encoding: null };
    return { type: types[ext] ?? "application/octet-stream", encoding };
};

const forwardHeaders = ["content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export const router = express.Router();

router.get("/api/games", async (req, res) => {
    try {
        const { body, gzip } = await getCatalog();
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "public, max-age=600");
        res.setHeader("vary", "accept-encoding");
        if (/\bgzip\b/.test(req.get("accept-encoding") ?? "")) {
            res.setHeader("content-encoding", "gzip");
            res.end(gzip);
        }
        else
            res.end(body);
    }
    catch (error) {
        res.status(502).json({ error: `Could not load the game lists: ${error.message}` });
    }
});

router.get("/gm/:source/*", async (req, res) => {
    const { source } = req.params;
    const file = req.params[0] ?? "";
    if (!sourceIds.has(source) || !file || file.split("/").some(part => part === ".." || part === ".")) {
        res.status(404).end();
        return;
    }
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    // Ask for the bytes as stored: fetch() would otherwise decompress the body while
    // content-length still described the compressed size.
    const headers = { "user-agent": "lunara", "accept-encoding": "identity" };
    if (req.get("range"))
        headers.range = req.get("range");
    let upstream;
    try {
        upstream = await fetch(cdn(source, encodePath(file)), { headers, signal: abort.signal });
        // 403 is how jsDelivr refuses files over its size limit.
        if (upstream.status === 403 || upstream.status >= 500) {
            await upstream.body?.cancel().catch(() => { });
            upstream = await fetch(raw(source, encodePath(file)), { headers, signal: abort.signal });
        }
    }
    catch {
        if (!res.headersSent)
            res.status(502).end();
        return;
    }
    if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => { });
        res.status(upstream.status === 404 ? 404 : 502).end();
        return;
    }
    const { type, encoding } = describe(file);
    res.status(upstream.status);
    res.setHeader("content-type", type);
    if (encoding)
        res.setHeader("content-encoding", encoding);
    for (const name of forwardHeaders) {
        const value = upstream.headers.get(name);
        if (value)
            res.setHeader(name, value);
    }
    res.setHeader("cache-control", "public, max-age=86400");
    // The shell is cross-origin isolated, and a frame inside it must opt in too.
    // credentialless (rather than require-corp) lets games keep loading scripts from
    // CDNs that do not send Cross-Origin-Resource-Policy.
    res.setHeader("cross-origin-embedder-policy", "credentialless");
    res.setHeader("cross-origin-resource-policy", "same-origin");
    Readable.fromWeb(upstream.body).on("error", () => res.destroy()).pipe(res);
});
