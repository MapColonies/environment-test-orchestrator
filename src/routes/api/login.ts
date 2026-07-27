import { createFileRoute } from "@tanstack/react-router";
import { makeSessionSetCookie, verifyCredentials } from "@/lib/session.server";

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
        }
        const username = String(body?.username ?? "");
        const password = String(body?.password ?? "");
        if (!username || !password) {
          return Response.json({ ok: false, error: "Missing credentials" }, { status: 400 });
        }
        if (!verifyCredentials(username, password)) {
          return Response.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
        }
        return Response.json(
          { ok: true, user: username },
          { headers: { "Set-Cookie": makeSessionSetCookie(username) } },
        );
      },
    },
  },
});
