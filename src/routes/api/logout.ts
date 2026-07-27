import { createFileRoute } from "@tanstack/react-router";
import { makeSessionClearCookie } from "@/lib/session.server";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          { ok: true },
          { headers: { "Set-Cookie": makeSessionClearCookie() } },
        );
      },
    },
  },
});
