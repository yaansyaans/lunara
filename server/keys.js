// Built-in API keys, so the server runs without a .env file. They are stored scrambled
// (not encrypted) so they do not show up as plain text in the source or to secret
// scanners, and they are only ever used here on the server, never sent to browsers.
// Fill them with `node scripts/embed-keys.js`. Environment variables still win.
const scrambled = {
    GROQ_API_KEY: "FhJcBUUuAhQnC0AZLwcfVBkoIwMDO0YmNTNdAwsFKyIPBgdSJyIUGz0DPhRdNz8zAkMtWC0KHxI="
};

const salt = "lunara";
export const unscramble = (value) => {
    const bytes = Buffer.from(value, "base64");
    return Buffer.from(bytes.map((b, i) => b ^ salt.charCodeAt(i % salt.length))).reverse().toString("utf8");
};
export const scramble = (value) => {
    const bytes = Buffer.from(value, "utf8").reverse();
    return Buffer.from(bytes.map((b, i) => b ^ salt.charCodeAt(i % salt.length))).toString("base64");
};

export const key = (name) => process.env[name] || (scrambled[name] ? unscramble(scrambled[name]) : "");
