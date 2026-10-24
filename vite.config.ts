// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { serverFnWarmup } from "./vite-serverfn-warmup";

// @lovable.dev/mcp-js 0.28.0 compara la raiz normalizada de Vite (con `/`)
// contra rutas nativas de Windows (con `\\`) y aborta antes de compilar.
// Lovable publica en Linux, donde el plugin sigue activo. Las rutas MCP ya
// generadas permanecen disponibles durante la validacion local en Windows.
const lovableMcpPlugins = process.platform === "win32" ? [] : [mcpPlugin()];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [...lovableMcpPlugins, serverFnWarmup()],
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(
        process.env.SUPABASE_URL || "https://llnfjhqdeeuscyqzoqfz.supabase.co"
      ),
      "process.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env.VITE_SUPABASE_URL || "https://llnfjhqdeeuscyqzoqfz.supabase.co"
      ),
      "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_AWtQzPmKl_MS9OWWmSkoZg_-vHK23d5"
      ),
      "process.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_AWtQzPmKl_MS9OWWmSkoZg_-vHK23d5"
      ),
      "process.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsbmZqaHFkZWV1c2N5cXpvcWZ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTU1ODQ2NywiZXhwIjoyMTA3MTM0NDY3fQ.ylDWCcoxzXhPoshBQGult4ZIK2C6AczihHJLz9vWJfQ"
      ),
      "process.env.DAPI_API_KEY": JSON.stringify(
        process.env.DAPI_API_KEY || "098aeda184429bc8201ba60d88116821906397caa5fd5b935b615318a245da03"
      ),
      "process.env.DAPI_BASE_URL": JSON.stringify(process.env.DAPI_BASE_URL || "https://api.d-api.cloud/api/v1"),
      "process.env.R2_ACCOUNT_ID": JSON.stringify(process.env.R2_ACCOUNT_ID || "3bc2408cba1eadcd78d9ccdb0a8c987d"),
      "process.env.R2_ACCESS_KEY_ID": JSON.stringify(process.env.R2_ACCESS_KEY_ID || "a0048ab1cf7078594e2057b9b31131de"),
      "process.env.R2_SECRET_ACCESS_KEY": JSON.stringify(
        process.env.R2_SECRET_ACCESS_KEY || "328e9326f2e6adad6740f7ea6d1cf64ded1d4727e95408ad5fb4451ff5d29a3c"
      ),
      "process.env.R2_BUCKET": JSON.stringify(process.env.R2_BUCKET || "capiversa-media"),
      "process.env.R2_MAX_FILE_BYTES": JSON.stringify(process.env.R2_MAX_FILE_BYTES || "52428800"),
      "process.env.R2_SIGNED_URL_TTL_SECONDS": JSON.stringify(process.env.R2_SIGNED_URL_TTL_SECONDS || "900"),
    },
    // Reduce build memory usage (avoids OOM on publish)
    build: { sourcemap: false, reportCompressedSize: false },
    optimizeDeps: {
      // Commit immediately, but prebundle the router's lazy subpaths up front.
      // This prevents a second optimization pass from mixing incompatible
      // module versions in the browser and crashing HeadContent.
      holdUntilCrawlEnd: false,
      include: [
        "@tanstack/react-router",
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "@tanstack/history",
        "seroval",
        "h3-v2",
      ],
    },
  },
});
