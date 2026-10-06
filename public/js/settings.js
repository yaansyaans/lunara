import * as storage from "./storage.js";
const text = (max = 200) => (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    return s.length <= max ? s : fallback;
};
const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
const oneOf = (allowed) => (value, fallback) => allowed.includes(value) ? value : fallback;
const httpUrl = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s)
        return "";
    try {
        const url = new URL(s);
        return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
    }
    catch {
        return fallback;
    }
};
const searchTemplate = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s.includes("%s"))
        return fallback;
    try {
        const probe = new URL(s.replaceAll("%s", "test"));
        return ["http:", "https:"].includes(probe.protocol) ? s : fallback;
    }
    catch {
        return fallback;
    }
};
const transportIds = [
    "libcurl",
    "epoxy",
    "bare"
];
const wispUrl = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s)
        return "";
    try {
        const url = new URL(s);
        if (!["ws:", "wss:"].includes(url.protocol))
            return fallback;
        if (url.username || url.password || url.hash || s.includes("?"))
            return fallback;
        if (location.protocol === "https:" && url.protocol !== "wss:")
            return fallback;
        if (!url.pathname.endsWith("/"))
            url.pathname += "/";
        return url.href;
    }
    catch {
        return fallback;
    }
};
const number = (min, max) => (value, fallback) => {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const hexColor = (value, fallback) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback;
const slug = (value, fallback) => typeof value === "string" && /^[a-z0-9-]{1,40}$/.test(value) ? value : fallback;
const fontName = (value, fallback) => typeof value === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(value.trim()) ? value.trim() : fallback;
const imageUrl = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s)
        return "";
    if (s.length > 2000)
        return fallback;
    return httpUrl(s, fallback);
};
const customThemes = (value, fallback) => {
    if (!Array.isArray(value))
        return fallback;
    const out = [];
    for (const theme of value.slice(0, 30)) {
        if (!theme || typeof theme !== "object")
            continue;
        const colors = ["bg", "surface", "text", "accent"].map(key => hexColor(theme[key], null));
        if (colors.includes(null) || typeof theme.id !== "string" || !theme.id.startsWith("custom-"))
            continue;
        out.push({
            id: slug(theme.id, null) ?? `custom-${out.length}`,
            name: text(30)(theme.name, "Custom") || "Custom",
            custom: true,
            bg: colors[0], surface: colors[1], text: colors[2], accent: colors[3]
        });
    }
    return out;
};
const keyName = (value, fallback) => typeof value === "string" && value.length <= 20 ? value : fallback;
export const searchEngines = [
    { id: "duckduckgo", label: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s" },
    { id: "google", label: "Google", template: "https://www.google.com/search?q=%s" },
    { id: "bing", label: "Bing", template: "https://www.bing.com/search?q=%s" },
    { id: "brave", label: "Brave", template: "https://search.brave.com/search?q=%s" },
    { id: "startpage", label: "Startpage", template: "https://www.startpage.com/sp/search?query=%s" },
    { id: "ecosia", label: "Ecosia", template: "https://www.ecosia.org/search?q=%s" },
    { id: "qwant", label: "Qwant", template: "https://www.qwant.com/?q=%s" },
    { id: "yahoo", label: "Yahoo", template: "https://search.yahoo.com/search?p=%s" },
    { id: "mojeek", label: "Mojeek", template: "https://www.mojeek.com/search?q=%s" },
    { id: "yandex", label: "Yandex", template: "https://yandex.com/search/?text=%s" },
    { id: "wikipedia", label: "Wikipedia", template: "https://en.wikipedia.org/w/index.php?search=%s" }
];
// gstatic directly: google.com/s2/favicons redirects there, and the redirect itself
// lacks the CORP header the cross-origin-isolated shell needs to show the image.
const favicon = (domain) => `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;
const cloak = (id, label, title, domain) => ({ id, label, title, favicon: domain ? favicon(domain) : "" });
// Thirty-plus school and education sites. Titles match what the real site shows in its tab.
export const cloakPresets = [
    { id: "custom", label: "Custom", title: "", favicon: "" },
    cloak("newtab", "New Tab", "New Tab", ""),
    cloak("google", "Google", "Google", "google.com"),
    cloak("wikipedia", "Wikipedia", "Wikipedia, the free encyclopedia", "wikipedia.org"),
    cloak("coursera", "Coursera", "Coursera | Degrees, Certificates, & Free Online Courses", "coursera.org"),
    cloak("harvard", "Harvard", "Harvard University", "harvard.edu"),
    cloak("mit", "MIT OpenCourseWare", "MIT OpenCourseWare | Free Online Course Materials", "ocw.mit.edu"),
    cloak("stanford", "Stanford", "Stanford University", "stanford.edu"),
    cloak("yale", "Yale", "Yale University", "yale.edu"),
    cloak("khan", "Khan Academy", "Khan Academy | Free Online Courses, Lessons & Practice", "khanacademy.org"),
    cloak("edx", "edX", "edX | Build new skills. Advance your career.", "edx.org"),
    cloak("classroom", "Google Classroom", "Classes", "classroom.google.com"),
    cloak("drive", "Google Drive", "My Drive - Google Drive", "drive.google.com"),
    cloak("docs", "Google Docs", "Google Docs", "docs.google.com"),
    cloak("slides", "Google Slides", "Google Slides", "slides.google.com"),
    cloak("sheets", "Google Sheets", "Google Sheets", "sheets.google.com"),
    cloak("forms", "Google Forms", "Google Forms", "forms.google.com"),
    cloak("gmail", "Gmail", "Inbox - Gmail", "mail.google.com"),
    cloak("scholar", "Google Scholar", "Google Scholar", "scholar.google.com"),
    cloak("canvas", "Canvas", "Dashboard", "instructure.com"),
    cloak("schoology", "Schoology", "Home | Schoology", "schoology.com"),
    cloak("clever", "Clever", "Clever | Portal", "clever.com"),
    cloak("powerschool", "PowerSchool", "Grades and Attendance", "powerschool.com"),
    cloak("desmos", "Desmos", "Desmos | Graphing Calculator", "desmos.com"),
    cloak("quizlet", "Quizlet", "Your Sets | Quizlet", "quizlet.com"),
    cloak("kahoot", "Kahoot!", "Kahoot!", "kahoot.it"),
    cloak("quizizz", "Quizizz", "Quizizz", "quizizz.com"),
    cloak("ixl", "IXL", "IXL | Math, Language Arts, Science, Social Studies, and Spanish", "ixl.com"),
    cloak("edpuzzle", "Edpuzzle", "Edpuzzle", "edpuzzle.com"),
    cloak("nearpod", "Nearpod", "Nearpod", "nearpod.com"),
    cloak("britannica", "Britannica", "Encyclopedia Britannica | Britannica", "britannica.com"),
    cloak("duolingo", "Duolingo", "Duolingo - The world's best way to learn a language", "duolingo.com"),
    cloak("codecademy", "Codecademy", "Learn to Code - for Free | Codecademy", "codecademy.com"),
    cloak("code-org", "Code.org", "Code.org", "code.org"),
    cloak("scratch", "Scratch", "Scratch - Imagine, Program, Share", "scratch.mit.edu"),
    cloak("commonlit", "CommonLit", "CommonLit", "commonlit.org"),
    cloak("newsela", "Newsela", "Newsela | Instructional Content Platform", "newsela.com"),
    cloak("jstor", "JSTOR", "JSTOR Home", "jstor.org"),
    cloak("outlook", "Outlook", "Mail - Outlook", "outlook.office.com"),
    cloak("teams", "Microsoft Teams", "Microsoft Teams", "teams.microsoft.com"),
    cloak("word", "Microsoft Word", "Microsoft Word", "word.office.com")
];
export const sections = [
    { id: "appearance", label: "Appearance" },
    { id: "preferences", label: "Preferences" },
    { id: "cloaking", label: "Cloaking" }
];
export const schema = {
    theme: { section: "appearance", default: "mono", validate: slug },
    mode: { section: "appearance", default: "dark", validate: oneOf(["dark", "light", "system"]) },
    customThemes: { section: "appearance", default: [], validate: customThemes },
    glass: { section: "appearance", default: false, validate: bool },
    glassBlur: { section: "appearance", default: 18, validate: number(0, 40) },
    // Blank means "the theme's own surface colour".
    glassTint: { section: "appearance", default: "", validate: (value, fallback) => value === "" ? "" : hexColor(value, fallback) },
    glassOpacity: { section: "appearance", default: 55, validate: number(0, 100) },
    background: { section: "appearance", default: "none", validate: oneOf(["none", "upload", "url"]) },
    backgroundUrl: { section: "appearance", default: "", validate: imageUrl },
    backgroundFit: { section: "appearance", default: "cover", validate: oneOf(["cover", "contain", "tile"]) },
    backgroundDim: { section: "appearance", default: 30, validate: number(0, 90) },
    font: { section: "appearance", default: "Lexend", validate: fontName },
    searchEngine: {
        section: "preferences",
        label: "Search engine",
        default: "https://duckduckgo.com/?q=%s",
        validate: searchTemplate,
        help: "Used when what you typed is not a URL. Must contain %s."
    },
    homeUrl: { section: "preferences", label: "Home page", default: "", validate: httpUrl },
    proxyGames: { section: "preferences", default: true, validate: bool },
    transport: { section: "preferences", default: "libcurl", validate: oneOf(transportIds) },
    wispUrl: { section: "preferences", default: "", validate: wispUrl },
    saveHistory: { section: "preferences", default: true, validate: bool },
    aiProviderEnabled: { section: "preferences", default: false, validate: bool },
    aiProviderBase: { section: "preferences", default: "", validate: httpUrl },
    aiProviderKey: { section: "preferences", default: "", validate: text(300) },
    aiProviderModel: { section: "preferences", default: "", validate: text(120) },
    cloakPreset: { section: "cloaking", default: "custom", validate: (value, fallback) => cloakPresets.some(p => p.id === value) ? value : fallback },
    cloakTitle: { section: "cloaking", default: "", validate: text(120) },
    cloakFavicon: { section: "cloaking", default: "", validate: httpUrl },
    focusCloak: { section: "cloaking", default: false, validate: bool },
    focusCloakPreset: { section: "cloaking", default: "google", validate: (value, fallback) => cloakPresets.some(p => p.id === value && p.id !== "custom") ? value : fallback },
    panicKey: { section: "cloaking", default: "", validate: keyName },
    panicUrl: { section: "cloaking", default: "https://classroom.google.com", validate: httpUrl }
};
// Settings that never leave this browser, even with CloudSync on.
export const localOnly = new Set(["aiProviderKey"]);
export const defaults = Object.fromEntries(Object.entries(schema).map(([key, def]) => [key, def.default]));
const storeKey = "settings";
let current = null;
const listeners = new Set();
const validate = (raw) => {
    const out = {};
    const rejected = [];
    for (const [name, entry] of Object.entries(schema)) {
        const def = entry;
        const incoming = raw?.[name];
        if (incoming === undefined) {
            out[name] = def.default;
            continue;
        }
        const invalid = Symbol(name);
        const value = def.validate(incoming, invalid);
        if (value === invalid) {
            rejected.push(name);
            out[name] = def.default;
        }
        else {
            out[name] = value;
        }
    }
    return { settings: out, rejected };
};
export const load = () => {
    if (current)
        return current;
    current = validate(storage.read(storeKey, {})).settings;
    return current;
};
export const get = (name) => load()[name];
export const all = () => ({ ...load() });
export const set = (patch) => {
    const { settings, rejected } = validate({ ...load(), ...patch });
    current = settings;
    const persisted = storage.write(storeKey, settings);
    for (const fn of listeners)
        fn(settings, rejected);
    return { settings, rejected, persisted };
};
export const reset = () => {
    current = { ...defaults };
    const persisted = storage.write(storeKey, current);
    for (const fn of listeners)
        fn(current, []);
    return { settings: current, persisted };
};
export const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
