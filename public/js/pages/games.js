// lunara://games. The catalog comes from /api/games (every gmshelf source merged);
// cards render in batches as you scroll, since there are a few thousand of them.
const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const sourceSelect = $("[data-source]");
const search = $("[data-search]");
const grid = $("[data-grid]");
const count = $("[data-count]");
const empty = $("[data-empty]");
const sentinel = $("[data-sentinel]");
const batch = 120;
const sourceKey = "lunara:games-source";
const format = (n) => n.toLocaleString();

let catalog = null;
let matches = [];
let shown = 0;

const assetUrl = (source, file) => lunara.settings.get("proxyGames")
    ? `/gm/${source}/${file.split("/").map(encodeURIComponent).join("/")}`
    : `https://cdn.jsdelivr.net/gh/gmshelf/${source}@main/${file.split("/").map(encodeURIComponent).join("/")}`;

const playUrl = (game) => {
    const source = catalog.sources[game.s].id;
    return `lunara://play?s=${encodeURIComponent(source)}&f=${encodeURIComponent(game.f)}&n=${encodeURIComponent(game.n)}`;
};

const monogram = (name) => {
    const letters = name.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?";
    return letters[0].toUpperCase() + letters.slice(1).toLowerCase();
};

const cardFor = (game) => {
    const source = catalog.sources[game.s];
    const card = document.createElement("a");
    card.href = "#";
    card.className = "game";
    card.dataset.open = playUrl(game);
    card.title = game.n;
    const art = document.createElement("span");
    art.className = "game__art";
    const mono = document.createElement("span");
    mono.className = "game__mono";
    mono.textContent = monogram(game.n);
    art.append(mono);
    if (game.c) {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        img.src = assetUrl(source.id, game.c);
        img.onerror = () => img.remove();
        art.append(img);
    }
    const name = document.createElement("span");
    name.className = "game__name";
    name.textContent = game.n;
    const badge = document.createElement("span");
    badge.className = "game__source";
    badge.textContent = source.label;
    card.append(art, name, badge);
    return card;
};

const renderMore = () => {
    const slice = matches.slice(shown, shown + batch);
    grid.append(...slice.map(cardFor));
    shown += slice.length;
};

const update = () => {
    const source = sourceSelect.value;
    const needle = search.value.trim().toLowerCase();
    const sourceIndex = catalog.sources.findIndex(s => s.id === source);
    matches = catalog.games.filter(game => (sourceIndex < 0 || game.s === sourceIndex) && (!needle || game.n.toLowerCase().includes(needle)));
    const inSource = sourceIndex < 0 ? catalog.total : catalog.sources[sourceIndex].count;
    count.textContent = needle
        ? `${format(matches.length)} of ${format(inSource)} games match`
        : sourceIndex < 0
            ? `${format(catalog.total)} games in total from ${catalog.sources.length} sources`
            : `${format(inSource)} games from ${catalog.sources[sourceIndex].label} · ${format(catalog.total)} in total`;
    grid.replaceChildren();
    shown = 0;
    renderMore();
    empty.hidden = matches.length > 0;
};

new IntersectionObserver(entries => {
    if (catalog && entries.some(e => e.isIntersecting) && shown < matches.length)
        renderMore();
}, { rootMargin: "800px" }).observe(sentinel);

sourceSelect.addEventListener("change", () => {
    try {
        localStorage.setItem(sourceKey, sourceSelect.value);
    }
    catch { }
    update();
});
search.addEventListener("input", update);
$("[data-random]").addEventListener("click", () => {
    const pool = matches.length ? matches : catalog?.games ?? [];
    if (pool.length)
        lunara.open(playUrl(pool[Math.floor(Math.random() * pool.length)]));
});

try {
    const response = await fetch("/api/games");
    if (!response.ok)
        throw new Error((await response.json().catch(() => null))?.error ?? `HTTP ${response.status}`);
    catalog = await response.json();
    // Same name across sources is common; sort by name and keep source order stable.
    catalog.games.sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true, sensitivity: "base" }) || a.s - b.s);
    sourceSelect.replaceChildren(
        new Option(`All sources (${format(catalog.total)})`, "all"),
        ...catalog.sources.map(s => new Option(`${s.label} (${format(s.count)})`, s.id)));
    let saved = "all";
    try {
        saved = localStorage.getItem(sourceKey) ?? "all";
    }
    catch { }
    sourceSelect.value = catalog.sources.some(s => s.id === saved) ? saved : "all";
    update();
    search.focus();
}
catch (error) {
    count.textContent = `Could not load the game lists: ${error.message}`;
}
