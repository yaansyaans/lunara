// The browser side of identity, coins and Lunara CloudSync. Every API call carries a
// token: an anonymous device token by default, or an account session after signing in.
import * as storage from "./storage.js";
import * as settings from "./settings.js";

const tokenKey = "token";
const userKey = "username";

let token = storage.read(tokenKey, "");
let username = storage.read(userKey, null);
let profile = { username, coins: 0, credits: 0, inventory: [], equipped: { title: null, text: null } };
const listeners = new Set();

export const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
const emit = () => {
    for (const fn of listeners)
        fn(profile);
};

export const getProfile = () => profile;
export const signedIn = () => Boolean(username);

const setProfile = (next) => {
    profile = { ...profile, ...next };
    emit();
};

let minting = null;
const mintDevice = async () => {
    minting ??= fetch("/api/id/device", { method: "POST" })
        .then(async response => {
            if (!response.ok)
                throw new Error((await response.json().catch(() => null))?.error ?? "Could not start a session.");
            return response.json();
        })
        .then(data => {
            token = data.token;
            username = null;
            storage.write(tokenKey, token);
            storage.remove(userKey);
            return token;
        })
        .finally(() => (minting = null));
    return minting;
};

export const ensureToken = async () => token || mintDevice();

// fetch() with the Lunara token. An unknown token (server data was reset, or the
// account was deleted) is replaced with a fresh device token and the call retried once.
export const api = async (path, options = {}) => {
    await ensureToken();
    const run = () => fetch(path, {
        ...options,
        headers: {
            ...(options.body && typeof options.body === "string" ? { "content-type": "application/json" } : {}),
            ...options.headers,
            "x-lunara-token": token
        }
    });
    let response = await run();
    // 401 only ever means the token is unknown; wrong passcodes answer 403 or are on the
    // login route, which must not start a new session.
    if (response.status === 401 && !path.startsWith("/api/account/login")) {
        const wasUser = username;
        await mintDevice();
        if (wasUser)
            setProfile({ username: null });
        response = await run();
    }
    return response;
};

export const json = async (path, options = {}) => {
    const response = await api(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw Object.assign(new Error(data.error ?? `Request failed (${response.status})`), { status: response.status, data });
    return data;
};

export const refresh = async () => {
    try {
        setProfile(await json("/api/account/me"));
    }
    catch { }
    return profile;
};

// Coins: the server counts searches and pays 30 coins every 5-7 of them.
export const recordSearch = async () => {
    try {
        const result = await json("/api/coins/search", { method: "POST" });
        setProfile({ coins: result.coins });
        return result.awarded;
    }
    catch {
        return 0;
    }
};

export const buy = async (id) => setProfile(await json("/api/shop/buy", { method: "POST", body: JSON.stringify({ id }) }));
export const equip = async (kind, id) => setProfile(await json("/api/shop/equip", { method: "POST", body: JSON.stringify({ kind, id }) }));

// ---- CloudSync ----

const syncable = () => Object.fromEntries(Object.entries(settings.all()).filter(([key]) => !settings.localOnly.has(key)));

const startSession = async (data) => {
    token = data.token;
    username = data.username;
    storage.write(tokenKey, token);
    storage.write(userKey, username);
    await refresh();
};

export const signUp = async (name, passcode) => {
    const data = await json("/api/account/signup", { method: "POST", body: JSON.stringify({ username: name, passcode }) });
    await startSession(data);
    await pushSettings();
};

// Signing in pulls the account's saved settings, if it has any, over the local ones.
export const signIn = async (name, passcode) => {
    const data = await json("/api/account/login", { method: "POST", body: JSON.stringify({ username: name, passcode }) });
    await startSession(data);
    const remote = await json("/api/account/sync").catch(() => null);
    if (remote?.settings)
        applyRemote(remote.settings);
    else
        await pushSettings();
};

export const signOut = async () => {
    await api("/api/account/logout", { method: "POST" }).catch(() => { });
    token = "";
    username = null;
    storage.remove(tokenKey);
    storage.remove(userKey);
    await mintDevice().catch(() => { });
    await refresh();
};

export const deleteAccount = async (passcode) => {
    await json("/api/account", { method: "DELETE", body: JSON.stringify({ passcode }) });
    token = "";
    username = null;
    storage.remove(tokenKey);
    storage.remove(userKey);
    await mintDevice().catch(() => { });
    await refresh();
};

let applyingRemote = false;
const applyRemote = (remote) => {
    applyingRemote = true;
    try {
        const keep = Object.fromEntries([...settings.localOnly].map(key => [key, settings.get(key)]));
        settings.set({ ...remote, ...keep });
    }
    finally {
        applyingRemote = false;
    }
};

export const pushSettings = async () => {
    if (!signedIn())
        return null;
    const result = await json("/api/account/sync", { method: "PUT", body: JSON.stringify({ settings: syncable() }) });
    storage.write("last-sync", result.updated);
    return result.updated;
};

export const pullSettings = async () => {
    const remote = await json("/api/account/sync");
    if (remote.settings)
        applyRemote(remote.settings);
    return remote;
};

export const lastSync = () => storage.read("last-sync", 0);

// Push changes a couple of seconds after the last edit while signed in.
let pushTimer = 0;
settings.onChange(() => {
    if (applyingRemote || !signedIn())
        return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void pushSettings().catch(() => { }), 2000);
});

export const exportData = async () => {
    const account = signedIn() ? await json("/api/account/export") : null;
    return {
        app: "Lunara",
        exported: new Date().toISOString(),
        account,
        settings: { ...settings.all(), aiProviderKey: settings.get("aiProviderKey") ? "(hidden)" : "" },
        bookmarks: storage.read("bookmarks", []),
        history: storage.read("history", [])
    };
};
