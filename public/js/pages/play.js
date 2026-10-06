// lunara://play runs one game. With "Proxy games" on (the default) the game is served
// by this server from /gm/, which is what makes workers, relative files and HTML
// content types work. With it off, the page is fetched from jsDelivr and shown with a
// <base> tag so its own files still load from there.
const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const game = JSON.parse($("[data-game]").textContent);
const frame = $("[data-frame]");
const status = $("[data-status]");
const proxied = lunara.settings.get("proxyGames");
const encoded = game.f.split("/").map(encodeURIComponent).join("/");

$("[data-mode]").textContent = proxied ? "Proxied through Lunara" : "Direct from jsDelivr";

const showStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
};

const load = async () => {
    showStatus("Loading…");
    frame.addEventListener("load", () => showStatus(""), { once: true });
    if (proxied) {
        frame.removeAttribute("srcdoc");
        frame.src = `/gm/${encodeURIComponent(game.s)}/${encoded}`;
        return;
    }
    const base = `https://cdn.jsdelivr.net/gh/gmshelf/${encodeURIComponent(game.s)}@main/`;
    try {
        const response = await fetch(base + encoded);
        if (!response.ok)
            throw new Error(`jsDelivr answered HTTP ${response.status}`);
        const html = await response.text();
        const dir = base + encoded.replace(/[^/]*$/, "");
        const baseTag = `<base href="${dir}">`;
        frame.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + baseTag) : baseTag + html;
    }
    catch (error) {
        showStatus(`Could not load this game directly (${error.message}). Turn on "Proxy games" in Settings > Preferences.`);
    }
};

$("[data-reload]").addEventListener("click", () => {
    frame.src = "about:blank";
    void load();
});
$("[data-fullscreen]").addEventListener("click", () => {
    frame.requestFullscreen?.().catch(() => lunara.toast("Fullscreen is not allowed here."));
});

document.title = game.n;
void load();
