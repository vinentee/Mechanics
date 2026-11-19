import "dotenv/config";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { migrate, openDatabase } from "./db.js";

const config = readConfig();
const db = await openDatabase(config.databaseUrl, config.localDbPath);
await migrate(db);
await db.query("DELETE FROM sessions WHERE expires_at<$1", [new Date()]);
await db.query("DELETE FROM reset_tokens WHERE expires_at<$1", [new Date()]);
const app = createApp({ db, config });
let vite: import("vite").ViteDevServer | undefined;
if (config.production) {
  app.use(express.static(resolve("dist"), { maxAge: "1h", index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: {
      middlewareMode: true,
      ...(process.env.VITE_DISABLE_HMR === "1" ? { hmr: false } : {}),
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const host = config.production ? "0.0.0.0" : "127.0.0.1";
const server = app.listen(config.port, host, () =>
  console.log(`OrçaMecânica disponível em ${config.appUrl}`),
);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await vite?.close();
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
