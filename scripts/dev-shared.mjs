import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = path.join(root, ".env.shared.local");
if (existsSync(settings)) process.loadEnvFile(settings);

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
try {
  if (!url || !key) throw new Error("Add the shared project URL and public client key to .env.shared.local (see .env.shared.example).");
  const target = new URL(url);
  if (target.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("Shared startup requires the online HTTPS Supabase URL. Use npm run dev:local for local data.");
  }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(key);
  if (!publicKey && key.split(".").length === 3) {
    try { publicKey = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon"; }
    catch { publicKey = false; }
  }
  if (!publicKey) {
    throw new Error("Use a publishable/anon client key, never a server or service-role key.");
  }
  console.log(`Using shared Supabase: ${target.hostname}`);
  console.log("Local Supabase and database migrations are not started by this command.");
  if (process.argv.includes("--check")) {
    console.log("Shared connection settings are ready.");
  } else {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["--prefix", "frontend", "run", "dev"], {
      cwd: root, shell: process.platform === "win32", stdio: "inherit", env: process.env,
    });
    child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
    child.on("exit", (code) => { process.exitCode = code ?? 0; });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
