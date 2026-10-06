// GET /api/image?url= relays a background image picked in Settings > Appearance. The
// shell is cross-origin isolated, so an image from a host without CORP headers would
// be blocked if the page loaded it directly.
//
// It only ever returns images, refuses private and loopback addresses (checked on
// every redirect hop), and caps the size, so it cannot be used to reach this
// server's own network or as a general-purpose proxy.
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import express from "express";
import { hit, clientIp } from "./identity.js";

const maxBytes = 12 * 1024 * 1024;

const publicHost = async (hostname) => {
    const host = hostname.replace(/^\[|\]$/g, "");
    const addresses = ipaddr.isValid(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
    return addresses.length > 0 && addresses.every(address => {
        const parsed = ipaddr.process(address);
        return parsed.range() === "unicast";
    });
};

export const router = express.Router();

router.get("/api/image", async (req, res) => {
    if (!hit(`image:${clientIp(req)}`, 60, 60_000).ok) {
        res.status(429).end();
        return;
    }
    let target;
    try {
        target = new URL(String(req.query.url ?? ""));
        if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
            throw new Error();
    }
    catch {
        res.status(400).end();
        return;
    }
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    setTimeout(() => abort.abort(), 15_000).unref();
    try {
        let upstream;
        for (let hop = 0; hop < 4; hop++) {
            if (!(await publicHost(target.hostname))) {
                res.status(403).end();
                return;
            }
            upstream = await fetch(target, { redirect: "manual", signal: abort.signal, headers: { "user-agent": "Mozilla/5.0 (Lunara background fetcher)", accept: "image/*" } });
            const location = upstream.headers.get("location");
            if (upstream.status >= 300 && upstream.status < 400 && location) {
                await upstream.body?.cancel().catch(() => { });
                target = new URL(location, target);
                if (!["http:", "https:"].includes(target.protocol))
                    break;
                continue;
            }
            break;
        }
        const type = upstream?.headers.get("content-type") ?? "";
        if (!upstream?.ok || !upstream.body || !/^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)\b/i.test(type)) {
            await upstream?.body?.cancel().catch(() => { });
            res.status(415).end();
            return;
        }
        if (Number(upstream.headers.get("content-length")) > maxBytes) {
            await upstream.body.cancel().catch(() => { });
            res.status(413).end();
            return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of upstream.body) {
            size += chunk.byteLength;
            if (size > maxBytes) {
                abort.abort();
                res.status(413).end();
                return;
            }
            chunks.push(chunk);
        }
        res.setHeader("content-type", type);
        res.setHeader("cache-control", "public, max-age=86400");
        // An SVG could carry script; this keeps it inert if opened directly.
        res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        res.setHeader("x-content-type-options", "nosniff");
        res.end(Buffer.concat(chunks));
    }
    catch {
        if (!res.headersSent)
            res.status(502).end();
    }
});
