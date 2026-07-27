import { createFileRoute } from "@tanstack/react-router";
import { readSessionCookie } from "@/lib/session.server";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async () => {
        const s = readSessionCookie();
        return Response.json({ user: s?.user ?? null });
      },
    },
  },
});
