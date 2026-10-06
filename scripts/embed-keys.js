// Copies GROQ_API_KEY from .env (or the environment) into server/keys.js, scrambled,
// after which .env can be deleted. Run: node scripts/embed-keys.js
// or without a .env file: GROQ_API_KEY=gsk_... node scripts/embed-keys.js
import fs from "node:fs";
import { scramble } from "../server/keys.js";

try {
    process.loadEnvFile();
}
catch { }
const file = new URL("../server/keys.js", import.meta.url);
let source = fs.readFileSync(file, "utf8");
for (const name of ["GROQ_API_KEY"]) {
    const value = process.env[name];
    if (!value) {
        console.log(`${name}: not set, left as is`);
        continue;
    }
    source = source.replace(new RegExp(`(${name}: )"[^"]*"`), `$1"${scramble(value)}"`);
    console.log(`${name}: embedded`);
}
fs.writeFileSync(file, source);
console.log("Done. You can delete .env now.");
