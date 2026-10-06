// lunara://shop: spend Lunara coins on chat titles, chat text styles and AI credits.
const lunara = parent.lunara;
const $ = (selector) => document.querySelector(selector);
const shop = $("[data-shop]");
let items = [];

const groups = [
    { kind: "title", title: "Chat titles", desc: "A badge next to your name in chat." },
    { kind: "text", title: "Chat text styles", desc: "Makes your chat messages stand out." },
    { kind: "credits", title: "AI credits", desc: "Spent after your free daily credits run out. They never expire." }
];

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};

const renderWallet = (profile) => {
    $("[data-coins]").textContent = profile.coins.toLocaleString();
    $("[data-credits]").textContent = profile.credits.toLocaleString();
    const titleItem = items.find(i => i.id === profile.equipped.title);
    const badge = $("[data-preview-title]");
    badge.hidden = !titleItem;
    badge.textContent = titleItem?.name ?? "";
    const style = profile.equipped.text?.replace("text:", "");
    $("[data-preview-text]").className = style ? `fx-${style}` : "";
    $("[data-preview-nick]").textContent = profile.username ?? (() => {
        try {
            return localStorage.getItem("lunara:chat-nick") || "you";
        }
        catch {
            return "you";
        }
    })();
};

const act = async (fn, button) => {
    button.disabled = true;
    try {
        await fn();
    }
    catch (error) {
        lunara.toast(error.message);
    }
    finally {
        button.disabled = false;
    }
};

const render = () => {
    const profile = lunara.account.getProfile();
    renderWallet(profile);
    shop.replaceChildren(...groups.map(group => {
        const section = el("section", "shop-group");
        section.append(el("h2", "section-title", group.title), el("p", "shop-group__desc", group.desc));
        const grid = el("div", "shop-grid");
        for (const item of items.filter(i => i.kind === group.kind)) {
            const owned = item.kind !== "credits" && profile.inventory.includes(item.id);
            const equipped = owned && profile.equipped[item.kind] === item.id;
            const card = el("div", `shop-item${equipped ? " shop-item--equipped" : ""}`);
            const preview = el("div", "shop-item__preview");
            if (item.kind === "title")
                preview.append(el("span", "badge", item.name));
            else if (item.kind === "text")
                preview.append(el("span", `fx-${item.id.replace("text:", "")}`, item.name));
            else
                preview.append(el("span", "shop-item__big", `+${item.amount}`));
            const name = el("div", "shop-item__name", item.kind === "credits" ? item.name : item.name);
            const desc = el("div", "shop-item__desc", item.preview ?? (item.kind === "credits" ? "Use with any model" : "Title badge"));
            const action = el("button", "shop-item__buy");
            action.type = "button";
            if (equipped) {
                action.textContent = "Unequip";
                action.onclick = () => act(() => lunara.account.equip(item.kind, null), action);
            }
            else if (owned) {
                action.textContent = "Equip";
                action.onclick = () => act(() => lunara.account.equip(item.kind, item.id), action);
            }
            else {
                action.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`;
                action.append(` ${item.price.toLocaleString()}`);
                action.classList.toggle("shop-item__buy--poor", profile.coins < item.price);
                action.title = profile.coins < item.price ? `You need ${item.price - profile.coins} more coins` : `Buy for ${item.price} coins`;
                action.onclick = () => act(async () => {
                    await lunara.account.buy(item.id);
                    lunara.toast(item.kind === "credits" ? `Added ${item.amount} AI credits.` : `Bought ${item.name}. It is equipped.`);
                }, action);
            }
            card.append(preview, name, desc, action);
            grid.append(card);
        }
        section.append(grid);
        return section;
    }));
};

const unsubscribe = lunara.account.onChange(render);
addEventListener("pagehide", unsubscribe);

try {
    const data = await (await fetch("/api/shop")).json();
    items = data.items;
    $("[data-reward]").textContent = data.searchReward;
    await lunara.account.refresh();
    render();
}
catch {
    shop.replaceChildren(el("p", "empty", "Could not load the shop."));
}
