import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/lovable-whatsapp")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: false, deprecated: true, provider: "dapi" }, { status: 410 }),
      POST: async () => Response.json({ ok: false, deprecated: true, provider: "dapi" }, { status: 410 }),
    },
  },
});
