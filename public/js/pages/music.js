// lunara://music: search SoundCloud through /api/music and hand the results to the
// shell's player, which keeps playing after this page is closed.
const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const form = $("[data-music-form]");
const input = form.querySelector("input[name=q]");
const list = $("[data-tracks]");
const status = $("[data-status]");
let results = [];

const time = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const markPlaying = (state) => {
    for (const row of list.children) {
        const playing = state.track && String(state.track.id) === row.dataset.id;
        row.classList.toggle("track--playing", Boolean(playing));
        row.querySelector(".track__state").textContent = playing ? (state.playing ? "Playing" : "Paused") : "";
    }
};

const render = () => {
    list.replaceChildren(...results.map((track, i) => {
        const row = document.createElement("li");
        row.className = "track";
        row.dataset.id = String(track.id);
        row.tabIndex = 0;
        const art = document.createElement("img");
        art.className = "track__art";
        art.alt = "";
        art.loading = "lazy";
        art.crossOrigin = "anonymous";
        if (track.artwork)
            art.src = track.artwork;
        const body = document.createElement("div");
        body.className = "track__body";
        const title = document.createElement("div");
        title.className = "track__title";
        title.textContent = track.title;
        const artist = document.createElement("div");
        artist.className = "track__artist";
        artist.textContent = track.artist;
        body.append(title, artist);
        const state = document.createElement("span");
        state.className = "track__state";
        const length = document.createElement("span");
        length.className = "track__time";
        length.textContent = time(track.duration);
        row.append(art, body, state, length);
        const play = () => {
            const current = lunara.music.state();
            if (current.track && String(current.track.id) === row.dataset.id)
                lunara.music.toggle();
            else
                lunara.music.play(results, i);
        };
        row.addEventListener("click", play);
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                play();
            }
        });
        return row;
    }));
    markPlaying(lunara.music.state());
};

const searchFor = async (q) => {
    q = q.trim();
    if (!q)
        return;
    input.value = q;
    status.textContent = "Searching…";
    try {
        const response = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(data.error ?? `HTTP ${response.status}`);
        results = data.items ?? [];
        status.textContent = results.length ? `${results.length} tracks. Click one to play; the rest play after it.` : "Nothing playable found. Try another search.";
        render();
        try {
            sessionStorage.setItem("lunara:music-last", q);
        }
        catch { }
    }
    catch (error) {
        status.textContent = error.message;
    }
};

form.addEventListener("submit", event => {
    event.preventDefault();
    void searchFor(input.value);
});
for (const chip of document.querySelectorAll("[data-genre]"))
    chip.addEventListener("click", () => void searchFor(chip.dataset.genre));

const unsubscribe = lunara.music.onChange(markPlaying);
addEventListener("pagehide", unsubscribe);

// Reopening the page shows what is playing, or the last search.
const current = lunara.music.state();
if (current.queue.length) {
    results = current.queue;
    status.textContent = "Now playing queue";
    render();
}
else {
    let last = "";
    try {
        last = sessionStorage.getItem("lunara:music-last") ?? "";
    }
    catch { }
    void searchFor(last || "lofi");
}
