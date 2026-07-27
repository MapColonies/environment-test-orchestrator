import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie } from "@/lib/session.server";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      POST: async () => {
        clearSessionCookie();
        return Response.json({ ok: true });
      },
    },
  },
});
