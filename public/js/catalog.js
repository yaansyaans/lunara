// Everything the launcher pages list. Each item opens through the proxy in the current tab.
export const launchers = {
    movies: {
        title: "Movies",
        tagline: "Films, shows and live TV.",
        query: {
            label: "Search with",
            targets: [
                { name: "YouTube", template: "https://www.youtube.com/results?search_query=%s", placeholder: "Search YouTube" },
                { name: "Tubi", template: "https://tubitv.com/search/%s", placeholder: "Search free movies on Tubi" },
                { name: "IMDb", template: "https://www.imdb.com/find/?q=%s", placeholder: "Look up a title on IMDb" },
                { name: "JustWatch", template: "https://www.justwatch.com/us/search?q=%s", placeholder: "Find where something is streaming" }
            ]
        },
        items: [
            { name: "YouTube", url: "https://www.youtube.com", cat: "Free", desc: "Videos, trailers, free films" },
            { name: "Tubi", url: "https://tubitv.com", cat: "Free", desc: "Free movies and TV" },
            { name: "Pluto TV", url: "https://pluto.tv", cat: "Live", desc: "Free live channels" },
            { name: "Plex", url: "https://watch.plex.tv", cat: "Free", desc: "Free on-demand and live TV" },
            { name: "The Roku Channel", url: "https://therokuchannel.roku.com", cat: "Free", desc: "Free movies and shows" },
            { name: "Internet Archive", url: "https://archive.org/details/feature_films", cat: "Free", desc: "Public-domain feature films" },
            { name: "Netflix", url: "https://www.netflix.com", cat: "Subscription", desc: "Films and series" },
            { name: "Disney+", url: "https://www.disneyplus.com", cat: "Subscription", desc: "Disney, Pixar, Marvel" },
            { name: "Max", url: "https://www.max.com", cat: "Subscription", desc: "HBO and more" },
            { name: "Prime Video", url: "https://www.primevideo.com", cat: "Subscription", desc: "Amazon's streaming" },
            { name: "Hulu", url: "https://www.hulu.com", cat: "Subscription", desc: "TV and films" },
            { name: "Crunchyroll", url: "https://www.crunchyroll.com", cat: "Anime", desc: "Anime streaming" },
            { name: "Twitch", url: "https://www.twitch.tv", cat: "Live", desc: "Live streams" },
            { name: "IMDb", url: "https://www.imdb.com", cat: "Discover", desc: "Ratings and cast info" },
            { name: "Letterboxd", url: "https://letterboxd.com", cat: "Discover", desc: "Film diary and reviews" },
            { name: "JustWatch", url: "https://www.justwatch.com", cat: "Discover", desc: "Where to watch anything" }
        ]
    }
};
export const musicSites = [
            { name: "Spotify", url: "https://open.spotify.com", cat: "Streaming", desc: "Spotify web player" },
            { name: "YouTube Music", url: "https://music.youtube.com", cat: "Streaming", desc: "Songs, albums, videos" },
            { name: "SoundCloud", url: "https://soundcloud.com", cat: "Streaming", desc: "Independent artists" },
            { name: "Apple Music", url: "https://music.apple.com", cat: "Streaming", desc: "Apple Music web player" },
            { name: "Deezer", url: "https://www.deezer.com", cat: "Streaming", desc: "Music streaming" },
            { name: "Tidal", url: "https://listen.tidal.com", cat: "Streaming", desc: "Hi-fi streaming" },
            { name: "Audiomack", url: "https://audiomack.com", cat: "Streaming", desc: "Free music streaming" },
            { name: "Bandcamp", url: "https://bandcamp.com", cat: "Discover", desc: "Support artists directly" },
            { name: "Last.fm", url: "https://www.last.fm", cat: "Discover", desc: "Scrobbles and recommendations" },
            { name: "Genius", url: "https://genius.com", cat: "Discover", desc: "Lyrics and annotations" },
            { name: "Radio Garden", url: "https://radio.garden", cat: "Radio", desc: "Live radio from the globe" },
            { name: "lofi.cafe", url: "https://lofi.cafe", cat: "Radio", desc: "Lo-fi beats to study to" },
            { name: "Chrome Music Lab", url: "https://musiclab.chromeexperiments.com", cat: "Create", desc: "Make music in the browser" },
            { name: "BandLab", url: "https://www.bandlab.com", cat: "Create", desc: "Online music studio" }
];
export const chatApps = [
    { name: "Discord", url: "https://discord.com/app", cat: "Messaging", desc: "Servers and DMs" },
    { name: "Telegram", url: "https://web.telegram.org", cat: "Messaging", desc: "Telegram Web" },
    { name: "WhatsApp", url: "https://web.whatsapp.com", cat: "Messaging", desc: "WhatsApp Web" },
    { name: "Messenger", url: "https://www.messenger.com", cat: "Messaging", desc: "Facebook Messenger" },
    { name: "Element", url: "https://app.element.io", cat: "Messaging", desc: "Matrix chat" },
    { name: "Reddit", url: "https://www.reddit.com", cat: "Social", desc: "Communities" },
    { name: "Instagram", url: "https://www.instagram.com", cat: "Social", desc: "Photos and DMs" },
    { name: "X", url: "https://x.com", cat: "Social", desc: "Posts and DMs" }
];
