// lunara://chat: one global room over server-sent events. Posts carry the Lunara token
// so the server can attach the sender's equipped title and text style from the shop.
const lunara = parent.lunara;
const log = document.querySelector("[data-log]");
const online = document.querySelector("[data-online]");
const form = document.querySelector("[data-chat-form]");
const nickKey = "lunara:chat-nick";
const styles = new Set(["glow", "gold", "ice", "fire", "neon", "toxic", "galaxy", "rainbow", "glitch"]);

try {
    form.nick.value = localStorage.getItem(nickKey) || lunara.account.getProfile().username || "";
}
catch { }

const add = (message) => {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const li = document.createElement("li");
    li.className = message.system ? "msg msg--system" : "msg";
    const meta = document.createElement("div");
    meta.className = "msg__meta";
    const name = document.createElement("strong");
    name.textContent = message.nick;
    meta.append(name);
    if (message.title) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = message.title;
        meta.append(badge);
    }
    const time = document.createElement("time");
    time.textContent = new Date(message.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    meta.append(time);
    const text = document.createElement("p");
    text.textContent = message.text;
    if (styles.has(message.style))
        text.className = `fx-${message.style}`;
    li.append(meta, text);
    log.append(li);
    while (log.children.length > 200)
        log.firstChild.remove();
    if (atBottom)
        log.scrollTop = log.scrollHeight;
};

const system = (text) => add({ system: true, nick: "lunara", text, at: Date.now() });

const stream = new EventSource("/api/chat/stream");
addEventListener("pagehide", () => stream.close());
stream.addEventListener("history", (event) => {
    log.replaceChildren();
    const messages = JSON.parse(event.data);
    if (!messages.length)
        system("No messages yet. Say hi.");
    messages.forEach(add);
    log.scrollTop = log.scrollHeight;
});
stream.addEventListener("message", (event) => add(JSON.parse(event.data)));
stream.addEventListener("presence", (event) => {
    online.textContent = `${JSON.parse(event.data).online} online`;
});
stream.addEventListener("error", () => {
    online.textContent = "reconnecting…";
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nick = form.nick.value.trim() || "anon";
    const text = form.text.value.trim();
    if (!text)
        return;
    try {
        localStorage.setItem(nickKey, form.nick.value.trim());
    }
    catch { }
    form.text.value = "";
    try {
        const response = await lunara.account.api("/api/chat", { method: "POST", body: JSON.stringify({ nick, text }) });
        if (!response.ok)
            system((await response.json().catch(() => null))?.error || "Message not sent.");
    }
    catch {
        system("Could not reach the chat server.");
    }
});
