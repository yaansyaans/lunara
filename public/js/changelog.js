// Every Lunara build, newest first. Shown in Settings > Changelog. Add a new entry at
// the top (and bump package.json) whenever a build ships.
export const builds = [
    {
        number: 5,
        name: "Supermoon",
        version: "2.3.0",
        date: "2026-10-07",
        added: [
            "lunara://music redesigned like YouTube Music: top search bar, mood chips, Quick picks and carousels",
            "Trending songs from SoundCloud's charts on the music home page",
            "Mood shelves (Chill, Hip hop, Phonk, Pop, Workout, Lo-fi) and a Top result card in search",
            "lunara://cloud now opens now.gg through the proxy"
        ],
        removed: [
            "The cloud gaming launcher page"
        ],
        fixed: [
            "The music page typed \"lofi\" into the search box on its own",
            "Lunara AI not answering because the Groq key was missing"
        ]
    },
    {
        number: 4,
        name: "Full Moon",
        version: "2.2.0",
        date: "2026-10-07",
        added: [
            "Changelog tab in Settings listing every build",
            "API keys can live in server/keys.js (obfuscated, server-only), so a .env file is no longer required",
            "lunara://movies now embeds Helio"
        ],
        removed: [
            "TMDB search and the VidFast player"
        ],
        fixed: [
            "Movies showing \"TMDB is not configured on this server\""
        ]
    },
    {
        number: 3,
        name: "Half Moon",
        version: "2.1.0",
        date: "2026-10-06",
        added: [
            "lunara://movies: trending and search powered by TMDB",
            "VidFast player for movies and TV, with season and episode pickers",
            "\"Open through proxy\" fallback for the player",
            "Poster relay so TMDB images load under cross-origin isolation"
        ],
        removed: [
            "Admin access, account management and login logs"
        ],
        fixed: []
    },
    {
        number: 2,
        name: "Gibbous",
        version: "2.0.0",
        date: "2026-10-06",
        added: [
            "Games from the gmshelf org (seraph, ckv, truffled, ugs) with a source picker and counts",
            "Music search and playback with a mini player",
            "Lunara AI on Groq free models, with fair daily credits per person",
            "Settings as a pop-up: Appearance, Preferences, Cloaking, Data, Legal and About",
            "69 themes, custom themes, light/dark, glass mode, background images and 120 fonts",
            "40 tab-cloak presets, focus cloaking and a panic key",
            "CloudSync accounts with just a username and passcode",
            "Lunara coins for searching, plus a shop for chat titles, text styles and AI credits"
        ],
        removed: [
            "The old full-page settings screen"
        ],
        fixed: [
            "Game files served with the wrong type or a broken length",
            "Escape did not close the settings pop-up",
            "Cloak favicons blocked by cross-origin isolation",
            "Keyboard shortcuts did not work while a lunara:// page had focus",
            "Qwen replies cut off by Groq's output limit",
            "Text hard to read on light themes with a background image",
            "Music search failing when SoundCloud showed a bot check",
            "A wrong passcode when deleting an account signed you out"
        ]
    },
    {
        number: 1,
        name: "Crescent",
        version: "1.0.0",
        date: null,
        added: [
            "The original Lunara proxy, built on Scramjet with wisp and bare transports"
        ],
        removed: [],
        fixed: []
    }
];
