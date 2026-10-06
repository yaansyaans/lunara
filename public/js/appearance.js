// Applies Settings > Appearance: theme colours, light/dark mode, glass, background
// image and font. The shell and every lunara:// page share the same CSS variables, so
// the same stylesheet text is written into each document.
import * as settings from "./settings.js";
import * as storage from "./storage.js";
import { themeById, palette, resolveMode, fontHref, hexToRgb } from "./themes.js";

const uploadKey = "background-image";

export const uploadedBackground = () => storage.read(uploadKey, "");
export const setUploadedBackground = (dataUrl) => storage.write(uploadKey, dataUrl);
export const clearUploadedBackground = () => storage.remove(uploadKey);

const backgroundSource = () => {
    switch (settings.get("background")) {
        case "upload":
            return uploadedBackground() || "";
        case "url": {
            const url = settings.get("backgroundUrl");
            // Relayed through this server: the page is cross-origin isolated, so an image
            // from a host that does not send CORP headers would otherwise be blocked.
            return url ? `/api/image?url=${encodeURIComponent(url)}` : "";
        }
        default:
            return "";
    }
};

const rgba = (hex, alpha) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const current = () => {
    const s = settings.all();
    const mode = resolveMode(s.mode);
    const theme = themeById(s.theme, s.customThemes);
    return { s, mode, theme, colors: palette(theme, mode), background: backgroundSource() };
};

// The CSS text for one document. `shell` adds the background layer, which only the
// top-level page draws; lunara:// pages turn transparent so it shows through them.
export const cssText = ({ shell = false } = {}) => {
    const { s, colors, background } = current();
    const tint = s.glassTint || colors.surface;
    const panel = s.glass ? rgba(tint, s.glassOpacity / 100) : "var(--bg-2)";
    const lines = [
        `:root {`,
        `  color-scheme: ${colors.light ? "light" : "dark"};`,
        `  --c-bg: ${colors.bg}; --c-surface: ${colors.surface}; --c-text: ${colors.text};`,
        `  --c-accent: ${colors.accent}; --c-accent-text: ${colors.accentText};`,
        `  --c-shade: ${colors.light ? "#000000" : "#ffffff"};`,
        `  --panel: ${panel};`,
        `  --panel-blur: ${s.glass ? s.glassBlur : 0}px;`,
        s.glass ? `  --glass: ${panel}; --dock-blur: ${s.glassBlur}px;` : "",
        `  --font: "${s.font}", "Lexend", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`,
        `}`
    ];
    if (s.glass) {
        lines.push(`.omnibox, .card, .tile, .chip, .coins, .hero__icon, .room, .query__bar, .filter, .player, .modal__dialog, .modal__nav, .wallet, .shop-item, .shop-preview, .game, .track, .ai__bar, .ai__compose, .ai-msg--assistant .ai-msg__body, .play__bar, .games-source select, .status, .tab--active, .set-section {`,
            `  background: var(--panel) !important;`,
            `  backdrop-filter: blur(var(--panel-blur)) saturate(140%); -webkit-backdrop-filter: blur(var(--panel-blur)) saturate(140%);`,
            `}`);
    }
    if (background) {
        lines.push(`.internal-page, .frames, .frame { background: transparent !important; }`);
        if (shell) {
            const fit = s.backgroundFit === "tile" ? "background-repeat: repeat; background-size: auto;" :
                `background-repeat: no-repeat; background-size: ${s.backgroundFit};`;
            lines.push(`#backdrop { display: block; background-image: url("${background.replace(/"/g, "%22")}"); ${fit} }`);
            // Wash the picture towards the theme background (lighter in light themes,
            // darker in dark ones) so text stays readable either way.
            lines.push(`#backdrop::after { background: ${rgba(colors.bg, s.backgroundDim / 100)}; }`);
        }
    }
    return lines.join("\n");
};

const ensure = (doc, id, tag, setup) => {
    let el = doc.getElementById(id);
    if (!el) {
        el = doc.createElement(tag);
        el.id = id;
        setup?.(el);
        doc.head.append(el);
    }
    return el;
};

export const fontLink = (name) => `<link id="lunara-font" rel="stylesheet" crossorigin="anonymous" href="${fontHref(name)}">`;

// Write the theme into a document. Safe to call repeatedly; it only updates.
export const applyTo = (doc, { shell = false } = {}) => {
    if (!doc?.head)
        return;
    ensure(doc, "lunara-theme", "style").textContent = cssText({ shell });
    const font = ensure(doc, "lunara-font", "link", el => {
        el.rel = "stylesheet";
        el.crossOrigin = "anonymous";
    });
    const href = fontHref(settings.get("font"));
    if (font.href !== href)
        font.href = href;
};

// The <head> snippet internal pages are rendered with, so they never flash unthemed.
export const headHtml = () => `${fontLink(settings.get("font"))}<style id="lunara-theme">${cssText()}</style>`;

const listeners = new Set();
export const onApply = (fn) => listeners.add(fn);

export const apply = () => {
    applyTo(document, { shell: true });
    for (const fn of listeners)
        fn();
};

matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (settings.get("mode") === "system")
        apply();
});

// Downscale an uploaded picture so it fits comfortably in browser storage.
export const prepareUpload = (file) => new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
        reject(new Error("That file is not an image."));
        return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.86;
        let data = canvas.toDataURL("image/jpeg", quality);
        while (data.length > 2_500_000 && quality > 0.4) {
            quality -= 0.12;
            data = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(data);
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image."));
    };
    img.src = url;
});
