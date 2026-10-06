// Themes, fonts and the colour maths behind them. A theme is four colours (background,
// surface, text, accent); styles.css derives every other shade from those with
// color-mix(), so a theme or a custom theme never has to spell out twenty values.
//
// Most themes are generated from an accent and a background hue, which gives each one
// a matching dark and light version. Hand-tuned themes list their palettes directly.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? [...h].map(c => c + c).join("") : h.slice(0, 6);
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r, g, b) => "#" + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

const hsl = (h, s, l) => {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
};

const rgbToHsl = (hex) => {
    let [r, g, b] = hexToRgb(hex).map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
    }
    return [h, s * 100, l * 100];
};

export const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex).map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};

// Accents chosen for a dark background are often too pale on a light one; darken
// until the accent reads against the background.
const readableAccent = (accent, bg) => {
    let [h, s, l] = rgbToHsl(accent);
    let out = accent;
    for (let i = 0; i < 12 && contrast(out, bg) < 3; i++) {
        l += luminance(bg) > 0.4 ? -5 : 5;
        out = hsl(h, s, clamp(l, 5, 95));
    }
    return out;
};

const generated = (hue, sat, accent, mode) => mode === "light"
    ? { bg: hsl(hue, sat * 0.45, 97), surface: hsl(hue, sat * 0.4, 92), text: hsl(hue, 22, 14), accent }
    : { bg: hsl(hue, sat * 0.4, 4), surface: hsl(hue, sat * 0.35, 9), text: hsl(hue, 12, 86), accent };

const gen = (id, name, accent, hue, sat = 30) => ({ id, name, accent, hue, sat });
const fixed = (id, name, dark, light) => ({ id, name, dark, light });

export const themes = [
    fixed("mono", "Mono", { bg: "#000000", surface: "#0c0c0c", text: "#d4d4d4", accent: "#e5e5e5" }, { bg: "#ffffff", surface: "#f1f1f1", text: "#171717", accent: "#171717" }),
    fixed("midnight", "Midnight", { bg: "#05070d", surface: "#0d1220", text: "#cdd6f4", accent: "#8aa9ff" }, null),
    fixed("dracula", "Dracula", { bg: "#1e1f29", surface: "#282a36", text: "#f8f8f2", accent: "#bd93f9" }, { bg: "#fbfbf8", surface: "#efeef3", text: "#282a36", accent: "#7c4dd6" }),
    fixed("nord", "Nord", { bg: "#242933", surface: "#2e3440", text: "#e5e9f0", accent: "#88c0d0" }, { bg: "#eceff4", surface: "#e5e9f0", text: "#2e3440", accent: "#5e81ac" }),
    fixed("catppuccin-mocha", "Catppuccin Mocha", { bg: "#11111b", surface: "#1e1e2e", text: "#cdd6f4", accent: "#cba6f7" }, null),
    fixed("catppuccin-latte", "Catppuccin Latte", null, { bg: "#eff1f5", surface: "#e6e9ef", text: "#4c4f69", accent: "#8839ef" }),
    fixed("gruvbox", "Gruvbox", { bg: "#1d2021", surface: "#282828", text: "#ebdbb2", accent: "#fabd2f" }, { bg: "#fbf1c7", surface: "#f2e5bc", text: "#3c3836", accent: "#b57614" }),
    fixed("tokyo-night", "Tokyo Night", { bg: "#16161e", surface: "#1a1b26", text: "#c0caf5", accent: "#7aa2f7" }, { bg: "#e1e2e7", surface: "#d5d6db", text: "#3760bf", accent: "#2e7de9" }),
    fixed("rose-pine", "Rosé Pine", { bg: "#191724", surface: "#1f1d2e", text: "#e0def4", accent: "#ebbcba" }, { bg: "#faf4ed", surface: "#fffaf3", text: "#575279", accent: "#d7827e" }),
    fixed("solarized", "Solarized", { bg: "#002b36", surface: "#073642", text: "#93a1a1", accent: "#b58900" }, { bg: "#fdf6e3", surface: "#eee8d5", text: "#586e75", accent: "#268bd2" }),
    fixed("one-dark", "One Dark", { bg: "#21252b", surface: "#282c34", text: "#abb2bf", accent: "#61afef" }, { bg: "#fafafa", surface: "#f0f0f0", text: "#383a42", accent: "#4078f2" }),
    fixed("monokai", "Monokai", { bg: "#1e1f1c", surface: "#272822", text: "#f8f8f2", accent: "#a6e22e" }, null),
    fixed("github", "GitHub", { bg: "#0d1117", surface: "#161b22", text: "#c9d1d9", accent: "#58a6ff" }, { bg: "#ffffff", surface: "#f6f8fa", text: "#24292f", accent: "#0969da" }),
    fixed("everforest", "Everforest", { bg: "#232a2e", surface: "#2d353b", text: "#d3c6aa", accent: "#a7c080" }, { bg: "#fdf6e3", surface: "#f4f0d9", text: "#5c6a72", accent: "#8da101" }),
    fixed("kanagawa", "Kanagawa", { bg: "#16161d", surface: "#1f1f28", text: "#dcd7ba", accent: "#7e9cd8" }, { bg: "#f2ecbc", surface: "#e5ddb0", text: "#545464", accent: "#4d699b" }),
    fixed("ayu", "Ayu", { bg: "#0b0e14", surface: "#0f131a", text: "#bfbdb6", accent: "#e6b450" }, { bg: "#fcfcfc", surface: "#f3f4f5", text: "#5c6166", accent: "#fa8d3e" }),
    fixed("synthwave", "Synthwave", { bg: "#1a1028", surface: "#262335", text: "#f0e6ff", accent: "#ff7edb" }, null),
    fixed("matrix", "Matrix", { bg: "#000500", surface: "#031203", text: "#7dff9b", accent: "#00ff41" }, null),
    fixed("paper", "Paper", null, { bg: "#f7f3ea", surface: "#ece6d8", text: "#2b2724", accent: "#9c4a2f" }),
    fixed("high-contrast", "High Contrast", { bg: "#000000", surface: "#111111", text: "#ffffff", accent: "#ffff00" }, { bg: "#ffffff", surface: "#eeeeee", text: "#000000", accent: "#0000cc" }),
    gen("lunar", "Lunar", "#c7d2fe", 230, 35),
    gen("ocean", "Ocean", "#38bdf8", 205, 55),
    gen("deep-sea", "Deep Sea", "#22d3ee", 195, 70),
    gen("forest", "Forest", "#4ade80", 145, 40),
    gen("moss", "Moss", "#a3b18a", 95, 25),
    gen("mint", "Mint", "#6ee7b7", 160, 40),
    gen("emerald", "Emerald", "#10b981", 155, 55),
    gen("lime", "Lime", "#a3e635", 85, 40),
    gen("sunset", "Sunset", "#fb923c", 18, 45),
    gen("amber", "Amber", "#fbbf24", 40, 45),
    gen("honey", "Honey", "#f5c451", 45, 35),
    gen("ember", "Ember", "#f97316", 15, 55),
    gen("crimson", "Crimson", "#ef4444", 355, 50),
    gen("cherry", "Cherry", "#f43f5e", 345, 50),
    gen("blood-moon", "Blood Moon", "#dc2626", 0, 65),
    gen("rose", "Rose", "#fb7185", 350, 40),
    gen("sakura", "Sakura", "#f9a8d4", 330, 40),
    gen("bubblegum", "Bubblegum", "#f472b6", 320, 50),
    gen("magenta", "Magenta", "#e879f9", 295, 50),
    gen("grape", "Grape", "#a855f7", 275, 50),
    gen("lavender", "Lavender", "#c4b5fd", 260, 35),
    gen("amethyst", "Amethyst", "#9b87f5", 255, 45),
    gen("indigo", "Indigo", "#818cf8", 240, 50),
    gen("cobalt", "Cobalt", "#3b82f6", 220, 60),
    gen("sky", "Sky", "#7dd3fc", 200, 40),
    gen("arctic", "Arctic", "#bae6fd", 195, 25),
    gen("glacier", "Glacier", "#99f6e4", 180, 30),
    gen("teal", "Teal", "#2dd4bf", 175, 50),
    gen("aurora", "Aurora", "#5eead4", 165, 45),
    gen("nebula", "Nebula", "#c084fc", 265, 60),
    gen("galaxy", "Galaxy", "#818cf8", 250, 70),
    gen("cosmos", "Cosmos", "#f0abfc", 285, 40),
    gen("coffee", "Coffee", "#c8a27a", 30, 25),
    gen("mocha", "Mocha", "#d6a77a", 25, 30),
    gen("sand", "Sand", "#e7c697", 38, 25),
    gen("desert", "Desert", "#e0a458", 32, 40),
    gen("copper", "Copper", "#e07a4f", 20, 40),
    gen("gold", "Gold", "#eab308", 48, 40),
    gen("slate", "Slate", "#94a3b8", 215, 20),
    gen("steel", "Steel", "#a1a1aa", 240, 6),
    gen("graphite", "Graphite", "#d4d4d8", 0, 0),
    gen("charcoal", "Charcoal", "#f59e0b", 30, 6),
    gen("storm", "Storm", "#60a5fa", 215, 25),
    gen("neon", "Neon", "#22ff88", 150, 80),
    gen("cyberpunk", "Cyberpunk", "#fcee0a", 55, 70),
    gen("vaporwave", "Vaporwave", "#ff71ce", 300, 60),
    gen("toxic", "Toxic", "#84cc16", 90, 60),
    gen("royal", "Royal", "#a78bfa", 265, 55),
    gen("velvet", "Velvet", "#be185d", 335, 50)
];

export const themeById = (id, custom = []) => custom.find(t => t.id === id) ?? themes.find(t => t.id === id) ?? themes[0];

export const systemPrefersLight = () => matchMedia("(prefers-color-scheme: light)").matches;

export const resolveMode = (mode) => (mode === "system" ? (systemPrefersLight() ? "light" : "dark") : mode === "light" ? "light" : "dark");

// The four colours for a theme in a mode. A fixed theme with no palette for the asked
// mode falls back to a generated one in its own hue, so every theme works both ways.
export const palette = (theme, mode) => {
    let base;
    if (theme.custom)
        base = { bg: theme.bg, surface: theme.surface, text: theme.text, accent: theme.accent };
    else if (theme.dark !== undefined || theme.light !== undefined) {
        base = theme[mode];
        if (!base) {
            const other = theme.dark ?? theme.light;
            const [h, s] = rgbToHsl(other.bg);
            base = generated(h, Math.max(s, 25), other.accent, mode);
        }
    }
    else
        base = generated(theme.hue, theme.sat, theme.accent, mode);
    const accent = theme.custom ? base.accent : readableAccent(base.accent, base.bg);
    return {
        ...base,
        accent,
        accentText: contrast(accent, "#000000") >= contrast(accent, "#ffffff") ? "#000000" : "#ffffff",
        light: luminance(base.bg) > 0.4
    };
};

// Over a hundred Google Fonts. Lexend is the default.
export const fonts = [
    "Lexend", "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito", "Raleway", "Ubuntu",
    "Rubik", "Work Sans", "Noto Sans", "Source Sans 3", "PT Sans", "Mulish", "Quicksand", "Karla", "Manrope", "DM Sans",
    "Outfit", "Plus Jakarta Sans", "Figtree", "Sora", "Space Grotesk", "Urbanist", "Lexend Deca", "Red Hat Display", "Barlow", "Heebo",
    "Kanit", "Josefin Sans", "Fira Sans", "Cabin", "Oxygen", "Hind", "Exo 2", "Titillium Web", "Arimo", "Assistant",
    "Archivo", "Overpass", "Asap", "Catamaran", "Varela Round", "Comfortaa", "M PLUS Rounded 1c", "Maven Pro", "Prompt", "Signika",
    "Encode Sans", "Chivo", "Be Vietnam Pro", "Albert Sans", "Onest", "Geologica", "Wix Madefor Text", "Instrument Sans", "Schibsted Grotesk", "Bricolage Grotesque",
    "Playfair Display", "Merriweather", "Lora", "PT Serif", "Libre Baskerville", "EB Garamond", "Crimson Text", "Cormorant Garamond", "Noto Serif", "Source Serif 4",
    "Bitter", "Arvo", "Domine", "Zilla Slab", "Roboto Slab", "Spectral", "DM Serif Display", "Fraunces", "Young Serif", "Instrument Serif",
    "JetBrains Mono", "Fira Code", "Source Code Pro", "IBM Plex Mono", "Roboto Mono", "Space Mono", "Ubuntu Mono", "Inconsolata", "DM Mono", "Red Hat Mono",
    "Bebas Neue", "Oswald", "Anton", "Righteous", "Lobster", "Pacifico", "Caveat", "Dancing Script", "Permanent Marker", "Shadows Into Light",
    "Indie Flower", "Amatic SC", "Press Start 2P", "VT323", "Orbitron", "Audiowide", "Bungee", "Fredoka", "Baloo 2", "Chakra Petch",
    "Silkscreen", "Monoton", "Major Mono Display", "Kalam", "Patrick Hand", "Gloria Hallelujah", "Comic Neue", "Atkinson Hyperlegible", "Lexend Exa", "Lexend Zetta"
];

export const fontHref = (name) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}&display=swap`;
