// lunara://music, laid out like YouTube Music. The home view shows SoundCloud's
// trending chart ("Quick picks" and "Trending now") and mood shelves from
// /api/music/home; searching or picking a mood swaps in a results view. Playback is
// handed to the shell's player, which keeps going after this page is closed.
import { icon } from "../icons.js";

const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const view = $("[data-view]");
const form = $("[data-music-form]");
const input = form.querySelector("input[name=q]");
const chips = [...document.querySelectorAll("[data-mood]")];

// What each mood chip searches for.
const moodQueries = {
    Energize: "energetic hype",
    Relax: "relaxing chill",
    Workout: "workout gym",
    Focus: "focus study beats",
    Party: "party dance",
    "Feel good": "feel good happy",
    Sad: "sad songs",
    Romance: "love songs r&b",
    Sleep: "sleep ambient",
    Commute: "driving chill"
};

let home = null;

const time = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};

const art = (track, className) => {
    const wrap = el("div", className);
    const img = el("img");
    img.alt = "";
    img.loading = "lazy";
    img.crossOrigin = "anonymous";
    if (track.artwork)
        img.src = track.artwork;
    const overlay = el("span", "ytm-art__overlay");
    overlay.innerHTML = `<span class="ytm-art__play">${icon("play", 18)}</span><span class="ytm-art__pause">${icon("pause", 18)}</span><span class="ytm-eq"><i></i><i></i><i></i></span>`;
    wrap.append(img, overlay);
    return wrap;
};

// Clicking the song that is already loaded pauses or resumes it; anything else
// starts the list from that song.
const playFrom = (list, i) => {
    const current = lunara.music.state();
    if (current.track && String(current.track.id) === String(list[i].id))
        lunara.music.toggle();
    else
        lunara.music.play(list, i);
};

const activate = (node, fn) => {
    node.tabIndex = 0;
    node.addEventListener("click", fn);
    node.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fn();
        }
    });
};

// A compact row: small square art, title, artist. Used by Quick picks and results.
const row = (list, i, { showTime = false } = {}) => {
    const track = list[i];
    const node = el("div", "ytm-row");
    node.dataset.id = String(track.id);
    const text = el("div", "ytm-row__text");
    text.append(el("div", "ytm-row__title", track.title), el("div", "ytm-row__artist", track.artist));
    node.append(art(track, "ytm-art ytm-art--small"), text);
    if (showTime)
        node.append(el("span", "ytm-row__time", time(track.duration)));
    activate(node, () => playFrom(list, i));
    return node;
};

// A big square card for carousels.
const card = (list, i) => {
    const track = list[i];
    const node = el("div", "ytm-card");
    node.dataset.id = String(track.id);
    node.append(art(track, "ytm-art ytm-art--card"), el("div", "ytm-card__title", track.title), el("div", "ytm-card__artist", track.artist));
    activate(node, () => playFrom(list, i));
    return node;
};

const shelf = ({ kicker, title, list, body, onMore }) => {
    const section = el("section", "ytm-shelf");
    const head = el("header", "ytm-shelf__head");
    const titles = el("div");
    if (kicker)
        titles.append(el("div", "ytm-shelf__kicker", kicker));
    titles.append(el("h2", "", title));
    const actions = el("div", "ytm-shelf__actions");
    const playAll = el("button", "ytm-pill", "Play all");
    playAll.type = "button";
    playAll.addEventListener("click", () => lunara.music.play(list, 0));
    actions.append(playAll);
    if (onMore) {
        const more = el("button", "ytm-pill", "More");
        more.type = "button";
        more.addEventListener("click", onMore);
        actions.append(more);
    }
    for (const [dir, name] of [[-1, "back"], [1, "forward"]]) {
        const arrow = el("button", "ytm-arrow");
        arrow.type = "button";
        arrow.setAttribute("aria-label", dir < 0 ? "Scroll left" : "Scroll right");
        arrow.innerHTML = icon(name, 18);
        arrow.addEventListener("click", () => body.scrollBy({ left: dir * body.clientWidth * 0.9, behavior: "smooth" }));
        actions.append(arrow);
    }
    head.append(titles, actions);
    section.append(head, body);
    return section;
};

const carousel = (list) => {
    const body = el("div", "ytm-carousel");
    body.append(...list.map((_, i) => card(list, i)));
    return body;
};

const quickPicks = (list) => {
    const body = el("div", "ytm-quick");
    body.append(...list.map((_, i) => row(list, i)));
    return body;
};

const status = (text) => view.replaceChildren(el("p", "ytm__status", text));

const setChip = (mood) => {
    for (const chip of chips)
        chip.classList.toggle("ytm-chip--active", chip.dataset.mood === mood);
};

const showHome = () => {
    setChip(null);
    input.value = "";
    if (!home) {
        status("Loading what's trending…");
        return;
    }
    const picks = home.trending.slice(0, 20);
    const trending = home.trending.slice(20);
    view.replaceChildren(
        shelf({ kicker: "Start with a trending song", title: "Quick picks", list: picks, body: quickPicks(picks) }),
        ...(trending.length ? [shelf({ kicker: "On SoundCloud right now", title: "Trending now", list: trending, body: carousel(trending) })] : []),
        ...home.shelves.map(s => shelf({ title: s.title, list: s.items, body: carousel(s.items), onMore: () => void search(s.query, s.title) })));
    markPlaying(lunara.music.state());
};

const loadHome = async () => {
    try {
        const response = await fetch("/api/music/home");
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(data.error ?? `HTTP ${response.status}`);
        home = data;
        showHome();
    }
    catch (error) {
        status(`${error.message} Try searching instead.`);
    }
};

const search = async (q, label = q) => {
    q = q.trim();
    if (!q)
        return;
    status("Searching…");
    try {
        const response = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(data.error ?? `HTTP ${response.status}`);
        const items = data.items ?? [];
        if (!items.length) {
            status(`Nothing playable found for "${label}". Try another search.`);
            return;
        }
        const back = el("button", "ytm-pill");
        back.type = "button";
        back.innerHTML = `${icon("back", 14)} Home`;
        back.addEventListener("click", showHome);
        const head = el("header", "ytm-results__head");
        head.append(back, el("h2", "", label));
        // Top result: the first hit, big, like YouTube Music.
        const top = el("div", "ytm-top");
        const topText = el("div", "ytm-top__text");
        const play = el("button", "ytm-pill ytm-pill--solid");
        play.type = "button";
        play.innerHTML = `${icon("play", 14)} Play`;
        play.addEventListener("click", event => {
            event.stopPropagation();
            playFrom(items, 0);
        });
        topText.append(el("div", "ytm-shelf__kicker", "Top result"), el("div", "ytm-top__title", items[0].title), el("div", "ytm-row__artist", `Song · ${items[0].artist} · ${time(items[0].duration)}`), play);
        top.dataset.id = String(items[0].id);
        top.append(art(items[0], "ytm-art ytm-art--top"), topText);
        activate(top, () => playFrom(items, 0));
        const songs = el("div", "ytm-songs");
        songs.append(...items.map((_, i) => row(items, i, { showTime: true })));
        const songsSection = el("section", "ytm-shelf");
        const songsHead = el("header", "ytm-shelf__head");
        songsHead.append(el("h2", "", "Songs"));
        songsSection.append(songsHead, songs);
        view.replaceChildren(head, top, songsSection);
        markPlaying(lunara.music.state());
    }
    catch (error) {
        status(error.message);
    }
};

const markPlaying = (state) => {
    const id = state.track ? String(state.track.id) : null;
    for (const node of view.querySelectorAll("[data-id]")) {
        const on = node.dataset.id === id;
        node.classList.toggle("is-current", on);
        node.classList.toggle("is-playing", on && state.playing);
    }
};

form.addEventListener("submit", event => {
    event.preventDefault();
    setChip(null);
    void search(input.value);
    input.blur();
});
$("[data-home]").addEventListener("click", showHome);
for (const chip of chips) {
    chip.addEventListener("click", () => {
        if (chip.classList.contains("ytm-chip--active")) {
            showHome();
            return;
        }
        setChip(chip.dataset.mood);
        input.value = "";
        void search(moodQueries[chip.dataset.mood], chip.dataset.mood);
    });
}

const unsubscribe = lunara.music.onChange(markPlaying);
addEventListener("pagehide", unsubscribe);

void loadHome();
