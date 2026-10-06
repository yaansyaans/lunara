// Lunara coins and the shop. Coins are earned by searching (30 coins every 5-7 searches,
// the exact number re-rolled after each payout) and spent on chat titles, chat text
// styles and extra AI credits. Balances live on the server so they cannot be edited
// from devtools.
import crypto from "node:crypto";
import express from "express";
import { save, today } from "./store.js";
import { requireIdentity, hit, publicProfile } from "./identity.js";

export const searchReward = 30;
// Searching is the only faucet, so cap it per day to keep it from being scripted.
const maxSearchCoinsPerDay = 600;

const title = (id, name, price) => ({ id: `title:${id}`, kind: "title", name, price });
const text = (id, name, price, preview) => ({ id: `text:${id}`, kind: "text", name, price, preview });
const credits = (amount, price) => ({ id: `credits:${amount}`, kind: "credits", name: `${amount} AI credits`, amount, price });

export const items = [
    title("night-owl", "Night Owl", 60),
    title("stargazer", "Stargazer", 90),
    title("moonwalker", "Moonwalker", 120),
    title("comet", "Comet", 150),
    title("nebula", "Nebula", 200),
    title("eclipse", "Eclipse", 260),
    title("supernova", "Supernova", 350),
    title("void-walker", "Void Walker", 450),
    title("lunatic", "Lunatic", 600),
    title("celestial", "Celestial", 800),
    title("moon-king", "Moon King", 1200),
    title("legend", "Legend", 2000),
    text("glow", "Glow", 100, "Soft white glow"),
    text("gold", "Gold", 180, "Polished gold"),
    text("ice", "Ice", 180, "Frozen blue gradient"),
    text("fire", "Fire", 220, "Burning gradient"),
    text("neon", "Neon", 250, "Pink neon sign"),
    text("toxic", "Toxic", 250, "Radioactive green"),
    text("galaxy", "Galaxy", 400, "Deep-space gradient"),
    text("rainbow", "Rainbow", 500, "Animated rainbow"),
    text("glitch", "Glitch", 700, "Flickering glitch"),
    credits(15, 60),
    credits(50, 180),
    credits(150, 480)
];
const byId = new Map(items.map(item => [item.id, item]));

export const chatCosmetics = (profile) => ({
    title: byId.get(profile.equipped.title)?.name ?? null,
    style: profile.equipped.text?.slice("text:".length) ?? null
});

export const router = express.Router();
const json = express.json({ limit: "2kb" });

router.get("/api/shop", (_req, res) => {
    res.json({ items, searchReward });
});

router.post("/api/shop/buy", requireIdentity, json, (req, res) => {
    const item = byId.get(req.body?.id);
    const profile = req.who.profile;
    if (!item) {
        res.status(404).json({ error: "No such item." });
        return;
    }
    if (item.kind !== "credits" && profile.inventory.includes(item.id)) {
        res.status(409).json({ error: "You already own that." });
        return;
    }
    if (profile.coins < item.price) {
        res.status(402).json({ error: `You need ${item.price - profile.coins} more coins.` });
        return;
    }
    profile.coins -= item.price;
    if (item.kind === "credits")
        profile.credits += item.amount;
    else {
        profile.inventory.push(item.id);
        // Wear it straight away; that is what people buy cosmetics for.
        profile.equipped[item.kind] = item.id;
    }
    save();
    res.json(publicProfile(req.who));
});

router.post("/api/shop/equip", requireIdentity, json, (req, res) => {
    const { kind, id } = req.body ?? {};
    const profile = req.who.profile;
    if (!["title", "text"].includes(kind)) {
        res.status(400).json({ error: "Unknown slot." });
        return;
    }
    if (id !== null && !(profile.inventory.includes(id) && byId.get(id)?.kind === kind)) {
        res.status(403).json({ error: "You do not own that." });
        return;
    }
    profile.equipped[kind] = id;
    save();
    res.json(publicProfile(req.who));
});

router.post("/api/coins/search", requireIdentity, (req, res) => {
    const profile = req.who.profile;
    // One search every two seconds is already faster than a person types.
    if (!hit(`search:${req.who.key}`, 1, 2000).ok) {
        res.json({ awarded: 0, coins: profile.coins });
        return;
    }
    if (profile.earned.day !== today())
        profile.earned = { day: today(), coins: 0 };
    profile.searches.count++;
    let awarded = 0;
    if (profile.searches.count >= profile.searches.target) {
        profile.searches = { count: 0, target: 5 + crypto.randomInt(3) };
        if (profile.earned.coins < maxSearchCoinsPerDay) {
            awarded = searchReward;
            profile.coins += awarded;
            profile.earned.coins += awarded;
        }
    }
    save();
    res.json({ awarded, coins: profile.coins });
});
