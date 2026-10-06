import { definePage, escapeHtml } from "./internal.js";
import * as visitLog from "./history.js";
import * as bookmarks from "./bookmarks.js";
import { icon, sections } from "./icons.js";
import { launchers, chatApps, musicSites } from "./catalog.js";
const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    }
    catch {
        return url;
    }
};
const monogram = (name) => {
    const letters = name.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?";
    return escapeHtml(letters[0].toUpperCase() + letters.slice(1).toLowerCase());
};
const card = (item) => `
  <a href="#" class="card" data-card data-open="${escapeHtml(item.url)}" data-cat="${escapeHtml(item.cat ?? "")}"
     data-keywords="${escapeHtml(`${item.name} ${hostOf(item.url)} ${item.cat ?? ""} ${item.desc ?? ""}`.toLowerCase())}">
    <span class="card__mono">${monogram(item.name)}</span>
    <span class="card__body">
      <span class="card__name">${escapeHtml(item.name)}</span>
      <span class="card__desc">${escapeHtml(item.desc ?? hostOf(item.url))}</span>
    </span>
    <span class="card__go">${icon("arrow", 16)}</span>
  </a>`;
const hero = (name, page) => `
  <header class="hero">
    <span class="hero__icon">${icon(name, 26)}</span>
    <div>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.tagline)}</p>
    </div>
  </header>`;
const queryBox = (query) => `
  <form class="query" data-query-form>
    <div class="query__bar">
      ${icon("search", 18)}
      <input name="q" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(query.targets[0].placeholder)}" aria-label="${escapeHtml(query.label)}">
      <button type="submit" class="query__submit" aria-label="Go">${icon("arrow", 18)}</button>
    </div>
    <div class="chips" role="group" aria-label="${escapeHtml(query.label)}">
      ${query.targets
    .map((target, i) => `<button type="button" class="chip" data-template="${escapeHtml(target.template)}" data-placeholder="${escapeHtml(target.placeholder)}" aria-pressed="${i === 0}">${escapeHtml(target.name)}</button>`)
    .join("")}
    </div>
  </form>`;
const cardGrid = (items) => {
    const categories = [...new Set(items.map(item => item.cat).filter(Boolean))];
    return `
  <div class="filterbar">
    <label class="filter">
      ${icon("search", 15)}
      <input type="text" data-filter placeholder="Filter" autocomplete="off" spellcheck="false" aria-label="Filter">
    </label>
    <div class="chips" role="group" aria-label="Category">
      <button type="button" class="chip" data-category="all" aria-pressed="true">All</button>
      ${categories.map(cat => `<button type="button" class="chip" data-category="${escapeHtml(cat)}" aria-pressed="false">${escapeHtml(cat)}</button>`).join("")}
    </div>
  </div>
  <div class="grid">${items.map(card).join("")}</div>
  <p class="empty" data-empty hidden>Nothing matches that filter.</p>`;
};
const renderLauncher = (name, page) => `
  <main class="page">
    ${hero(name, page)}
    ${page.query ? queryBox(page.query) : ""}
    ${cardGrid(page.items)}
  </main>`;
const renderHome = () => `
  <main class="home">
    <div class="home__center">
      <div class="home__clock" data-clock>&nbsp;</div>
      <div class="home__date" data-date>&nbsp;</div>
      <h1 class="home__brand">${icon("moon", 44)}<span>lunara</span></h1>
      <form class="query query--home" data-query-form>
        <div class="query__bar">
          ${icon("search", 18)}
          <input name="q" type="text" autocomplete="off" spellcheck="false" placeholder="Search the web or enter an address" aria-label="Search" autofocus>
          <button type="submit" class="query__submit" aria-label="Go">${icon("arrow", 18)}</button>
        </div>
      </form>
      <nav class="home__tiles" aria-label="Sections">
        ${sections
    .filter(section => section.name !== "home")
    .map(section => `<a href="#" class="tile" data-open="lunara://${section.name}">${icon(section.name, 22)}<span>${escapeHtml(section.label)}</span></a>`)
    .join("")}
      </nav>
    </div>
    <footer class="home__footer">
      <a href="#" data-open="lunara://settings">settings</a>
      <a href="#" data-open="lunara://history">history</a>
      <a href="#" data-open="lunara://bookmarks">bookmarks</a>
      <a href="#" data-open="lunara://about">about</a>
    </footer>
    <script>
      const tick = () => {
        const now = new Date();
        document.querySelector("[data-clock]").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        document.querySelector("[data-date]").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
      };
      tick();
      setInterval(tick, 1000);
    <\/script>
  </main>`;
const renderChat = () => `
  <main class="page page--chat">
    ${hero("chat", { title: "Chat", tagline: "One global room for everyone on this Lunara server. Messages are not saved." })}
    <section class="room">
      <header class="room__head">
        <span class="room__title"># general</span>
        <a href="#" class="room__shop" data-open="lunara://shop">${icon("coin", 14)} Titles and text styles</a>
        <span class="room__online" data-online>connecting…</span>
      </header>
      <ol class="room__log" data-log aria-live="polite"></ol>
      <form class="room__compose" data-chat-form>
        <input class="room__nick" name="nick" maxlength="24" placeholder="nickname" autocomplete="off" spellcheck="false" aria-label="Nickname">
        <input class="room__text" name="text" maxlength="500" placeholder="Message #general" autocomplete="off" aria-label="Message">
        <button type="submit" class="query__submit" aria-label="Send">${icon("send", 16)}</button>
      </form>
    </section>
    <h2 class="section-title">Other places to talk</h2>
    ${cardGrid(chatApps)}
  </main>`;
const renderGames = () => `
  <main class="page page--games">
    ${hero("games", { title: "Games", tagline: "Every game from every gmshelf collection, in one place." })}
    <div class="games-bar">
      <label class="games-source">
        <span class="games-source__label">Source</span>
        <select data-source aria-label="Game source"><option>Loading…</option></select>
      </label>
      <label class="filter games-filter">
        ${icon("search", 15)}
        <input type="text" data-search placeholder="Search games" autocomplete="off" spellcheck="false" aria-label="Search games">
      </label>
      <button type="button" class="chip" data-random>${icon("games", 14)} Random</button>
      <button type="button" class="chip" data-open="lunara://cloud">${icon("cloud", 14)} Cloud gaming</button>
    </div>
    <p class="games-count" data-count aria-live="polite">Loading the game lists…</p>
    <div class="games-grid" data-grid></div>
    <div data-sentinel class="games-sentinel"></div>
    <p class="empty" data-empty hidden>No games match that search.</p>
  </main>`;
const renderPlay = (params) => {
    const data = { s: params.get("s") ?? "", f: params.get("f") ?? "", n: params.get("n") ?? "Game" };
    return `
  <main class="play">
    <header class="play__bar">
      <button type="button" class="chip" data-open="lunara://games">${icon("back", 14)} Games</button>
      <div class="play__title"><strong>${escapeHtml(data.n)}</strong><span class="play__source">${escapeHtml(data.s)}</span></div>
      <span class="play__mode" data-mode></span>
      <button type="button" class="chip" data-reload>${icon("reload", 14)} Reload</button>
      <button type="button" class="chip" data-fullscreen>${icon("fullscreen", 14)} Fullscreen</button>
    </header>
    <div class="play__stage">
      <iframe class="play__frame" data-frame allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; accelerometer; gyroscope" allowfullscreen></iframe>
      <p class="play__status" data-status>Loading…</p>
    </div>
    <script type="application/json" data-game>${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
  </main>`;
};
const renderMusic = () => `
  <main class="page page--music">
    ${hero("music", { title: "Music", tagline: "Search millions of tracks from SoundCloud. Keeps playing while you browse." })}
    <form class="query" data-music-form>
      <div class="query__bar">
        ${icon("search", 18)}
        <input name="q" type="text" autocomplete="off" spellcheck="false" placeholder="Search songs, artists, mixes" aria-label="Search music">
        <button type="submit" class="query__submit" aria-label="Search">${icon("arrow", 18)}</button>
      </div>
      <div class="chips" data-genres>
        ${["Lo-fi", "Phonk", "Hip hop", "Pop", "EDM", "Rock", "Chill", "Jazz", "Nightcore", "Study"].map(g => `<button type="button" class="chip" data-genre="${g}">${g}</button>`).join("")}
      </div>
    </form>
    <p class="music-status" data-status aria-live="polite"></p>
    <ol class="tracks" data-tracks></ol>
    <h2 class="section-title">More music sites</h2>
    <div class="grid">${musicSites.map(card).join("")}</div>
  </main>`;
const renderAi = () => `
  <main class="ai">
    <header class="ai__bar">
      <span class="ai__brand">${icon("ai", 20)} Lunara AI</span>
      <select data-model aria-label="Model"></select>
      <span class="ai__quota" data-quota></span>
      <button type="button" class="chip" data-new>${icon("plus", 14)} New chat</button>
    </header>
    <div class="ai__log" data-log aria-live="polite"></div>
    <form class="ai__compose" data-form>
      <textarea name="text" rows="1" maxlength="8000" placeholder="Ask anything" aria-label="Message" data-input></textarea>
      <button type="submit" class="query__submit" data-send aria-label="Send">${icon("send", 16)}</button>
    </form>
    <p class="ai__note">Free models from Groq. Answers can be wrong. <a href="#" data-open="lunara://shop">Need more credits?</a></p>
  </main>`;
const renderMovies = () => `
  <main class="page page--movies">
    ${hero("movies", { title: "Movies & TV", tagline: "Search any film or show and watch it right here. Streams by VidFast, info from TMDB." })}
    <section class="watch" data-watch hidden>
      <header class="watch__bar">
        <button type="button" class="chip" data-close-watch>${icon("back", 14)} Back</button>
        <strong class="watch__title" data-watch-title></strong>
        <select data-season aria-label="Season" hidden></select>
        <select data-episode aria-label="Episode" hidden></select>
        <button type="button" class="chip" data-proxy-watch title="Use this if the player stays blank">${icon("globe", 14)} Open through proxy</button>
      </header>
      <div class="watch__stage"><iframe data-player credentialless allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin"></iframe></div>
      <p class="watch__overview" data-overview></p>
    </section>
    <form class="query" data-movie-form>
      <div class="query__bar">
        ${icon("search", 18)}
        <input name="q" type="text" autocomplete="off" spellcheck="false" placeholder="Search movies and TV shows" aria-label="Search movies and TV">
        <button type="submit" class="query__submit" aria-label="Search">${icon("arrow", 18)}</button>
      </div>
    </form>
    <h2 class="section-title" data-heading>Trending this week</h2>
    <div class="posters" data-results></div>
    <p class="empty" data-status hidden></p>
    <h2 class="section-title">More places to watch</h2>
    <div class="grid">${launchers.movies.items.map(card).join("")}</div>
  </main>`;
const renderShop = () => `
  <main class="page page--shop">
    ${hero("shop", { title: "Shop", tagline: "Spend Lunara coins on chat titles, text styles and AI credits." })}
    <section class="wallet">
      <div class="wallet__stat"><span class="wallet__label">Lunara coins</span><strong data-coins>…</strong></div>
      <div class="wallet__stat"><span class="wallet__label">AI credits</span><strong data-credits>…</strong></div>
      <p class="wallet__how">${icon("coin", 16)} <span>Earn <strong data-reward>30</strong> coins every 5 to 7 searches. Search from the address bar or the home page.</span></p>
    </section>
    <section class="shop-preview">
      <span class="wallet__label">How you look in chat</span>
      <div class="msg"><div class="msg__meta"><strong data-preview-nick>you</strong><span class="badge" data-preview-title hidden></span><time>now</time></div><p data-preview-text>Hello everyone!</p></div>
    </section>
    <div data-shop><p class="empty">Loading…</p></div>
  </main>`;
export const registerInternalPages = () => {
    definePage("home", { title: "Home", render: renderHome });
    for (const [name, page] of Object.entries(launchers)) {
        definePage(name, { title: page.title, render: () => renderLauncher(name, page) });
    }
    definePage("chat", { title: "Chat", render: renderChat, script: "/js/pages/chat.js" });
    definePage("games", { title: "Games", render: renderGames, script: "/js/pages/games.js" });
    definePage("play", { title: "Play", render: renderPlay, script: "/js/pages/play.js" });
    definePage("music", { title: "Music", render: renderMusic, script: "/js/pages/music.js" });
    definePage("ai", { title: "AI", render: renderAi, script: "/js/pages/ai.js" });
    definePage("shop", { title: "Shop", render: renderShop, script: "/js/pages/shop.js" });
    definePage("movies", { title: "Movies", render: renderMovies, script: "/js/pages/movies.js" });
    definePage("history", {
        title: "History",
        render: () => {
            const groups = visitLog.grouped();
            if (!groups.length) {
                return `<main class="internal"><h1>History</h1><p>empty</p></main>`;
            }
            return `
        <main class="internal">
          <h1>History</h1>
          <div class="actions"><button type="button" data-action="clear-history">clear</button></div>
          ${groups
                .map(group => `
            <h2>${escapeHtml(group.day)}</h2>
            <ul>
              ${group.items
                .map(entry => `<li><a href="#" data-open="${escapeHtml(entry.url)}">${escapeHtml(entry.title || entry.url)}</a> <span class="dim">${escapeHtml(entry.url)}</span></li>`)
                .join("")}
            </ul>`)
                .join("")}
        </main>`;
        }
    });
    definePage("bookmarks", {
        title: "Bookmarks",
        render: () => {
            const items = bookmarks.all();
            if (!items.length) {
                return `<main class="internal"><h1>Bookmarks</h1><p>use the bookmark button to add one</p></main>`;
            }
            return `
        <main class="internal">
          <h1>Bookmarks</h1>
          <ul>
            ${items
                .map(item => `<li><a href="#" data-open="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a> <span class="dim">${escapeHtml(item.url)}</span></li>`)
                .join("")}
          </ul>
        </main>`;
        }
    });
};
