// A small JSON-file database. Everything Lunara keeps on the server (accounts, wallets,
// synced settings, AI usage) lives in one document that is written atomically and
// debounced, so a burst of changes costs one disk write.
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.LUNARA_DATA_DIR || path.join(process.cwd(), "data");
const file = path.join(dataDir, "lunara.json");

const empty = () => ({ version: 1, devices: {}, accounts: {}, sessions: {}, usage: {} });

const load = () => {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        return { ...empty(), ...parsed };
    }
    catch (error) {
        if (error.code !== "ENOENT")
            console.error(`Could not read ${file}, starting empty:`, error.message);
        return empty();
    }
};

export const db = load();

let timer = null;
const flush = () => {
    timer = null;
    try {
        fs.mkdirSync(dataDir, { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(db));
        fs.renameSync(tmp, file);
    }
    catch (error) {
        console.error("Could not save data:", error.message);
    }
};

export const save = () => {
    timer ??= setTimeout(flush, 1000);
};

export const saveNow = () => {
    clearTimeout(timer);
    flush();
};

// UTC day key, e.g. "2026-10-06". Daily allowances reset when this changes.
export const today = () => new Date().toISOString().slice(0, 10);
