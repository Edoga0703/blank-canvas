import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: false, deprecated: true, provider: "dapi" }, { status: 410 }),
      POST: async () => Response.json({ ok: false, deprecated: true, provider: "dapi" }, { status: 410 }),
    },
  },
});
