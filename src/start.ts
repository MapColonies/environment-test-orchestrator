import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Inlined equivalent of @tanstack/react-start's createCsrfMiddleware. Importing that
// helper trips a bundler chunk-cycle bug in the current nitro/rolldown pin
// ("TypeError: createCsrfMiddleware is not a function" at SSR runtime) — the generated
// SSR chunk calls it before the chunk defining it finishes evaluating. Same same-origin
// check, scoped to server-fn calls only, without pulling in the broken export.
const csrfMiddleware = createMiddleware().server(async (ctx) => {
  if (ctx.handlerType !== "serverFn") return ctx.next();
  if (isSameOriginRequest(ctx.request)) return ctx.next();
  return new Response("Forbidden", { status: 403 });
});

function isSameOriginRequest(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin;

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null) return fetchSite === "same-origin";

  const origin = request.headers.get("Origin");
  if (origin !== null) return origin === requestOrigin;

  const referer = request.headers.get("Referer");
  if (referer === null) return true;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
