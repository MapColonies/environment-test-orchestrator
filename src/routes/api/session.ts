import { createFileRoute } from "@tanstack/react-router";
import { readSessionFromCookieHeader } from "@/lib/session.server";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = readSessionFromCookieHeader(request.headers.get("cookie"));
        return Response.json({ user: s?.user ?? null });
      },
    },
  },
});
