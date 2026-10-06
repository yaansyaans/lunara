// Settings, as a pop-up in the middle of the screen with a sidebar of tabs. Every
// control applies immediately; there is no save button. Settings stay validated by
// settings.js, so anything rejected here shows an inline error instead of saving.
import * as settings from "./settings.js";
import * as account from "./account.js";
import * as appearance from "./appearance.js";
import { themes, fonts, palette, resolveMode, fontHref } from "./themes.js";
import { icon } from "./icons.js";
import { builds } from "./changelog.js";

const tabs = [
    { id: "appearance", label: "Appearance", icon: "palette", tile: "#e0457b" },
    { id: "preferences", label: "Preferences", icon: "hammer", tile: "#e8890c" },
    { id: "cloaking", label: "Cloaking", icon: "ghost", tile: "#7c5ce0" },
    { id: "data", label: "Data", icon: "server", tile: "#1689d6" },
    { id: "legal", label: "Legal", icon: "scale", tile: "#5b6b82" },
    { id: "changelog", label: "Changelog", icon: "history", tile: "#d4a017" },
    { id: "about", label: "About", icon: "info", tile: "#13a36f" }
];

let deps = {};
let root = null;
let activeTab = "appearance";
let lastFocus = null;
const cleanups = new Set();

// ---- tiny DOM helpers ----

const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (value === undefined || value === null || value === false)
            continue;
        if (key === "class")
            el.className = value;
        else if (key === "html")
            el.innerHTML = value;
        else if (key.startsWith("on"))
            el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === "style" && typeof value === "object")
            Object.assign(el.style, value);
        else
            el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false)
            continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
};

const svg = (name, size = 18) => h("span", { class: "svg", html: icon(name, size), "aria-hidden": "true" });

const section = (title, description, ...children) => h("section", { class: "set-section" },
    h("h3", {}, title),
    description ? h("p", { class: "set-section__desc" }, description) : null,
    ...children);

const row = (label, help, control, attrs = {}) => h("div", { class: "set-row", ...attrs },
    h("div", { class: "set-row__text" }, h("div", { class: "set-row__label" }, label), help ? h("div", { class: "set-row__help" }, help) : null),
    h("div", { class: "set-row__control" }, control));

const message = (el, text, kind = "error") => {
    el.textContent = text;
    el.dataset.kind = kind;
    el.hidden = !text;
};

const apply = (patch, errorEl) => {
    const { rejected } = settings.set(patch);
    if (errorEl)
        message(errorEl, rejected.length ? "That value is not valid, so it was not saved." : "");
    return rejected.length === 0;
};

const toggle = (name, onChange) => {
    const input = h("input", { type: "checkbox", role: "switch", class: "switch" });
    input.checked = Boolean(settings.get(name));
    input.addEventListener("change", () => {
        apply({ [name]: input.checked });
        onChange?.(input.checked);
    });
    return input;
};

// A slider that also answers the scroll wheel, for fine-tuning without dragging.
const slider = (name, min, max, step, unit) => {
    const value = h("output", { class: "slider__value" });
    const input = h("input", { type: "range", min, max, step, class: "slider__input", "aria-label": name });
    const sync = () => (value.textContent = `${input.value}${unit}`);
    input.value = String(settings.get(name));
    sync();
    input.addEventListener("input", () => {
        sync();
        apply({ [name]: Number(input.value) });
    });
    input.addEventListener("wheel", event => {
        event.preventDefault();
        const delta = event.deltaY < 0 ? Number(step) : -Number(step);
        input.value = String(Math.min(Number(max), Math.max(Number(min), Number(input.value) + delta)));
        input.dispatchEvent(new Event("input"));
    }, { passive: false });
    return h("div", { class: "slider" }, input, value);
};

const segmented = (name, options, onChange) => {
    const group = h("div", { class: "segmented", role: "radiogroup" });
    const buttons = options.map(option => {
        const button = h("button", { type: "button", role: "radio", class: "segmented__item" },
            option.icon ? svg(option.icon, 15) : null, option.label);
        button.addEventListener("click", () => {
            apply({ [name]: option.value });
            mark();
            onChange?.(option.value);
        });
        return button;
    });
    const mark = () => buttons.forEach((button, i) => button.setAttribute("aria-checked", String(options[i].value === settings.get(name))));
    mark();
    group.append(...buttons);
    return group;
};

const select = (name, options, onChange) => {
    const el = h("select", { class: "set-select" }, options.map(option => h("option", { value: option.value }, option.label)));
    el.value = String(settings.get(name));
    el.addEventListener("change", () => {
        apply({ [name]: el.value });
        onChange?.(el.value);
    });
    return el;
};

const textField = (name, { type = "text", placeholder = "", help } = {}) => {
    const error = h("p", { class: "set-error", hidden: true });
    const input = h("input", { type, class: "set-input", placeholder, autocomplete: "off", spellcheck: "false" });
    input.value = settings.get(name) ?? "";
    const commit = () => {
        if (input.value.trim() === String(settings.get(name) ?? ""))
            return;
        if (apply({ [name]: input.value }, error))
            input.value = settings.get(name) ?? "";
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", event => {
        if (event.key === "Enter")
            commit();
    });
    return h("div", { class: "set-field" }, input, help ? h("p", { class: "set-row__help" }, help) : null, error);
};

const button = (label, onClick, { kind = "", iconName } = {}) => h("button", { type: "button", class: `set-button ${kind}`, onclick: onClick }, iconName ? svg(iconName, 15) : null, label);

const confirmAction = (text) => window.confirm(text);

// ---- Appearance ----

const themeSwatch = (theme, mode, onPick) => {
    const colors = palette(theme, mode);
    const swatch = h("button", { type: "button", class: "swatch", "data-theme": theme.id, title: theme.name },
        h("span", { class: "swatch__preview", style: { background: colors.bg, borderColor: colors.surface } },
            h("span", { class: "swatch__bar", style: { background: colors.surface } }),
            h("span", { class: "swatch__dot", style: { background: colors.accent } }),
            h("span", { class: "swatch__line", style: { background: colors.text } })),
        h("span", { class: "swatch__name" }, theme.name));
    swatch.addEventListener("click", () => onPick(theme));
    return swatch;
};

const themeEditor = (existing, done) => {
    const { colors } = appearance.current();
    const draft = existing ? { ...existing } : { id: `custom-${Date.now().toString(36)}`, name: "My theme", custom: true, bg: colors.bg, surface: colors.surface, text: colors.text, accent: colors.accent };
    const preview = h("div", { class: "theme-preview" });
    const paint = () => {
        const p = palette(draft, "dark");
        preview.style.cssText = `background:${draft.bg};color:${draft.text};border-color:${draft.surface}`;
        preview.replaceChildren(
            h("div", { class: "theme-preview__panel", style: { background: draft.surface } }, h("strong", {}, draft.name || "My theme"), h("span", { style: { opacity: 0.7 } }, "Preview text on a panel")),
            h("span", { class: "theme-preview__button", style: { background: draft.accent, color: p.accentText } }, "Accent button"));
    };
    const colorInput = (key, label) => {
        const input = h("input", { type: "color", value: draft[key] });
        input.addEventListener("input", () => {
            draft[key] = input.value;
            paint();
        });
        return h("label", { class: "color-field" }, input, h("span", {}, label));
    };
    const name = h("input", { class: "set-input", value: draft.name, maxlength: "30", placeholder: "Theme name" });
    name.addEventListener("input", () => {
        draft.name = name.value;
        paint();
    });
    paint();
    const save = () => {
        const list = settings.get("customThemes").filter(t => t.id !== draft.id);
        list.unshift({ ...draft, name: draft.name.trim() || "My theme" });
        settings.set({ customThemes: list, theme: draft.id });
        done();
    };
    return h("div", { class: "theme-editor" },
        h("div", { class: "theme-editor__fields" },
            h("label", { class: "set-row__label" }, "Name"), name,
            h("div", { class: "color-grid" }, colorInput("bg", "Background"), colorInput("surface", "Panels"), colorInput("text", "Text"), colorInput("accent", "Accent"))),
        preview,
        h("div", { class: "set-actions" },
            button(existing ? "Save changes" : "Save theme", save, { kind: "primary", iconName: "check" }),
            button("Cancel", done)));
};

const themesSection = () => {
    const grid = h("div", { class: "swatches" });
    const filter = h("input", { class: "set-input", type: "search", placeholder: `Search ${themes.length} themes`, "aria-label": "Search themes" });
    const editorSlot = h("div");
    const customRow = h("div", { class: "custom-themes" });
    const render = () => {
        const mode = resolveMode(settings.get("mode"));
        const needle = filter.value.trim().toLowerCase();
        const custom = settings.get("customThemes");
        const pick = (theme) => settings.set({ theme: theme.id });
        grid.replaceChildren(...[...custom, ...themes]
            .filter(theme => theme.name.toLowerCase().includes(needle))
            .map(theme => themeSwatch(theme, mode, pick)));
        for (const el of grid.querySelectorAll(".swatch"))
            el.setAttribute("aria-pressed", String(el.dataset.theme === settings.get("theme")));
        customRow.replaceChildren(...custom.map(theme => h("div", { class: "custom-theme" },
            h("span", { class: "custom-theme__dot", style: { background: theme.accent } }),
            h("span", {}, theme.name),
            h("button", { type: "button", class: "link-button", onclick: () => openEditor(theme) }, "Edit"),
            h("button", { type: "button", class: "link-button danger", onclick: () => {
                    const rest = settings.get("customThemes").filter(t => t.id !== theme.id);
                    settings.set({ customThemes: rest, ...(settings.get("theme") === theme.id ? { theme: "mono" } : {}) });
                } }, "Delete"))));
    };
    const openEditor = (theme) => editorSlot.replaceChildren(themeEditor(theme, () => editorSlot.replaceChildren()));
    filter.addEventListener("input", render);
    watch(["theme", "mode", "customThemes"], render);
    render();
    return section("Theme", `${themes.length} built-in themes, each with a dark and a light version. Pick one, or make your own.`,
        row("Mode", "Light, dark, or follow your device.", segmented("mode", [
            { value: "dark", label: "Dark", icon: "moon" },
            { value: "light", label: "Light", icon: "sun" },
            { value: "system", label: "System", icon: "contrast" }
        ])),
        h("div", { class: "set-actions" }, button("Create custom theme", () => openEditor(null), { kind: "primary", iconName: "plus" })),
        editorSlot,
        customRow,
        filter,
        grid);
};

const glassSection = () => {
    const tint = h("input", { type: "color", class: "color-swatch", "aria-label": "Tint colour" });
    const useTheme = h("input", { type: "checkbox", class: "switch", role: "switch" });
    const syncTint = () => {
        useTheme.checked = !settings.get("glassTint");
        tint.value = settings.get("glassTint") || appearance.current().colors.surface;
        tint.disabled = useTheme.checked;
    };
    tint.addEventListener("input", () => apply({ glassTint: tint.value }));
    useTheme.addEventListener("change", () => {
        apply({ glassTint: useTheme.checked ? "" : tint.value });
        syncTint();
    });
    syncTint();
    const controls = h("div", { class: "set-sub" },
        row("Blur", "Scroll over a slider to fine-tune it.", slider("glassBlur", 0, 40, 1, "px")),
        row("Tint strength", "Lower is more see-through.", slider("glassOpacity", 0, 100, 1, "%")),
        row("Use theme colour", null, useTheme),
        row("Tint colour", null, tint));
    const show = () => (controls.hidden = !settings.get("glass"));
    show();
    return section("Glass mode", "Frosted, see-through panels. Looks best with a background image.",
        row("Glass mode", null, toggle("glass", show)),
        controls);
};

const backgroundSection = () => {
    const status = h("p", { class: "set-error", hidden: true });
    const preview = h("div", { class: "bg-preview" });
    const paintPreview = () => {
        const src = settings.get("background") === "upload" ? appearance.uploadedBackground()
            : settings.get("background") === "url" && settings.get("backgroundUrl") ? `/api/image?url=${encodeURIComponent(settings.get("backgroundUrl"))}` : "";
        preview.style.backgroundImage = src ? `url("${src}")` : "";
        preview.hidden = !src;
    };
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    file.addEventListener("change", async () => {
        const chosen = file.files?.[0];
        file.value = "";
        if (!chosen)
            return;
        message(status, "Processing…", "info");
        try {
            const data = await appearance.prepareUpload(chosen);
            if (!appearance.setUploadedBackground(data))
                throw new Error("Browser storage is full or blocked, so the image could not be saved.");
            settings.set({ background: "upload" });
            message(status, "");
            appearance.apply();
            paintPreview();
            showMode();
        }
        catch (error) {
            message(status, error.message);
        }
    });
    const urlInput = h("input", { class: "set-input", type: "url", placeholder: "https://example.com/wallpaper.jpg" });
    urlInput.value = settings.get("backgroundUrl");
    const applyUrl = () => {
        const url = urlInput.value.trim();
        if (!url)
            return;
        message(status, "Checking the image…", "info");
        const probe = new Image();
        probe.onload = () => {
            apply({ background: "url", backgroundUrl: url }, status);
            paintPreview();
            showMode();
        };
        probe.onerror = () => message(status, "That link did not load as an image. Use a direct link to a .jpg, .png, .gif or .webp file.");
        probe.src = `/api/image?url=${encodeURIComponent(url)}`;
    };
    urlInput.addEventListener("keydown", event => {
        if (event.key === "Enter")
            applyUrl();
    });
    const uploadRow = row("Upload an image", "Large pictures are resized to fit.", h("div", { class: "set-inline" }, button("Choose image", () => file.click(), { iconName: "upload" }), file));
    const urlRow = row("Image link", "Paste a direct link to an image.", h("div", { class: "set-inline" }, urlInput, button("Use link", applyUrl, { iconName: "link" })));
    const extras = h("div", { class: "set-sub" },
        row("Fit", null, select("backgroundFit", [{ value: "cover", label: "Fill the screen" }, { value: "contain", label: "Fit inside" }, { value: "tile", label: "Tile" }])),
        row("Fade", "Blends the image into your theme so text stays readable.", slider("backgroundDim", 0, 90, 1, "%")));
    const showMode = () => {
        const mode = settings.get("background");
        uploadRow.hidden = mode !== "upload";
        urlRow.hidden = mode !== "url";
        extras.hidden = mode === "none";
        paintPreview();
    };
    showMode();
    return section("Background", "Upload a picture or use a link to one.",
        row("Background", null, segmented("background", [
            { value: "none", label: "None" },
            { value: "upload", label: "Upload", icon: "upload" },
            { value: "url", label: "Link", icon: "link" }
        ], value => {
            if (value === "none")
                appearance.clearUploadedBackground();
            showMode();
        })),
        uploadRow, urlRow, preview, extras, status);
};

const fontSection = () => {
    const filter = h("input", { class: "set-input", type: "search", placeholder: `Search ${fonts.length} Google Fonts`, "aria-label": "Search fonts" });
    const list = h("div", { class: "font-list", role: "listbox" });
    const preview = h("div", { class: "font-preview" });
    const loaded = new Set();
    // Load a font only once its name scrolls into view, so the list can show each
    // name in its own typeface without fetching 120 fonts up front.
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting)
                continue;
            const name = entry.target.dataset.font;
            observer.unobserve(entry.target);
            if (loaded.has(name))
                continue;
            loaded.add(name);
            document.head.append(h("link", { rel: "stylesheet", crossorigin: "anonymous", href: fontHref(name) }));
        }
    }, { root: list });
    cleanups.add(() => observer.disconnect());
    const render = () => {
        const needle = filter.value.trim().toLowerCase();
        const current = settings.get("font");
        list.replaceChildren(...fonts.filter(name => name.toLowerCase().includes(needle)).map(name => {
            const item = h("button", { type: "button", role: "option", class: "font-item", "data-font": name, "aria-selected": String(name === current), style: { fontFamily: `"${name}", var(--font)` } },
                name, name === "Lexend" ? h("span", { class: "font-item__tag" }, "default") : null);
            item.addEventListener("click", () => {
                settings.set({ font: name });
                render();
            });
            observer.observe(item);
            return item;
        }));
        preview.textContent = `${current}: The quick brown fox jumps over the lazy dog. 0123456789`;
    };
    filter.addEventListener("input", render);
    render();
    return section("Font", "Lexend Regular is the default.", preview, filter, list,
        h("div", { class: "set-actions" }, button("Reset to Lexend", () => {
            settings.set({ font: "Lexend" });
            render();
        })));
};

const appearancePanel = () => [themesSection(), glassSection(), backgroundSection(), fontSection()];

// ---- Preferences ----

const transportOptions = [
    { value: "libcurl", label: "libcurl (best compatibility)" },
    { value: "epoxy", label: "epoxy (lighter)" },
    { value: "bare", label: "bare (for serverless hosts)" }
];

const searchSection = () => {
    const engines = settings.searchEngines;
    const known = engines.some(e => e.template === settings.get("searchEngine"));
    const error = h("p", { class: "set-error", hidden: true });
    const customInput = h("input", { class: "set-input", placeholder: "https://example.com/search?q=%s", value: known ? "" : settings.get("searchEngine") });
    const customRow = row("Custom search URL", "Put %s where the search words go.", h("div", { class: "set-field" }, customInput, error));
    const picker = h("select", { class: "set-select" },
        engines.map(e => h("option", { value: e.template }, e.label)),
        h("option", { value: "custom" }, "Custom…"));
    picker.value = known ? settings.get("searchEngine") : "custom";
    customRow.hidden = known;
    picker.addEventListener("change", () => {
        customRow.hidden = picker.value !== "custom";
        if (picker.value !== "custom")
            apply({ searchEngine: picker.value });
        else
            customInput.focus();
    });
    customInput.addEventListener("change", () => apply({ searchEngine: customInput.value }, error));
    return section("Search", null,
        row("Search engine", "Used when what you type is not a web address.", picker),
        customRow,
        row("Home page", "Opened in new tabs. Leave blank for Lunara's home.", textField("homeUrl", { type: "url", placeholder: "lunara://home" })),
        row("Save history", null, toggle("saveHistory")));
};

const gamesSection = () => section("Games", null,
    row("Proxy games", "On: games load through this Lunara server, so your network only sees Lunara. Off: games load straight from jsDelivr, which is faster but easier to block and a few games will not start.", toggle("proxyGames")));

const networkSection = () => section("Proxy network", "How proxied pages leave your browser.",
    row("Transport", "Switches immediately.", select("transport", transportOptions)),
    row("Wisp server", "Leave blank to use this site's own server. Must start with wss://.", textField("wispUrl", { placeholder: "wss://example.com/wisp/" })));

const providerPresets = [
    { label: "Groq", base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-20b" },
    { label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openai/gpt-oss-20b:free" },
    { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    { label: "Mistral", base: "https://api.mistral.ai/v1", model: "mistral-small-latest" }
];

const aiProviderSection = () => {
    const status = h("p", { class: "set-error", hidden: true });
    const base = textField("aiProviderBase", { type: "url", placeholder: "https://api.example.com/v1" });
    const key = textField("aiProviderKey", { type: "password", placeholder: "sk-…" });
    const model = textField("aiProviderModel", { placeholder: "model-name" });
    const refill = () => {
        base.querySelector("input").value = settings.get("aiProviderBase");
        model.querySelector("input").value = settings.get("aiProviderModel");
    };
    const test = async () => {
        message(status, "Testing…", "info");
        try {
            const response = await fetch(`${settings.get("aiProviderBase").replace(/\/+$/, "")}/models`, {
                headers: { authorization: `Bearer ${settings.get("aiProviderKey")}` }
            });
            if (!response.ok)
                throw new Error(`The provider answered HTTP ${response.status}. Check the URL and key.`);
            const data = await response.json().catch(() => ({}));
            message(status, `Connected. ${Array.isArray(data.data) ? `${data.data.length} models available.` : ""}`, "ok");
        }
        catch (error) {
            message(status, error.message.startsWith("The provider") ? error.message : "Could not reach that provider from the browser (wrong URL, or it blocks browser requests).");
        }
    };
    const details = h("div", { class: "set-sub" },
        h("div", { class: "chips-row" }, providerPresets.map(p => button(p.label, () => {
            settings.set({ aiProviderBase: p.base, aiProviderModel: p.model });
            refill();
        }))),
        row("API base URL", "Any OpenAI-compatible endpoint.", base),
        row("API key", "Stays in this browser. Never sent to Lunara or synced.", key),
        row("Model", null, model),
        h("div", { class: "set-actions" }, button("Test connection", test, { iconName: "sync" })),
        status);
    const show = () => (details.hidden = !settings.get("aiProviderEnabled"));
    show();
    return section("Your own AI provider", "Use your own key in lunara://ai. Requests go straight from your browser to the provider, and Lunara's daily limits do not apply.",
        row("Use my own provider", null, toggle("aiProviderEnabled", show)),
        details);
};

const preferencesPanel = () => [searchSection(), gamesSection(), networkSection(), aiProviderSection()];

// ---- Cloaking ----

const cloakLaunch = (mode) => {
    const preset = settings.cloakPresets.find(p => p.id === settings.get("cloakPreset"));
    const title = preset && preset.id !== "custom" ? preset.title : settings.get("cloakTitle") || "Google";
    const favicon = preset && preset.id !== "custom" ? preset.favicon : settings.get("cloakFavicon");
    const src = location.href;
    const fill = (doc) => {
        doc.title = title;
        if (favicon)
            doc.head.append(Object.assign(doc.createElement("link"), { rel: "icon", href: favicon }));
        const style = doc.createElement("style");
        style.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{width:100%;height:100%;border:0;display:block}";
        doc.head.append(style);
        const frame = doc.createElement("iframe");
        frame.src = src;
        frame.allow = "autoplay; fullscreen; clipboard-read; clipboard-write; gamepad";
        doc.body.append(frame);
    };
    if (mode === "blank") {
        const tab = window.open("about:blank", "_blank");
        if (tab)
            fill(tab.document);
        else
            deps.toast("Your browser blocked the pop-up. Allow pop-ups for this site and try again.");
        return;
    }
    const doc = document.implementation.createHTMLDocument(title);
    fill(doc);
    const url = URL.createObjectURL(new Blob(["<!doctype html>" + doc.documentElement.outerHTML], { type: "text/html" }));
    if (!window.open(url, "_blank")) {
        URL.revokeObjectURL(url);
        deps.toast("Your browser blocked the pop-up. Allow pop-ups for this site and try again.");
    }
};

const favicon = (preset) => preset.favicon
    ? h("img", { src: preset.favicon, alt: "", width: "20", height: "20", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.replaceWith(h("span", { class: "cloak__mono" }, preset.label[0])) })
    : h("span", { class: "cloak__mono" }, preset.id === "custom" ? "✎" : "");

const cloakingPanel = () => {
    const grid = h("div", { class: "cloaks" });
    const customFields = h("div", { class: "set-sub" },
        row("Tab title", null, textField("cloakTitle", { placeholder: "My Drive - Google Drive" })),
        row("Tab icon URL", null, textField("cloakFavicon", { type: "url", placeholder: "https://example.com/favicon.ico" })));
    const render = () => {
        const current = settings.get("cloakPreset");
        grid.replaceChildren(...settings.cloakPresets.map(preset => {
            const item = h("button", { type: "button", class: "cloak", "aria-pressed": String(preset.id === current) }, favicon(preset), h("span", {}, preset.label));
            item.addEventListener("click", () => {
                settings.set({ cloakPreset: preset.id });
                render();
            });
            return item;
        }));
        customFields.hidden = current !== "custom";
    };
    render();
    const panicButton = h("button", { type: "button", class: "set-button key-capture" });
    const paintPanic = () => (panicButton.textContent = settings.get("panicKey") ? `Key: ${settings.get("panicKey") === " " ? "Space" : settings.get("panicKey")}` : "Set a key");
    paintPanic();
    panicButton.addEventListener("click", () => {
        panicButton.textContent = "Press any key…";
        const capture = (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeEventListener("keydown", capture, true);
            settings.set({ panicKey: event.key === "Escape" ? "" : event.key });
            paintPanic();
        };
        addEventListener("keydown", capture, true);
    });
    const focusPresets = settings.cloakPresets.filter(p => p.id !== "custom").map(p => ({ value: p.id, label: p.label }));
    return [
        section("Tab cloak", `${settings.cloakPresets.length - 1} presets. Changes this tab's title and icon so it looks like another site.`,
            grid, customFields),
        section("Focus cloaking", "Disguises the tab only while you are looking at something else, and switches back when you return.",
            row("Focus cloaking", null, toggle("focusCloak")),
            row("Disguise as", null, select("focusCloakPreset", focusPresets))),
        section("Open cloaked", "Opens Lunara inside a blank page, so it does not appear in your browser history.",
            h("div", { class: "set-actions" },
                button("Open in about:blank", () => cloakLaunch("blank"), { iconName: "external" }),
                button("Open as blob", () => cloakLaunch("blob"), { iconName: "external" }))),
        section("Panic key", "One key press replaces Lunara with a safe site. Press Escape while setting to clear it.",
            row("Panic key", null, panicButton),
            row("Go to", null, textField("panicUrl", { type: "url", placeholder: "https://classroom.google.com" })))
    ];
};

// ---- Data ----

const cloudSyncSection = (rerender) => {
    if (!account.signedIn()) {
        let mode = "signin";
        const status = h("p", { class: "set-error", hidden: true });
        const user = h("input", { class: "set-input", placeholder: "username", autocomplete: "username", maxlength: "20", spellcheck: "false" });
        const pass = h("input", { class: "set-input", type: "password", placeholder: "passcode", autocomplete: "current-password", maxlength: "64" });
        const submit = h("button", { type: "submit", class: "set-button primary" });
        const switcher = h("button", { type: "button", class: "link-button" });
        const paint = () => {
            submit.textContent = mode === "signin" ? "Sign in" : "Create account";
            switcher.textContent = mode === "signin" ? "New here? Create an account" : "Have an account? Sign in";
            pass.autocomplete = mode === "signin" ? "current-password" : "new-password";
        };
        switcher.addEventListener("click", () => {
            mode = mode === "signin" ? "signup" : "signin";
            paint();
        });
        paint();
        const form = h("form", { class: "sync-form" }, user, pass, submit, switcher, status);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            submit.disabled = true;
            message(status, mode === "signin" ? "Signing in…" : "Creating your account…", "info");
            try {
                if (mode === "signin")
                    await account.signIn(user.value, pass.value);
                else
                    await account.signUp(user.value, pass.value);
                deps.toast(`Signed in as ${account.getProfile().username}.`);
                rerender();
            }
            catch (error) {
                message(status, error.message);
            }
            finally {
                submit.disabled = false;
            }
        });
        return section("Lunara CloudSync", "A username and a passcode, no email. Syncs your settings across devices and keeps your coins and purchases safe. There is no way to recover a forgotten passcode, so write it down.",
            h("div", { class: "lock-banner" }, svg("lock", 16), "Sign in to unlock account data downloads and sync."),
            form);
    }
    const status = h("p", { class: "set-error", hidden: true });
    const last = () => account.lastSync() ? new Date(account.lastSync()).toLocaleString() : "never";
    const lastEl = h("span", {}, last());
    return section("Lunara CloudSync", null,
        h("div", { class: "account-card" },
            h("span", { class: "account-card__avatar" }, svg("user", 20)),
            h("div", {},
                h("div", { class: "set-row__label" }, `Signed in as ${account.getProfile().username}`),
                h("div", { class: "set-row__help" }, "Settings sync automatically. Last synced: ", lastEl))),
        h("div", { class: "set-actions" },
            button("Sync now", async () => {
                try {
                    await account.pushSettings();
                    lastEl.textContent = last();
                    message(status, "Synced.", "ok");
                }
                catch (error) {
                    message(status, error.message);
                }
            }, { iconName: "sync" }),
            button("Load from cloud", async () => {
                try {
                    await account.pullSettings();
                    message(status, "Loaded your saved settings.", "ok");
                }
                catch (error) {
                    message(status, error.message);
                }
            }, { iconName: "download" }),
            button("Sign out", async () => {
                await account.signOut();
                rerender();
            })),
        status);
};

const downloadJson = (data, name) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = h("a", { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const dataPanel = () => {
    const container = h("div");
    const render = () => {
        const locked = !account.signedIn();
        const status = h("p", { class: "set-error", hidden: true });
        const del = h("div", { class: "set-sub", hidden: true });
        if (!locked) {
            const pass = h("input", { class: "set-input", type: "password", placeholder: "Your passcode to confirm" });
            del.append(row("Delete account", "Deletes your account, coins and purchases from the server. This cannot be undone.", h("div", { class: "set-inline" }, pass, button("Delete forever", async () => {
                if (!confirmAction("Delete your Lunara account for good?"))
                    return;
                try {
                    await account.deleteAccount(pass.value);
                    deps.toast("Account deleted.");
                    render();
                }
                catch (error) {
                    message(status, error.message);
                }
            }, { kind: "danger" }))));
        }
        container.replaceChildren(
            cloudSyncSection(render),
            section("Account data", null,
                row("Download account data", locked ? "Sign in to CloudSync to unlock." : "Your account, coins, purchases, settings, bookmarks and history as a JSON file.",
                    button(locked ? "Locked" : "Download JSON", async () => {
                        try {
                            downloadJson(await account.exportData(), `lunara-${account.getProfile().username}-${new Date().toISOString().slice(0, 10)}.json`);
                        }
                        catch (error) {
                            message(status, error.message);
                        }
                    }, { iconName: locked ? "lock" : "download" })),
                !locked ? h("div", { class: "set-actions" }, button("Delete account…", () => (del.hidden = !del.hidden), { kind: "danger", iconName: "trash" })) : null,
                del),
            section("Browsing data", null,
                row("Clear history", "Removes the pages listed in lunara://history.", button("Clear history", () => {
                    if (confirmAction("Clear your browsing history?"))
                        deps.clearHistory();
                })),
                row("Clear browsing data and cookies", "Signs you out of every site you used through the proxy and clears their saved data. Lunara settings, bookmarks and your account stay.", button("Clear data", () => {
                    if (confirmAction("Clear all browsing data and cookies? The page will reload."))
                        void deps.clearBrowsingData();
                }, { kind: "danger" })),
                row("Reset all settings", "Puts every setting back to its default, including themes and backgrounds.", button("Reset settings", () => {
                    if (confirmAction("Reset every setting to its default?")) {
                        deps.resetSettings();
                        open("data");
                    }
                }, { kind: "danger" }))),
            status);
    };
    render();
    return [container];
};

// ---- Legal ----

const legalPanel = () => {
    const doc = (title, ...paragraphs) => h("details", { class: "legal" }, h("summary", {}, title), ...paragraphs.map(p => h("p", {}, p)));
    return [
        h("div", { class: "legal-list" },
            doc("DMCA", "Lunara does not host any of the games, music, videos or websites you can reach through it. All content is provided by third parties: games come from the gmshelf repositories, movies and shows from Helio, music from SoundCloud, and every other site is loaded live from its own servers.", "If you believe content infringes your copyright, please contact the third party that hosts it, not us. They are the only ones who can remove it. Removing a link from Lunara would not take the content down."),
            doc("Privacy Policy", "Lunara stores your settings, bookmarks and history in your own browser. They are not sent to us unless you turn on CloudSync.", "With CloudSync we store your username, a salted hash of your passcode (never the passcode itself), your synced settings, your coin balance and your purchases. No email address, name or other personal data is collected.", "To keep things fair the server keeps short-lived counters per device and per network address (for example how many AI credits were used today). Chat messages are held in memory only and disappear when the server restarts.", "Sites you visit through the proxy are fetched by your browser through this server's tunnel. We do not log the pages you visit. Your own AI provider key never leaves your browser.", "You can download or delete your account data at any time in Settings > Data."),
            doc("Terms of Service", "Use Lunara lawfully and follow the rules of the network you are on. You are responsible for what you do with it.", "Do not abuse shared resources: no scripting searches to farm coins, no automating the AI or chat, and no spam or harassment in chat. Abuse can get an account or device limited without notice.", "Lunara coins and items have no cash value and cannot be bought, sold or refunded. They may be reset if abuse is found.", "Lunara is provided as is, without warranty. Third-party sites, games and music are not ours and come with their own terms."))
    ];
};

// ---- About ----

const credits = [
    ["yaans-coat", "owner"],
    ["beery-tomato", "co-owner"],
    ["Scramjet", "proxy engine"],
    ["Groq", "AI provider"],
    ["gmshelf", "games"],
    ["x8rr", "useful API and open source tools creator"],
    ["bog", "goated developer"],
    ["claude code", "perfect. just perfect."]
];

const ddmmyyyy = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "unknown";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const aboutPanel = () => {
    const facts = h("dl", { class: "facts" });
    const fact = (k, v) => [h("dt", {}, k), h("dd", {}, v)];
    const fill = (build) => facts.replaceChildren(
        ...fact("Version", build?.version ?? "…"),
        ...fact("Build", build?.build ?? "…"),
        ...fact("Built", build ? ddmmyyyy(build.built) : "…"),
        ...fact("Engine", "Scramjet"),
        ...fact("Transport", deps.engine?.getTransport?.().kind ?? "libcurl"),
        ...fact("Cross-origin isolated", crossOriginIsolated ? "yes" : "no"));
    fill(null);
    fetch("/api/build").then(r => r.json()).then(fill, () => fill({ version: "unknown", build: "unknown", built: "" }));
    return [
        h("div", { class: "about-hero" }, h("span", { class: "about-hero__logo", html: icon("moon", 34) }), h("div", {}, h("h3", {}, "lunara"), h("p", { class: "set-row__help" }, "A fast, private web proxy."))),
        section("Build", null, facts),
        section("Credits", null, h("ul", { class: "credits" }, credits.map(([name, role]) => h("li", {}, h("strong", {}, name), h("span", {}, role)))))
    ];
};

// ---- Changelog ----

const changelogPanel = () => {
    const list = (label, kind, entries) => entries.length ? h("div", { class: `changes changes--${kind}` },
        h("h4", {}, label),
        h("ul", {}, entries.map(text => h("li", {}, text)))) : null;
    return builds.map((b, i) => h("details", { class: "set-section build", open: i === 0 },
        h("summary", {},
            h("span", { class: "build__number" }, `#${b.number}`),
            h("strong", {}, b.name),
            h("span", { class: "build__meta" }, `v${b.version} \u00b7 ${b.date ? ddmmyyyy(`${b.date}T00:00`).slice(0, 10) : "date unknown"}`)),
        list("Added", "added", b.added),
        list("Removed", "removed", b.removed),
        list("Fixed", "fixed", b.fixed)));
};

const panels = { appearance: appearancePanel, preferences: preferencesPanel, cloaking: cloakingPanel, data: dataPanel, legal: legalPanel, changelog: changelogPanel, about: aboutPanel };

// ---- modal shell ----

const watchers = new Set();
// Re-render part of a panel only when one of the settings it shows actually changed.
const snapshot = (keys) => JSON.stringify(keys.map(key => settings.get(key)));
const watch = (keys, fn) => watchers.add({ keys, fn, last: snapshot(keys) });
settings.onChange(() => {
    for (const watcher of watchers) {
        const now = snapshot(watcher.keys);
        if (now !== watcher.last) {
            watcher.last = now;
            watcher.fn();
        }
    }
});

const showTab = (id) => {
    activeTab = panels[id] ? id : "appearance";
    for (const fn of cleanups)
        fn();
    cleanups.clear();
    watchers.clear();
    const tab = tabs.find(t => t.id === activeTab);
    root.querySelector(".modal__title").textContent = tab.label;
    for (const item of root.querySelectorAll(".modal__tab"))
        item.setAttribute("aria-selected", String(item.dataset.tab === activeTab));
    const content = root.querySelector(".modal__content");
    content.replaceChildren(...panels[activeTab]());
    content.scrollTop = 0;
};

const build = () => {
    root = h("div", { class: "modal", hidden: true },
        h("div", { class: "modal__backdrop", onclick: () => close() }),
        h("div", { class: "modal__dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "settings-heading" },
            h("nav", { class: "modal__nav", "aria-label": "Settings sections" },
                h("h2", { id: "settings-heading", class: "modal__heading" }, "Settings"),
                h("div", { role: "tablist", "aria-orientation": "vertical" }, tabs.map(tab => h("button", {
                    type: "button", role: "tab", class: "modal__tab", "data-tab": tab.id,
                    onclick: () => showTab(tab.id)
                }, h("span", { class: "modal__tile", style: { background: tab.tile }, html: icon(tab.icon, 16) }), tab.label)))),
            h("section", { class: "modal__body" },
                h("header", { class: "modal__header" },
                    h("h2", { class: "modal__title" }),
                    h("button", { type: "button", class: "icon-button modal__close", "aria-label": "Close settings", html: icon("close", 16), onclick: () => close() })),
                h("div", { class: "modal__content" }))));
    // On document, not the dialog: focus can fall back to <body> when a control inside
    // the dialog is re-rendered, and Escape must still close it.
    document.addEventListener("keydown", event => {
        if (root.hidden)
            return;
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
        }
        if (event.key === "Tab") {
            const focusable = [...root.querySelectorAll("button, input, select, textarea, a[href], summary")].filter(el => !el.disabled && el.offsetParent !== null);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    document.body.append(root);
};

export const open = (tab = activeTab) => {
    if (!root)
        build();
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add("modal-open");
    showTab(tab);
    root.querySelector(`.modal__tab[data-tab="${activeTab}"]`)?.focus();
};

export const close = () => {
    if (!root || root.hidden)
        return;
    root.hidden = true;
    document.body.classList.remove("modal-open");
    for (const fn of cleanups)
        fn();
    cleanups.clear();
    watchers.clear();
    lastFocus?.focus?.();
};

export const isOpen = () => Boolean(root && !root.hidden);

export const init = (dependencies) => {
    deps = dependencies;
};
