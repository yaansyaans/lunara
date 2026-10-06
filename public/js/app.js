import { engine } from "./engine.js";
import { resolveInput, formatForDisplay } from "./url.js";
import * as settings from "./settings.js";
import { TabManager } from "./tabs.js";
import * as visitLog from "./history.js";
import * as bookmarks from "./bookmarks.js";
import * as internal from "./internal.js";
import { registerInternalPages } from "./internal-pages.js";
import { applyCloak, panicHandler } from "./cloak.js";
import { icon, sections, utilities } from "./icons.js";
import * as appearance from "./appearance.js";
import * as account from "./account.js";
import * as player from "./player.js";
import * as settingsModal from "./settings-modal.js";
const $ = (selector) => document.querySelector(selector);
const addressBar = $("#address");
const frames = $("#frames");
const status = $("#status");
let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));
registerInternalPages();
const tabs = new TabManager(frames);
const tabStrip = $("#tabs");
tabs.onChange(() => render());
const currentSession = () => tabs.active?.session ?? null;
const currentUrl = () => tabs.active?.url ?? "";
const currentTitle = () => tabs.active?.title ?? "";
const canGoBack = () => tabs.active?.canGoBack ?? false;
const canGoForward = () => tabs.active?.canGoForward ?? false;
const goBack = () => tabs.active?.back() ?? null;
const goForward = () => tabs.active?.forward() ?? null;
const tabIcon = (tab) => {
    const name = internal.isInternal(tab.url) ? internal.pageName(tab.url) : "globe";
    const item = [...sections, ...utilities].find(s => s.name === name);
    return icon(item?.icon ?? name ?? "globe", 14);
};
// Tabs are rebuilt on every change, so remember which ones already played the open animation.
const seenTabs = new Set();
const renderTabs = () => {
    const nodes = tabs.tabs.map(tab => {
        const el = document.createElement("div");
        el.className = tab.id === tabs.activeId ? "tab tab--active" : "tab";
        if (!seenTabs.has(tab.id)) {
            seenTabs.add(tab.id);
            el.classList.add("tab--new");
        }
        if (tab.loading)
            el.classList.add("tab--loading");
        el.setAttribute("role", "tab");
        el.setAttribute("aria-selected", String(tab.id === tabs.activeId));
        el.tabIndex = 0;
        const glyph = document.createElement("span");
        glyph.className = "tab__icon";
        glyph.innerHTML = tabIcon(tab);
        const label = document.createElement("span");
        label.className = "tab__label";
        label.textContent = tab.loading ? "Loading…" : tab.title;
        label.title = tab.url || tab.title;
        const close = document.createElement("button");
        close.className = "tab__close";
        close.type = "button";
        close.setAttribute("aria-label", `Close ${tab.title}`);
        close.innerHTML = icon("close", 12);
        close.addEventListener("click", event => {
            event.stopPropagation();
            tabs.close(tab.id);
        });
        el.append(glyph, label, close);
        el.addEventListener("click", () => tabs.select(tab.id));
        el.addEventListener("keydown", event => {
            switch (event.key) {
                case "Enter":
                case " ":
                    event.preventDefault();
                    tabs.select(tab.id);
                    break;
            }
        });
        el.addEventListener("auxclick", event => {
            if (event.button === 1) {
                event.preventDefault();
                tabs.close(tab.id);
            }
        });
        return el;
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "tabs__add";
    add.setAttribute("aria-label", "New tab");
    add.title = "New tab";
    add.innerHTML = icon("plus", 16);
    add.addEventListener("click", () => {
        openInNewTab(startUrl());
        addressBar.focus();
    });
    tabStrip.replaceChildren(...nodes, add);
    tabStrip.querySelector(".tab--active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
};
const openInNewTab = (input) => {
    tabs.open();
    void navigate(input);
};
const dock = $("#dock");
const dockButton = ({ name, label, icon: glyph }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dock__item";
    button.dataset.page = name;
    button.dataset.label = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon(glyph ?? name, 20);
    button.addEventListener("click", () => name === "settings" ? settingsModal.open() : openInNewTab(`lunara://${name}`));
    return button;
};
const renderDock = () => {
    const logo = document.createElement("div");
    logo.className = "dock__logo";
    logo.innerHTML = icon("moon", 22);
    const divider = () => {
        const line = document.createElement("span");
        line.className = "dock__divider";
        return line;
    };
    dock.replaceChildren(logo, divider(), ...sections.map(dockButton), divider(), ...utilities.map(dockButton));
};
const highlightDock = () => {
    const url = currentUrl();
    const page = internal.isInternal(url) ? internal.pageName(url) : null;
    for (const button of dock.querySelectorAll(".dock__item")) {
        button.classList.toggle("dock__item--active", button.dataset.page === page);
    }
};
const startUrl = () => {
    const configured = settings.get("homeUrl");
    if (configured)
        return configured;
    return internal.homeUrl;
};
const searchTemplate = () => {
    return settings.get("searchEngine");
};
const navigate = async (input, options = {}) => {
    const { url, kind } = resolveInput(input, searchTemplate());
    if (kind === "internal" && ["settings", "about"].includes(internal.pageName(url) ?? "")) {
        settingsModal.open(internal.pageName(url) === "about" ? "about" : undefined);
        return;
    }
    const redirect = kind === "internal" ? internal.redirectOf(url) : null;
    if (redirect)
        return navigate(redirect, options);
    if (kind === "search" && options.record !== false)
        void account.recordSearch().then(awarded => {
            if (awarded)
                setStatus(`+${awarded} Lunara coins! Spend them in the Shop.`);
        });
    switch (kind) {
        case "empty":
            return;
        case "blocked":
            setStatus("That address cannot be opened through the proxy.");
            return;
        case "external":
            location.assign(url);
            return;
        case "internal": {
            const html = internal.render(url);
            if (html === null)
                return;
            const tab = tabs.active ?? tabs.open();
            if (options.record !== false)
                tab.internalHistory.push(url);
            if (options.record !== false)
                tab.record(url);
            tab.url = url;
            tab.title = internal.titleOf(url);
            tab.loading = false;
            tab.element.removeAttribute("src");
            tab.element.srcdoc = html;
            tabs.emit();
            return;
        }
        default: {
            setStatus("");
            const tab = tabs.active ?? tabs.open();
            if (options.record === false) {
                tab.url = url;
                tab.element.removeAttribute("srcdoc");
                await tab.ensureSession();
                tab.session.go(url);
                tabs.emit();
            }
            else {
                await tab.go(url);
            }
        }
    }
};
const refreshInternalPages = (names) => {
    for (const tab of tabs.tabs) {
        if (!internal.isInternal(tab.url) ||
            !names.includes(internal.pageName(tab.url) ?? ""))
            continue;
        const html = internal.render(tab.url);
        if (html !== null)
            tab.element.srcdoc = html;
    }
    tabs.emit();
};
visitLog.onChange(() => refreshInternalPages(["history"]));
bookmarks.onChange(() => refreshInternalPages(["bookmarks"]));
addEventListener("message", event => {
    if (event.origin !== location.origin)
        return;
    if (!internal.isInternal(currentUrl()))
        return;
    if (event.source !== tabs.active?.element.contentWindow)
        return;
    const data = event.data;
    if (!data || typeof data !== "object")
        return;
    switch (data.type) {
        case "internal:open":
            if (typeof data.url === "string")
                void navigate(data.url);
            break;
        case "internal:action":
            switch (data.action) {
                case "clear-history":
                    setStatus(visitLog.clear()
                        ? "History cleared."
                        : "History cleared for this session, but browser storage is unavailable.");
                    void navigate(currentUrl());
                    break;
            }
            break;
        case "internal:popup-blocked":
            setStatus("The browser blocked the popup.");
            break;
    }
});
const applyTransport = async () => {
    try {
        await engine.setTransport?.({
            kind: settings.get("transport"),
            wisp: settings.get("wispUrl")
        });
    }
    catch (error) {
        setStatus(`Could not switch transport: ${error.message}`);
    }
};
const render = () => {
    renderTabs();
    highlightDock();
    const url = currentUrl();
    if (!addressBarFocused)
        addressBar.value = url ? formatForDisplay(url) : "";
    $("#back").disabled = !canGoBack();
    $("#forward").disabled = !canGoForward();
    $("#reload").disabled =
        !currentSession() && !internal.isInternal(url);
    const star = $("#bookmark");
    const bookmarkable = /^https?:/i.test(url);
    star.disabled = !bookmarkable;
    star.setAttribute("aria-pressed", String(bookmarkable ? bookmarks.has(url) : false));
};
let statusTimer = 0;
const setStatus = (message) => {
    clearTimeout(statusTimer);
    status.textContent = message ?? "";
    status.hidden = !message;
    if (message)
        statusTimer = setTimeout(() => setStatus(""), 4000);
};
$("#omnibox").addEventListener("submit", event => {
    event.preventDefault();
    addressBar.blur();
    void navigate(addressBar.value);
});
$("#back").addEventListener("click", () => {
    const url = goBack();
    if (url)
        void navigate(url, { record: false });
});
$("#forward").addEventListener("click", () => {
    const url = goForward();
    if (url)
        void navigate(url, { record: false });
});
$("#reload").addEventListener("click", () => {
    if (internal.isInternal(currentUrl())) {
        void navigate(currentUrl());
        return;
    }
    currentSession()?.reload();
});
$("#bookmark").addEventListener("click", () => {
    const url = currentUrl();
    if (!/^https?:/i.test(url))
        return;
    bookmarks.toggle(url, currentTitle());
    render();
});
bookmarks.onChange(() => render());
applyCloak();
const shortcuts = (event) => {
    if (!(event.ctrlKey || event.metaKey))
        return;
    switch (event.key) {
        case "l":
            event.preventDefault();
            addressBar.focus();
            addressBar.select();
            break;
        case "t":
            event.preventDefault();
            openInNewTab(startUrl());
            addressBar.focus();
            break;
        case ",":
            event.preventDefault();
            settingsModal.open();
            break;
    }
};
addEventListener("keydown", shortcuts);
$("#back").innerHTML = icon("back");
$("#forward").innerHTML = icon("forward");
$("#reload").innerHTML = icon("reload", 16);
$("#bookmark").innerHTML = icon("bookmark", 16);
$("#omnibox-icon").innerHTML = icon("search", 15);
$("#coins").insertAdjacentHTML("afterbegin", icon("coin", 16));
// ---- the bridge lunara:// pages use (they are same-origin iframes) ----
window.lunara = {
    open: (url) => void navigate(url),
    toast: (message) => setStatus(message),
    openSettings: (tab) => settingsModal.open(tab),
    settings: { get: settings.get },
    account: {
        api: account.api,
        json: account.json,
        getProfile: account.getProfile,
        refresh: account.refresh,
        onChange: account.onChange,
        buy: account.buy,
        equip: account.equip
    },
    music: {
        play: player.play,
        toggle: player.toggle,
        state: player.state,
        onChange: player.onChange
    }
};

// ---- settings: apply live ----
let lastNetwork = JSON.stringify([settings.get("transport"), settings.get("wispUrl")]);
settings.onChange(() => {
    appearance.apply();
    applyCloak();
    const network = JSON.stringify([settings.get("transport"), settings.get("wispUrl")]);
    if (network !== lastNetwork) {
        lastNetwork = network;
        void applyTransport();
    }
});
// Restyle open lunara:// pages in place, so changing a theme never reloads them.
appearance.onApply(() => {
    for (const tab of tabs.tabs) {
        if (!internal.isInternal(tab.url))
            continue;
        try {
            appearance.applyTo(tab.element.contentDocument);
        }
        catch { }
    }
});

// The panic key also has to work while focus is inside a page.
const armed = new WeakSet();
const armFrames = () => {
    for (const tab of tabs.tabs) {
        try {
            // Keyed by document: each navigation gets a fresh one without our listeners.
            const win = tab.element.contentWindow;
            const doc = tab.element.contentDocument;
            if (win && doc && !armed.has(doc)) {
                armed.add(doc);
                win.addEventListener("keydown", panicHandler, true);
                // lunara:// pages only; a proxied site keeps its own Ctrl shortcuts.
                if (internal.isInternal(tab.url))
                    win.addEventListener("keydown", shortcuts);
            }
        }
        catch { }
    }
};
frames.addEventListener("load", armFrames, true);
tabs.onChange(armFrames);

// ---- coins chip ----
const coins = $("#coins");
const paintCoins = (profile) => {
    coins.querySelector("[data-amount]").textContent = profile.coins.toLocaleString();
    coins.title = `${profile.coins} Lunara coins. Open the Shop`;
};
account.onChange(paintCoins);
coins.addEventListener("click", () => openInNewTab("lunara://shop"));

// ---- Settings > Data actions ----
const clearBrowsingData = async () => {
    visitLog.clear();
    try {
        sessionStorage.clear();
    }
    catch { }
    // Proxied sites keep their localStorage and cookies under this origin. Keep only Lunara's own keys.
    try {
        for (const key of Object.keys(localStorage))
            if (!key.startsWith("lunara:"))
                localStorage.removeItem(key);
    }
    catch { }
    try {
        for (const key of await caches.keys())
            await caches.delete(key);
    }
    catch { }
    try {
        const databases = await indexedDB.databases();
        await Promise.all(databases.map(db => new Promise(resolve => {
            const request = indexedDB.deleteDatabase(db.name);
            request.onsuccess = request.onerror = request.onblocked = resolve;
            setTimeout(resolve, 1500);
        })));
    }
    catch { }
    try {
        for (const cookie of document.cookie.split(";")) {
            const name = cookie.split("=")[0].trim();
            if (name)
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
    }
    catch { }
    location.reload();
};
const resetSettings = () => {
    appearance.clearUploadedBackground();
    const { persisted } = settings.reset();
    setStatus(persisted ? "Settings reset." : "Reset for this session, but browser storage is unavailable.");
};
settingsModal.init({
    toast: (message) => setStatus(message),
    engine,
    clearHistory: () => setStatus(visitLog.clear() ? "History cleared." : "History cleared for this session, but browser storage is unavailable."),
    clearBrowsingData,
    resetSettings
});

appearance.apply();
player.mount();
renderDock();
void applyTransport();
void account.ensureToken().then(account.refresh, () => setStatus("Could not start a Lunara session. Coins and AI need the server."));
engine.init().catch(() => setStatus("Could not reach the proxy backend."));
tabs.open();
void navigate(startUrl());
