import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/wablast-webhook")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: false, deprecated: true, provider: "dapi_official" }, { status: 410 }),
      POST: async () => Response.json({ ok: false, deprecated: true, provider: "dapi_official" }, { status: 410 }),
    },
  },
});
