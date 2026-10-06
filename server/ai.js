// lunara://ai, backed by Groq's free tier. Every model here is free; the limits exist
// because the whole server shares one key's quota (about 1,000 requests a day and
// 8,000 tokens a minute per model), so one person must not be able to spend everyone's.
//
// The rules, in the order they are checked:
//   1. One request in flight per person, and a short cooldown between requests.
//   2. Each person gets dailyCredits free credits a day; bigger models cost more.
//      Credits bought in the shop are spent only once the free ones run out.
//   3. One network (IP) can spend at most dailyCreditsPerIp free credits a day, so
//      minting new device tokens does not mint new allowances.
//   4. Each model has a server-wide daily request budget just under Groq's own cap, so
//      the last requests of the day fail politely instead of with Groq's 429.
// Credits are refunded when Groq fails the request.
import { Readable } from "node:stream";
import express from "express";
import { db, save, today } from "./store.js";
import { requireIdentity, hit, clientIp } from "./identity.js";
import { key } from "./keys.js";

const apiKey = key("GROQ_API_KEY");
const endpoint = "https://api.groq.com/openai/v1/chat/completions";

export const dailyCredits = Number(process.env.AI_DAILY_CREDITS) || 40;
const dailyCreditsPerIp = Number(process.env.AI_DAILY_CREDITS_PER_IP) || 400;
const cooldownMs = 3000;

// maxOutput respects each model's free-tier output limit. Qwen is capped at 1,000
// output tokens a minute for the whole server, so it gets short answers and no hidden
// reasoning (reasoning tokens count against max_tokens and would leave nothing for
// the answer).
export const models = [
    { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", note: "Fast, good for most things", cost: 1, dailyBudget: 950, maxInputChars: 16000, maxOutput: 1024, extra: { reasoning_format: "hidden", reasoning_effort: "low" } },
    { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", note: "Strong at code and maths, short answers", cost: 2, dailyBudget: 950, maxInputChars: 12000, maxOutput: 600, extra: { reasoning_effort: "none" } },
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "The smartest model here", cost: 3, dailyBudget: 950, maxInputChars: 16000, maxOutput: 2048, extra: { reasoning_format: "hidden", reasoning_effort: "medium" } },
    { id: "allam-2-7b", label: "ALLaM 2 7B", note: "Small, Arabic and English", cost: 1, dailyBudget: 6500, maxInputChars: 6000, maxOutput: 1024, extra: {} }
];
const byId = new Map(models.map(model => [model.id, model]));

const systemPrompt = "You are Lunara AI, a helpful assistant inside the Lunara web browser. " +
    "Be concise and friendly. Use Markdown for code.";

const inFlight = new Set();

const usageToday = () => {
    const day = today();
    if (db.usage.day !== day)
        db.usage = { day, models: {}, ips: {} };
    return db.usage;
};

const freeLeft = (profile) => {
    if (profile.ai.day !== today())
        profile.ai = { day: today(), used: 0 };
    return Math.max(0, dailyCredits - profile.ai.used);
};

export const quota = (profile) => ({
    daily: dailyCredits,
    freeLeft: freeLeft(profile),
    bonus: profile.credits
});

// Keep the system prompt, then as many of the newest messages as fit the model's budget.
const trimMessages = (raw, maxChars) => {
    const clean = raw
        .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
        .map(m => ({ role: m.role, content: m.content.slice(0, maxChars) }));
    const kept = [];
    let size = 0;
    for (let i = clean.length - 1; i >= 0 && kept.length < 24; i--) {
        size += clean[i].content.length;
        if (size > maxChars && kept.length)
            break;
        kept.unshift(clean[i]);
    }
    while (kept.length && kept[0].role !== "user")
        kept.shift();
    return kept;
};

export const router = express.Router();

router.get("/api/ai/models", requireIdentity, (req, res) => {
    res.json({
        enabled: Boolean(apiKey),
        models: models.map(({ id, label, note, cost }) => ({ id, label, note, cost })),
        quota: quota(req.who.profile)
    });
});

router.post("/api/ai/chat", requireIdentity, express.json({ limit: "96kb" }), async (req, res) => {
    const who = req.who;
    const profile = who.profile;
    const model = byId.get(req.body?.model);
    const fail = (status, error, extra = {}) => res.status(status).json({ error, quota: quota(profile), ...extra });

    if (!apiKey)
        return fail(503, "AI is not configured on this server (GROQ_API_KEY is missing).");
    if (!model)
        return fail(400, "Unknown model.");
    if (inFlight.has(who.key))
        return fail(429, "Wait for your current answer to finish.");
    const cooldown = hit(`ai-cooldown:${who.key}`, 1, cooldownMs);
    if (!cooldown.ok)
        return fail(429, `Slow down: try again in ${cooldown.retryAfter}s.`, { retryAfter: cooldown.retryAfter });
    const messages = trimMessages(Array.isArray(req.body?.messages) ? req.body.messages : [], model.maxInputChars);
    if (!messages.length || messages.at(-1).role !== "user")
        return fail(400, "Send a message first.");

    const usage = usageToday();
    const modelUsage = usage.models[model.id] ?? 0;
    if (modelUsage >= model.dailyBudget)
        return fail(503, `${model.label} has used up today's shared capacity. Try another model.`);

    // Work out how the cost is paid: free credits first, then bought ones.
    const ip = clientIp(req);
    const ipUsed = usage.ips[ip] ?? 0;
    const free = Math.min(freeLeft(profile), model.cost, Math.max(0, dailyCreditsPerIp - ipUsed));
    const bonus = model.cost - free;
    if (bonus > profile.credits) {
        const available = free + profile.credits;
        const reason = freeLeft(profile) > 0 && ipUsed >= dailyCreditsPerIp
            ? "Your network has used today's shared free AI credits."
            : available > 0
                ? `${model.label} costs ${model.cost} credits and you have ${available} left. Pick a cheaper model.`
                : "You are out of AI credits for today.";
        return fail(402, `${reason} They reset at 00:00 UTC, or buy more in the Shop.`);
    }

    profile.ai.used += free;
    profile.credits -= bonus;
    usage.ips[ip] = ipUsed + free;
    usage.models[model.id] = modelUsage + 1;
    save();
    const refund = () => {
        profile.ai.used -= free;
        profile.credits += bonus;
        usage.ips[ip] -= free;
        usage.models[model.id]--;
        save();
    };

    inFlight.add(who.key);
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    try {
        const upstream = await fetch(endpoint, {
            method: "POST",
            signal: abort.signal,
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
                model: model.id,
                stream: true,
                max_tokens: model.maxOutput,
                temperature: 0.7,
                messages: [{ role: "system", content: systemPrompt }, ...messages],
                ...model.extra
            })
        });
        if (!upstream.ok || !upstream.body) {
            refund();
            const detail = await upstream.text().catch(() => "");
            const busy = upstream.status === 429;
            console.warn(`Groq ${model.id} → ${upstream.status} ${detail.slice(0, 200)}`);
            return fail(busy ? 429 : 502, busy
                ? `${model.label} is busy right now. Try again in a minute or pick another model.`
                : "The AI provider returned an error. Your credits were refunded.", busy ? { retryAfter: Number(upstream.headers.get("retry-after")) || 20 } : {});
        }
        res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
            "x-lunara-quota": JSON.stringify(quota(profile))
        });
        await new Promise((resolve) => {
            const body = Readable.fromWeb(upstream.body);
            body.on("error", resolve);
            body.on("end", resolve);
            res.on("close", resolve);
            body.pipe(res);
        });
    }
    catch (error) {
        if (!res.headersSent) {
            refund();
            if (error.name !== "AbortError")
                fail(502, "Could not reach the AI provider. Your credits were refunded.");
        }
    }
    finally {
        inFlight.delete(who.key);
        if (!res.writableEnded)
            res.end();
    }
});
