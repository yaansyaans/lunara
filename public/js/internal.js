import { headHtml } from "./appearance.js";
const pages = new Map();
export class InternalHistory {
    #entries = [];
    #index = -1;
    get canGoBack() {
        return this.#index > 0;
    }
    get canGoForward() {
        return this.#index >= 0 && this.#index < this.#entries.length - 1;
    }
    push(url) {
        if (this.#entries[this.#index] === url)
            return;
        this.#entries.splice(this.#index + 1);
        this.#entries.push(url);
        this.#index = this.#entries.length - 1;
    }
    back() {
        if (!this.canGoBack)
            return null;
        return this.#entries[--this.#index] ?? null;
    }
    forward() {
        if (!this.canGoForward)
            return null;
        return this.#entries[++this.#index] ?? null;
    }
    clear() {
        this.#entries = [];
        this.#index = -1;
    }
}
export const definePage = (name, definition) => {
    pages.set(name, definition);
};
// Pages that are really another site, loaded through the proxy in the same tab.
export const redirectOf = (rawUrl) => pages.get(pageName(rawUrl))?.redirect ?? null;
export const isInternal = (url) => typeof url === "string" &&
    url.slice(0, "lunara:".length).toLowerCase() ===
        "lunara:";
export const listPages = () => [...pages.entries()].map(([name, def]) => ({
    name,
    title: def.title,
    url: `lunara://${name}`
}));
export const homeUrl = `lunara://home`;
export const titleOf = (rawUrl) => {
    const name = pageName(rawUrl);
    return pages.get(name)?.title ?? name ?? rawUrl;
};
export const pageName = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);
        return parsed.hostname || parsed.pathname.replace(/^\/+/, "");
    }
    catch {
        return null;
    }
};
export const render = (rawUrl) => {
    const name = pageName(rawUrl);
    if (!name)
        return null;
    const parsed = new URL(rawUrl);
    const page = pages.get(name);
    return page
        ? wrap(page.title, page.render(parsed.searchParams), page.script)
        : errorDocument(name);
};
const wrap = (title, body, script) => {
    const styles = `<link rel="stylesheet" href="/styles.css">`;
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${styles}
${headHtml()}
</head><body class="internal-page">
${body}
${script ? `<script type="module" src="${escapeHtml(script)}"></script>` : ""}
<script>
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-open]");
    if (link) {
      event.preventDefault();
      open(link.dataset.open);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (button) {
      if (button.dataset.action === "cloak-aboutblank" || button.dataset.action === "cloak-blob") {
        const title = button.dataset.cloakTitle || parent.document.title;
        const favicon = button.dataset.cloakFavicon || "";
        const src = parent.location.href;
        const fill = (doc) => {
          doc.title = title;
          doc.body.replaceChildren();
          if (favicon) {
            const link = doc.createElement("link");
            link.rel = "icon";
            link.href = favicon;
            doc.head.append(link);
          }
          const style = doc.createElement("style");
          style.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{width:100%;height:100%;border:0;display:block}";
          doc.head.append(style);
          const iframe = doc.createElement("iframe");
          iframe.src = src;
          iframe.allow = "autoplay; fullscreen; clipboard-read; clipboard-write";
          doc.body.append(iframe);
        };

        if (button.dataset.action === "cloak-aboutblank") {
          const tab = window.open("about:blank", "_blank");
          if (tab) fill(tab.document);
          else parent.postMessage({ type: "internal:popup-blocked" }, parent.location.origin);
        } else {
          const doc = document.implementation.createHTMLDocument(title);
          fill(doc);
          const url = URL.createObjectURL(new Blob(["<!doctype html>" + doc.documentElement.outerHTML], { type: "text/html" }));
          const tab = window.open(url, "_blank");
          if (!tab) {
            URL.revokeObjectURL(url);
            parent.postMessage({ type: "internal:popup-blocked" }, parent.location.origin);
          }
        }
        return;
      }
      parent.postMessage({ type: "internal:action", action: button.dataset.action }, parent.location.origin);
    }
  });
  const open = (url) => parent.postMessage({ type: "internal:open", url }, parent.location.origin);
  document.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-template]");
    if (chip) {
      for (const other of chip.parentElement.querySelectorAll("[data-template]")) other.setAttribute("aria-pressed", String(other === chip));
      const input = chip.closest("form")?.querySelector("input[name=q]");
      if (input) { input.placeholder = chip.dataset.placeholder || input.placeholder; input.focus(); }
      return;
    }
    const category = event.target.closest("[data-category]");
    if (category) {
      for (const other of document.querySelectorAll("[data-category]")) other.setAttribute("aria-pressed", String(other === category));
      filterCards();
    }
  });
  const filterCards = () => {
    const needle = (document.querySelector("[data-filter]")?.value || "").trim().toLowerCase();
    const category = document.querySelector("[data-category][aria-pressed=true]")?.dataset.category || "all";
    let shown = 0;
    for (const card of document.querySelectorAll("[data-card]")) {
      const match = (category === "all" || card.dataset.cat === category) && card.dataset.keywords.includes(needle);
      card.hidden = !match;
      if (match) shown++;
    }
    const empty = document.querySelector("[data-empty]");
    if (empty) empty.hidden = shown > 0;
  };
  document.querySelector("[data-filter]")?.addEventListener("input", filterCards);
  document.addEventListener("submit", (event) => {
    const query = event.target.closest("[data-query-form]");
    if (!query) return;
    event.preventDefault();
    const text = query.querySelector("input[name=q]").value.trim();
    if (!text) return;
    const template = query.querySelector("[data-template][aria-pressed=true]")?.dataset.template;
    open(template ? template.replace("%s", encodeURIComponent(text)) : text);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-settings-form]");
    if (!form) return;
    event.preventDefault();
    const patch = {};
    for (const element of form.elements) {
      if (!element.name) continue;
      if (element.type === "checkbox") patch[element.name] = element.checked;
      else if (element.type === "radio") { if (element.checked) patch[element.name] = element.value; }
      else patch[element.name] = element.value;
    }
    parent.postMessage({ type: "internal:settings", patch }, parent.location.origin);
  });
  const syncCloakFields = () => {
    const select = document.querySelector("[name=cloakPreset]");
    const custom = select?.value === "custom";
    for (const field of document.querySelectorAll("[data-custom-cloak]")) field.disabled = !custom;
    const option = select?.selectedOptions[0];
    const title = custom ? document.querySelector("[name=cloakTitle]")?.value || "" : option?.dataset.title || "";
    const favicon = custom ? document.querySelector("[name=cloakFavicon]")?.value || "" : option?.dataset.favicon || "";
    for (const button of document.querySelectorAll("[data-action^=cloak-]")) {
      button.dataset.cloakTitle = title;
      button.dataset.cloakFavicon = favicon;
    }
  };
  document.querySelector("[name=cloakPreset]")?.addEventListener("change", syncCloakFields);
  document.querySelector("[data-settings-form]")?.addEventListener("input", syncCloakFields);
  syncCloakFields();
<\/script>
</body></html>`;
};
const errorDocument = (name) => wrap("Page not found", `<main class="internal">
       <h1>No such page</h1>
       <p><code>lunara://${escapeHtml(name)}</code> does not exist.</p>
       <ul>${listPages()
    .map(page => `<li><a href="#" data-open="${page.url}">${escapeHtml(page.url)}</a></li>`)
    .join("")}</ul>
     </main>`);
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
})[c]);
