// lunara://movies: TMDB (through /api/tmdb) for finding things, vidfast.vc for playing them.
const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const results = $("[data-results]");
const status = $("[data-status]");
const heading = $("[data-heading]");
const watch = $("[data-watch]");
const player = $("[data-player]");
const seasonSelect = $("[data-season]");
const episodeSelect = $("[data-episode]");
const form = $("[data-movie-form]");
const provider = "https://vidfast.vc";
let current = null;

const tmdb = async (path, params = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`/api/tmdb/${path}${query ? `?${query}` : ""}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
};
const poster = (path, size = "w342") => path ? `/api/tmdb-img/${size}/${path.replace(/^\//, "")}` : "";
const setStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
};

const embedUrl = () => current.type === "movie"
    ? `${provider}/movie/${current.id}`
    : `${provider}/tv/${current.id}/${seasonSelect.value || 1}/${episodeSelect.value || 1}`;

const play = () => {
    player.src = embedUrl();
};

const loadSeason = async () => {
    episodeSelect.replaceChildren(new Option("Loading…", ""));
    try {
        const season = await tmdb(`tv/${current.id}/season/${seasonSelect.value}`);
        episodeSelect.replaceChildren(...(season.episodes ?? []).map(ep => new Option(`E${ep.episode_number} · ${ep.name}`, ep.episode_number)));
    }
    catch {
        episodeSelect.replaceChildren(new Option("Episode 1", "1"));
    }
    play();
};

const open = async (item) => {
    current = { id: item.id, type: item.media_type === "tv" ? "tv" : "movie", title: item.title ?? item.name };
    $("[data-watch-title]").textContent = current.title;
    $("[data-overview]").textContent = item.overview ?? "";
    seasonSelect.hidden = episodeSelect.hidden = current.type !== "tv";
    watch.hidden = false;
    scrollTo({ top: 0, behavior: "smooth" });
    if (current.type === "movie") {
        play();
        return;
    }
    try {
        const show = await tmdb(`tv/${current.id}`);
        const seasons = (show.seasons ?? []).filter(s => s.season_number > 0);
        seasonSelect.replaceChildren(...(seasons.length ? seasons : [{ season_number: 1, name: "Season 1" }]).map(s => new Option(s.name, s.season_number)));
    }
    catch {
        seasonSelect.replaceChildren(new Option("Season 1", "1"));
    }
    await loadSeason();
};

const render = (items) => {
    const list = items.filter(item => ["movie", "tv"].includes(item.media_type));
    results.replaceChildren(...list.map(item => {
        const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
        const art = poster(item.poster_path);
        {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "poster";
            card.addEventListener("click", () => void open(item));
            const frame = document.createElement("span");
            frame.className = "poster__art";
            if (art) {
                const img = document.createElement("img");
                img.src = art;
                img.alt = "";
                img.loading = "lazy";
                frame.append(img);
            }
            else
                frame.textContent = (item.title ?? item.name ?? "?").slice(0, 1);
            const name = document.createElement("span");
            name.className = "poster__name";
            name.textContent = item.title ?? item.name;
            const meta = document.createElement("span");
            meta.className = "poster__meta";
            meta.textContent = [item.media_type === "tv" ? "TV" : "Movie", year, item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : ""].filter(Boolean).join(" · ");
            card.append(frame, name, meta);
            return card;
        }
    }));
    setStatus(list.length ? "" : "Nothing found. Try another title.");
};

const load = async (path, params, title) => {
    heading.textContent = title;
    setStatus("Loading…");
    try {
        render((await tmdb(path, params)).results ?? []);
    }
    catch (error) {
        results.replaceChildren();
        setStatus(error.message);
    }
};

form.addEventListener("submit", event => {
    event.preventDefault();
    const q = form.q.value.trim();
    if (q)
        void load("search/multi", { query: q }, `Results for “${q}”`);
    else
        void load("trending/all/week", {}, "Trending this week");
});
seasonSelect.addEventListener("change", () => void loadSeason());
episodeSelect.addEventListener("change", play);
$("[data-close-watch]").addEventListener("click", () => {
    player.removeAttribute("src");
    watch.hidden = true;
});
$("[data-proxy-watch]").addEventListener("click", () => current && lunara.open(embedUrl()));

void load("trending/all/week", {}, "Trending this week");
