// lunara://movies: TMDB for search, posters and episode lists; vidfast.vc plays them.
// The TMDB token stays on the server, and posters are relayed because image.tmdb.org
// sends no CORP header, which the cross-origin-isolated shell requires.
import { Readable } from "node:stream";
import express from "express";
import { hit, clientIp } from "./identity.js";

const token = process.env.TMDB_READ_TOKEN ?? "";
const apiKey = process.env.TMDB_API_KEY ?? "";
const allowed = [
    /^trending\/(all|movie|tv)\/(day|week)$/,
    /^search\/multi$/,
    /^(movie|tv)\/\d+$/,
    /^tv\/\d+\/season\/\d+$/
];
const cache = new Map();

export const router = express.Router();

router.get(/^\/api\/tmdb\/(.+)$/, async (req, res) => {
    const path = req.params[0];
    if (!allowed.some(re => re.test(path))) {
        res.status(404).json({ error: "Not available." });
        return;
    }
    if (!token && !apiKey) {
        res.status(503).json({ error: "TMDB is not configured on this server." });
        return;
    }
    if (!hit(`tmdb:${clientIp(req)}`, 120, 60_000).ok) {
        res.status(429).json({ error: "Too many requests. Wait a moment." });
        return;
    }
    const url = new URL(`https://api.themoviedb.org/3/${path}`);
    for (const key of ["query", "page"])
        if (req.query[key])
            url.searchParams.set(key, String(req.query[key]).slice(0, 200));
    url.searchParams.set("include_adult", "false");
    if (!token)
        url.searchParams.set("api_key", apiKey);
    const cached = cache.get(url.href);
    if (cached && cached.expires > Date.now()) {
        res.type("json").send(cached.body);
        return;
    }
    try {
        const upstream = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10_000) });
        const body = await upstream.text();
        if (!upstream.ok) {
            res.status(502).json({ error: `TMDB answered HTTP ${upstream.status}.` });
            return;
        }
        cache.set(url.href, { body, expires: Date.now() + 10 * 60_000 });
        if (cache.size > 2000)
            cache.delete(cache.keys().next().value);
        res.setHeader("cache-control", "public, max-age=600");
        res.type("json").send(body);
    }
    catch {
        res.status(502).json({ error: "Could not reach TMDB." });
    }
});

router.get("/api/tmdb-img/:size/:file", async (req, res) => {
    const { size, file } = req.params;
    if (!/^(w92|w154|w185|w342|w500|w780|original)$/.test(size) || !/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(file)) {
        res.status(404).end();
        return;
    }
    try {
        const upstream = await fetch(`https://image.tmdb.org/t/p/${size}/${file}`, { signal: AbortSignal.timeout(10_000) });
        if (!upstream.ok || !upstream.body) {
            res.status(upstream.status === 404 ? 404 : 502).end();
            return;
        }
        res.setHeader("content-type", upstream.headers.get("content-type") ?? "image/jpeg");
        res.setHeader("cache-control", "public, max-age=604800, immutable");
        Readable.fromWeb(upstream.body).on("error", () => res.destroy()).pipe(res);
    }
    catch {
        if (!res.headersSent)
            res.status(502).end();
    }
});
