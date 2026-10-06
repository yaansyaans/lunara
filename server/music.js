// lunara://music. Ported from the SoundCloud source in x8rr/music
// (https://github.com/x8rr/music, routes/music.ts), which its README lists as one of
// the two sources that still work. The others there (Tidal, Qobuz, Deezer, Octave)
// are dead mirrors, and its YouTube source needs a yt-dlp binary on the host.
//
// SoundCloud's api-v2 needs a client_id. It is scraped from the desktop site's JS
// bundles, or from the mobile site's page data when the desktop site answers with a
// bot challenge (it does that after a few scrapes from one IP). The id is kept, across
// restarts too, until SoundCloud rejects it with a 401/403; only then is it scraped again.
// Search only returns tracks with a full-length progressive MP3, because those are
// the ones that both play and seek: major-label uploads are DRM-only HLS and
// SoundCloud Go tracks are 30-second previews.
import { Readable } from "node:stream";
import express from "express";
import { hit, clientIp } from "./identity.js";
import { db, save } from "./store.js";

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const apiHeaders = { "user-agent": ua, accept: "application/json", origin: "https://soundcloud.com", referer: "https://soundcloud.com/" };
const timeoutMs = 8000;

const pinned = process.env.SOUNDCLOUD_CLIENT_ID || null;
db.cache ??= {};
let clientId = pinned || db.cache.soundcloudClientId || null;
let scraping = null;

const fetchText = async (url) => {
    const response = await fetch(url, { headers: { "user-agent": ua, accept: "text/html,*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    return response.text();
};

const fromDesktop = async () => {
    const html = await fetchText("https://soundcloud.com/");
    const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.(?:sndcdn|soundcloud)\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]).reverse();
    for (const src of scripts) {
        const match = (await fetchText(src)).match(/client_id\s*[:=]\s*\\?"?([a-zA-Z0-9]{20,})/);
        if (match)
            return match[1];
    }
    return null;
};

const fromMobile = async () => (await fetchText("https://m.soundcloud.com/")).match(/"clientId":"([a-zA-Z0-9]{20,})"/)?.[1] ?? null;

const scrapeClientId = async () => {
    for (const source of [fromDesktop, fromMobile]) {
        const id = await source().catch(() => null);
        if (id)
            return id;
    }
    throw new Error("Could not find a SoundCloud client_id");
};

const getClientId = async () => {
    if (clientId)
        return clientId;
    scraping ??= scrapeClientId()
        .then(id => {
            clientId = id;
            db.cache.soundcloudClientId = id;
            save();
            return id;
        })
        .finally(() => (scraping = null));
    return scraping;
};

const dropClientId = () => {
    if (pinned)
        return;
    clientId = null;
    delete db.cache.soundcloudClientId;
};

const api = async (pathname, params = {}) => {
    const url = new URL(pathname, "https://api-v2.soundcloud.com");
    for (const [key, value] of Object.entries(params))
        url.searchParams.set(key, String(value));
    for (let attempt = 0; attempt < 2; attempt++) {
        url.searchParams.set("client_id", await getClientId());
        const response = await fetch(url, { headers: apiHeaders, signal: AbortSignal.timeout(timeoutMs) });
        if (response.ok)
            return response.json();
        await response.body?.cancel().catch(() => { });
        if ((response.status === 401 || response.status === 403) && !pinned) {
            dropClientId();
            continue;
        }
        throw new Error(`SoundCloud ${pathname} → HTTP ${response.status}`);
    }
    throw new Error("SoundCloud rejected the client_id");
};

const progressive = (track) => track.media?.transcodings?.find(t => t.format?.protocol === "progressive" && !t.snipped);

const artwork = (url) => (url ? url.replace(/-large\.(jpg|png)$/, "-t500x500.$1") : "");

const toTrack = (track) => ({
    id: track.id,
    title: track.title,
    artist: track.publisher_metadata?.artist || track.user?.username || "Unknown artist",
    artwork: artwork(track.artwork_url || track.user?.avatar_url),
    duration: Math.round((track.full_duration || track.duration) / 1000),
    permalink: track.permalink_url
});

const playable = (track) => track?.kind === "track" && track.streamable !== false &&
    !["BLOCK", "SNIP"].includes(track.policy) && Boolean(progressive(track));

// Resolved CDN URLs last a while, and seeking makes a new request each time, so keep
// them briefly instead of resolving the track again on every seek.
const resolved = new Map();
const resolveStream = async (id) => {
    const cached = resolved.get(id);
    if (cached && cached.expires > Date.now())
        return cached.url;
    const track = await api(`/tracks/${id}`);
    const transcoding = progressive(track);
    if (!transcoding)
        throw new Error("This track has no playable stream.");
    const url = new URL(transcoding.url);
    url.searchParams.set("client_id", await getClientId());
    if (track.track_authorization)
        url.searchParams.set("track_authorization", track.track_authorization);
    const response = await fetch(url, { headers: apiHeaders, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
        await response.body?.cancel().catch(() => { });
        throw new Error(`SoundCloud stream resolve → HTTP ${response.status}`);
    }
    const { url: streamUrl } = await response.json();
    if (!streamUrl)
        throw new Error("SoundCloud returned no stream URL.");
    resolved.set(id, { url: streamUrl, expires: Date.now() + 10 * 60_000 });
    if (resolved.size > 2000)
        resolved.delete(resolved.keys().next().value);
    return streamUrl;
};

export const router = express.Router();

router.get("/api/music/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 200);
    if (!q) {
        res.json({ items: [] });
        return;
    }
    if (!hit(`music-search:${clientIp(req)}`, 40, 60_000).ok) {
        res.status(429).json({ error: "Too many searches. Wait a moment." });
        return;
    }
    try {
        const data = await api("/search/tracks", { q, limit: 50, linked_partitioning: 1 });
        const items = (data.collection ?? []).filter(playable).map(toTrack).slice(0, 30);
        res.setHeader("cache-control", "public, max-age=120");
        res.json({ items });
    }
    catch (error) {
        console.warn("music search:", error.message);
        res.status(502).json({ error: "SoundCloud search is unavailable right now." });
    }
});

router.get("/api/music/stream/:id", async (req, res) => {
    const id = req.params.id;
    if (!/^\d{1,15}$/.test(id)) {
        res.status(400).end();
        return;
    }
    if (!hit(`music-stream:${clientIp(req)}`, 240, 60_000).ok) {
        res.status(429).end();
        return;
    }
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    try {
        const headers = { "user-agent": ua, "accept-encoding": "identity" };
        if (req.get("range"))
            headers.range = req.get("range");
        let upstream = await fetch(await resolveStream(id), { headers, signal: abort.signal });
        if (upstream.status === 403 || upstream.status === 410) {
            // The signed CDN URL expired; resolve a fresh one once.
            await upstream.body?.cancel().catch(() => { });
            resolved.delete(id);
            upstream = await fetch(await resolveStream(id), { headers, signal: abort.signal });
        }
        if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel().catch(() => { });
            res.status(502).end();
            return;
        }
        res.status(upstream.status);
        res.setHeader("content-type", upstream.headers.get("content-type") || "audio/mpeg");
        for (const name of ["content-length", "content-range"]) {
            const value = upstream.headers.get(name);
            if (value)
                res.setHeader(name, value);
        }
        res.setHeader("accept-ranges", "bytes");
        res.setHeader("cache-control", "no-store");
        Readable.fromWeb(upstream.body).on("error", () => res.destroy()).pipe(res);
    }
    catch (error) {
        if (error.name !== "AbortError")
            console.warn(`music stream ${id}:`, error.message);
        if (!res.headersSent)
            res.status(502).end();
    }
});
