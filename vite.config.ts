// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // `inlineDynamicImports` isn't in this wrapper's typed `nitro` option surface, but it's
  // spread straight through to nitro/vite untouched — this is a real Nitro config key.
  // Bundles the SSR output into one file instead of splitting into content-hashed chunks.
  // Needed to work around a chunk-cycle bug in the current nitro/rolldown pre-RC pin:
  // the split SSR chunks reference each other circularly, and one calls
  // `createCsrfMiddleware` before the chunk defining it finishes evaluating
  // ("TypeError: createCsrfMiddleware is not a function" at runtime).
  nitro: { inlineDynamicImports: true } as { preset?: string },
  // Default host "::" (IPv6 wildcard) fails with EAFNOSUPPORT on hosts without IPv6.
  vite: {
    server: { host: "127.0.0.1" },
  },
});
