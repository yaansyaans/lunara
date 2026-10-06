import * as settings from "./settings.js";
const originalTitle = document.title;
const originalIcon = document.querySelector("link[rel~='icon']")?.href ?? "";
const presetById = (id) => settings.cloakPresets.find(p => p.id === id);
const resolve = () => {
    const preset = presetById(settings.get("cloakPreset"));
    return !preset || preset.id === "custom"
        ? {
            title: settings.get("cloakTitle"),
            favicon: settings.get("cloakFavicon")
        }
        : { title: preset.title, favicon: preset.favicon };
};
// New Tab has no icon; a transparent pixel stops the browser showing this site's.
const blankIcon = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const applyTo = (target, title, favicon) => {
    target.title = title || originalTitle;
    const existing = target.querySelector("link[rel~='icon']");
    if (!favicon && !originalIcon) {
        existing?.remove();
        return;
    }
    const link = existing ?? target.createElement("link");
    link.rel = "icon";
    link.href = favicon || originalIcon;
    if (!existing)
        target.head.append(link);
};
const write = ({ title, favicon }) => {
    applyTo(document, title, favicon);
    try {
        if (parent !== window)
            applyTo(parent.document, title, favicon);
    }
    catch { }
};
let focusCloaked = false;
export const applyCloak = () => {
    if (focusCloaked)
        return;
    write(resolve());
};
// Focus cloaking: while you are on another tab or window, this tab wears a different
// title and icon, and changes back the moment you return.
const focusPreset = () => {
    const preset = presetById(settings.get("focusCloakPreset")) ?? presetById("google");
    return { title: preset.title, favicon: preset.favicon || (preset.id === "newtab" ? blankIcon : "") };
};
const hide = () => {
    if (!settings.get("focusCloak") || focusCloaked)
        return;
    focusCloaked = true;
    write(focusPreset());
};
const show = () => {
    if (!focusCloaked)
        return;
    focusCloaked = false;
    applyCloak();
};
document.addEventListener("visibilitychange", () => (document.hidden ? hide() : show()));
// Focus moving into one of our own iframes also blurs the window, so check a moment
// later whether focus really left the page.
addEventListener("blur", () => setTimeout(() => {
    if (!document.hasFocus())
        hide();
}, 150));
addEventListener("focus", show);
// Panic key: one key press swaps the whole page for a safe site.
export const panicHandler = (event) => {
    const key = settings.get("panicKey");
    if (!key || event.repeat || event.key !== key)
        return;
    const target = event.target;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) && key.length === 1)
        return;
    event.preventDefault();
    try {
        window.top.location.replace(settings.get("panicUrl") || "https://classroom.google.com");
    }
    catch {
        location.replace(settings.get("panicUrl") || "https://classroom.google.com");
    }
};
addEventListener("keydown", panicHandler, true);
