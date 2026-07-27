import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readSessionCookie } from "@/lib/session.server";

const getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  return readSessionCookie();
});

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const s = await getSessionUser();
    if (!s) throw redirect({ to: "/auth" });
    return { user: s.user };
  },
  component: () => <Outlet />,
});
