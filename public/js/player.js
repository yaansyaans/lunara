// The music player lives in the shell, not in lunara://music, so a song keeps
// playing while you switch tabs or close the music page. lunara://music hands it a
// queue through the window.lunara bridge.
import * as storage from "./storage.js";
import { icon } from "./icons.js";

const audio = new Audio();
audio.preload = "auto";
audio.volume = storage.read("volume", 0.8);

let queue = [];
let index = -1;
let error = "";
const listeners = new Set();

export const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
const emit = () => {
    render();
    for (const fn of listeners) {
        try {
            fn(state());
        }
        catch {
            // A closed lunara://music page leaves a dead listener behind; drop it.
            listeners.delete(fn);
        }
    }
};

export const state = () => ({ track: queue[index] ?? null, playing: !audio.paused, index, queue, error });

const formatTime = (seconds) => {
    if (!Number.isFinite(seconds))
        return "0:00";
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
};

const load = (i) => {
    index = i;
    const track = queue[index];
    if (!track)
        return;
    error = "";
    audio.src = `/api/music/stream/${track.id}`;
    void audio.play().catch(() => { });
    if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            artwork: track.artwork ? [{ src: track.artwork, sizes: "500x500" }] : []
        });
    }
    emit();
};

export const play = (tracks, start = 0) => {
    queue = tracks.slice(0, 200);
    load(start);
};
export const toggle = () => {
    if (!queue[index])
        return;
    if (audio.paused)
        void audio.play().catch(() => { });
    else
        audio.pause();
};
export const next = () => {
    if (index < queue.length - 1)
        load(index + 1);
};
export const prev = () => {
    if (audio.currentTime > 4 || index === 0)
        audio.currentTime = 0;
    else
        load(index - 1);
};
export const stop = () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    queue = [];
    index = -1;
    emit();
};

audio.addEventListener("play", emit);
audio.addEventListener("pause", emit);
audio.addEventListener("ended", next);
audio.addEventListener("error", () => {
    if (!queue[index])
        return;
    error = "This track could not be played.";
    emit();
    // Skip ahead rather than stall the queue on one bad track.
    setTimeout(() => {
        if (error)
            next();
    }, 1500);
});
if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", toggle);
    navigator.mediaSession.setActionHandler("pause", toggle);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
}

// ---- the mini player ----

const root = document.createElement("div");
root.className = "player";
root.hidden = true;
root.innerHTML = `
  <img class="player__art" alt="" crossorigin="anonymous">
  <div class="player__info">
    <div class="player__title"></div>
    <div class="player__artist"></div>
    <div class="player__seek">
      <span class="player__time" data-current>0:00</span>
      <input type="range" min="0" max="1000" value="0" aria-label="Seek" data-seek>
      <span class="player__time" data-total>0:00</span>
    </div>
  </div>
  <div class="player__controls">
    <button type="button" class="icon-button" data-prev aria-label="Previous">${icon("prev", 16)}</button>
    <button type="button" class="icon-button player__play" data-toggle aria-label="Play">${icon("play", 18)}</button>
    <button type="button" class="icon-button" data-next aria-label="Next">${icon("next", 16)}</button>
    <button type="button" class="icon-button" data-mute aria-label="Mute">${icon("volume", 16)}</button>
    <input type="range" class="player__volume" min="0" max="100" aria-label="Volume" data-volume>
    <button type="button" class="icon-button" data-close aria-label="Close player">${icon("close", 14)}</button>
  </div>`;
const $ = (selector) => root.querySelector(selector);
const seek = $("[data-seek]");
const volume = $("[data-volume]");
volume.value = String(Math.round(audio.volume * 100));
let seeking = false;

$("[data-prev]").addEventListener("click", prev);
$("[data-next]").addEventListener("click", next);
$("[data-toggle]").addEventListener("click", toggle);
$("[data-close]").addEventListener("click", stop);
$("[data-mute]").addEventListener("click", () => {
    audio.muted = !audio.muted;
    render();
});
seek.addEventListener("input", () => (seeking = true));
seek.addEventListener("change", () => {
    seeking = false;
    if (Number.isFinite(audio.duration))
        audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
});
volume.addEventListener("input", () => {
    audio.volume = Number(volume.value) / 100;
    audio.muted = false;
    storage.write("volume", audio.volume);
    render();
});
audio.addEventListener("timeupdate", () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : queue[index]?.duration ?? 0;
    $("[data-current]").textContent = formatTime(audio.currentTime);
    $("[data-total]").textContent = formatTime(duration);
    if (!seeking && duration)
        seek.value = String(Math.round((audio.currentTime / duration) * 1000));
});

const render = () => {
    const track = queue[index];
    root.hidden = !track;
    if (!track)
        return;
    const art = $(".player__art");
    if (art.getAttribute("src") !== track.artwork) {
        if (track.artwork)
            art.src = track.artwork;
        else
            art.removeAttribute("src");
    }
    $(".player__title").textContent = error || track.title;
    $(".player__title").title = track.title;
    $(".player__artist").textContent = track.artist;
    const toggleButton = $("[data-toggle]");
    toggleButton.innerHTML = icon(audio.paused ? "play" : "pause", 18);
    toggleButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
    $("[data-mute]").innerHTML = icon(audio.muted || audio.volume === 0 ? "mute" : "volume", 16);
    $("[data-prev]").disabled = index <= 0 && audio.currentTime < 4;
    $("[data-next]").disabled = index >= queue.length - 1;
};

export const mount = () => document.body.append(root);
