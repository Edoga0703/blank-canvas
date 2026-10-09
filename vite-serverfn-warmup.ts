import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

/**
 * Dev-only fix: TanStack Start only registers server-function IDs when a
 * `*.functions.ts` module is transformed. After a dev-server restart the
 * registry starts empty, so any server-function call made before the browser
 * has loaded that module fails with "Invalid server function ID" (HTTP 500).
 * We warm the client environment with every server-function module on boot.
 */
export function serverFnWarmup(): Plugin {
  return {
    name: "lovable:server-fn-warmup",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      const srcDir = join(root, "src");
      const files: string[] = [];

      const walk = (dir: string) => {
        let entries: string[] = [];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry === "node_modules" || entry.startsWith(".")) continue;
          const full = join(dir, entry);
          let isDir = false;
          try {
            isDir = statSync(full).isDirectory();
          } catch {
            continue;
          }
          if (isDir) walk(full);
          else if (/\.functions\.tsx?$/.test(entry)) files.push(full);
        }
      };
      walk(srcDir);

      const warm = async () => {
        const env = server.environments["client"];
        if (!env) return;
        for (const file of files) {
          try {
            await env.transformRequest(`/${relative(root, file).replace(/\\/g, "/")}`);
          } catch {
            // ignore individual failures; warmup is best-effort
          }
        }
      };

      server.httpServer?.once("listening", () => {
        void warm();
      });
      void warm();
    },
  };
}
