// lunara://ai. Talks to /api/ai/chat (Groq's free models, metered per person by the
// server) or, if set up in Settings > Preferences, straight to the user's own
// OpenAI-compatible provider. Both stream the same OpenAI-style SSE format.
const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const log = $("[data-log]");
const form = $("[data-form]");
const input = $("[data-input]");
const send = $("[data-send]");
const modelSelect = $("[data-model]");
const quotaEl = $("[data-quota]");
const chatKey = "lunara:ai-chat";
const modelKey = "lunara:ai-model";

const sendIcon = send.innerHTML;
const stopIcon = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`;

let messages = [];
let models = [];
let busy = null;

try {
    messages = JSON.parse(localStorage.getItem(chatKey) ?? "[]").filter(m => m && typeof m.content === "string");
}
catch { }
const persist = () => {
    try {
        localStorage.setItem(chatKey, JSON.stringify(messages.slice(-60)));
    }
    catch { }
};

const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Just enough Markdown for chat answers. Everything is escaped first, so model output
// can never inject markup.
const markdown = (text) => {
    const blocks = [];
    let html = escapeHtml(text).replace(/```([\w+-]*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) => {
        blocks.push(`<pre class="code"><span class="code__lang">${lang || "code"}</span><button type="button" class="code__copy" data-copy>Copy</button><code>${code.replace(/\n$/, "")}</code></pre>`);
        return `\u0000${blocks.length - 1}\u0000`;
    });
    html = html
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(/^#{1,6} (.+)$/gm, "<strong class=\"md-h\">$1</strong>")
        .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
        .replace(/^\s*\d+\. (.+)$/gm, "<li class=\"ol\">$1</li>")
        .replace(/<\/li>\n(?=<li)/g, "</li>")
        .replace(/(<li( class="ol")?>[\s\S]*?<\/li>)(?!<li)/g, "<ul>$1</ul>")
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, "<br>");
    html = `<p>${html}</p>`.replace(/\u0000(\d+)\u0000/g, (_, i) => `</p>${blocks[Number(i)]}<p>`).replace(/<p>(<br>)*<\/p>/g, "");
    return html;
};

const bubble = (message) => {
    const el = document.createElement("div");
    el.className = `ai-msg ai-msg--${message.role}`;
    const body = document.createElement("div");
    body.className = "ai-msg__body";
    if (message.role === "user")
        body.textContent = message.content;
    else
        body.innerHTML = markdown(message.content) || "<span class=\"ai-typing\"><i></i><i></i><i></i></span>";
    el.append(body);
    if (message.error) {
        el.classList.add("ai-msg--error");
        body.textContent = message.content;
    }
    return el;
};

const scrollDown = () => (log.scrollTop = log.scrollHeight);

const renderAll = () => {
    if (!messages.length) {
        log.innerHTML = `<div class="ai-empty"><h2>What can I help with?</h2><p>Pick a model above. Bigger models cost more credits per message.</p>
          <div class="chips">${["Explain photosynthesis simply", "Help me write a story intro", "Quiz me on world capitals", "Fix this JavaScript error"].map(t => `<button type="button" class="chip" data-suggest>${t}</button>`).join("")}</div></div>`;
        return;
    }
    log.replaceChildren(...messages.map(bubble));
    scrollDown();
};

const quotaText = (q) => q ? `${q.freeLeft}/${q.daily} free credits today${q.bonus ? ` · ${q.bonus} bonus` : ""}` : "";
const custom = () => lunara.settings.get("aiProviderEnabled") && lunara.settings.get("aiProviderBase") && lunara.settings.get("aiProviderModel");
const setQuota = (q) => {
    quotaEl.textContent = modelSelect.value === "custom" ? "Your own provider · no Lunara limits" : quotaText(q);
};

const loadModels = async () => {
    let quota = null;
    try {
        const data = await lunara.account.json("/api/ai/models");
        models = data.enabled ? data.models : [];
        quota = data.quota;
    }
    catch { }
    modelSelect.replaceChildren(...models.map(m => new Option(`${m.label} · ${m.cost} credit${m.cost === 1 ? "" : "s"}`, m.id)));
    if (custom())
        modelSelect.append(new Option(`Your provider · ${lunara.settings.get("aiProviderModel")}`, "custom"));
    if (!modelSelect.options.length)
        modelSelect.append(new Option("AI is unavailable", ""));
    const saved = localStorage.getItem(modelKey);
    if ([...modelSelect.options].some(o => o.value === saved))
        modelSelect.value = saved;
    const model = models.find(m => m.id === modelSelect.value);
    modelSelect.title = model?.note ?? "";
    setQuota(quota);
};

modelSelect.addEventListener("change", () => {
    try {
        localStorage.setItem(modelKey, modelSelect.value);
    }
    catch { }
    modelSelect.title = models.find(m => m.id === modelSelect.value)?.note ?? "";
    void loadModels();
});

const request = (history, signal) => {
    if (modelSelect.value === "custom") {
        return fetch(`${lunara.settings.get("aiProviderBase").replace(/\/+$/, "")}/chat/completions`, {
            method: "POST",
            signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${lunara.settings.get("aiProviderKey")}` },
            body: JSON.stringify({ model: lunara.settings.get("aiProviderModel"), stream: true, messages: history })
        });
    }
    return lunara.account.api("/api/ai/chat", {
        method: "POST",
        signal,
        body: JSON.stringify({ model: modelSelect.value, messages: history })
    });
};

const ask = async (text) => {
    if (busy || !text.trim() || !modelSelect.value)
        return;
    messages.push({ role: "user", content: text.trim() });
    const answer = { role: "assistant", content: "" };
    messages.push(answer);
    renderAll();
    const answerEl = log.lastElementChild;
    const body = answerEl.querySelector(".ai-msg__body");
    busy = new parent.AbortController();
    send.innerHTML = stopIcon;
    send.setAttribute("aria-label", "Stop");
    try {
        const history = messages.slice(0, -1).filter(m => !m.error).map(({ role, content }) => ({ role, content }));
        const response = await request(history, busy.signal);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            if (data.quota)
                setQuota(data.quota);
            throw new Error(data.error?.message ?? data.error ?? `The AI answered HTTP ${response.status}.`);
        }
        const quota = response.headers.get("x-lunara-quota");
        if (quota)
            setQuota(JSON.parse(quota));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.startsWith("data:"))
                    continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]")
                    continue;
                try {
                    const chunk = JSON.parse(payload);
                    if (chunk.error)
                        throw new Error(chunk.error.message ?? "The AI stopped with an error.");
                    answer.content += chunk.choices?.[0]?.delta?.content ?? "";
                }
                catch (error) {
                    if (error instanceof SyntaxError)
                        continue;
                    throw error;
                }
            }
            body.innerHTML = markdown(answer.content);
            scrollDown();
        }
        if (!answer.content)
            throw new Error("The model returned an empty answer. Try again or pick another model.");
    }
    catch (error) {
        if (error.name === "AbortError") {
            if (!answer.content)
                messages.pop();
        }
        else {
            answer.content = error.message;
            answer.error = true;
        }
    }
    finally {
        busy = null;
        send.innerHTML = sendIcon;
        send.setAttribute("aria-label", "Send");
        persist();
        renderAll();
    }
};

form.addEventListener("submit", event => {
    event.preventDefault();
    if (busy) {
        busy.abort();
        return;
    }
    const text = input.value;
    input.value = "";
    input.style.height = "";
    void ask(text);
});
input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
    }
});
input.addEventListener("input", () => {
    input.style.height = "";
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
});
log.addEventListener("click", event => {
    const suggestion = event.target.closest("[data-suggest]");
    if (suggestion)
        void ask(suggestion.textContent);
    const copy = event.target.closest("[data-copy]");
    if (copy) {
        void navigator.clipboard?.writeText(copy.parentElement.querySelector("code").textContent).then(() => {
            copy.textContent = "Copied";
            setTimeout(() => (copy.textContent = "Copy"), 1500);
        });
    }
});
$("[data-new]").addEventListener("click", () => {
    busy?.abort();
    messages = [];
    persist();
    renderAll();
    input.focus();
});

renderAll();
await loadModels();
input.focus();
