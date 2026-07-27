import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============================================================
// Environment configuration (from deployment env vars)
// ============================================================
type EnvConfig = {
  id: string;
  name: string;
  base_url: string;
  api_key?: string | null;
  demo?: boolean;
};

const DEMO_ENVS: EnvConfig[] = [
  { id: "demo-dev", name: "dev (demo)", base_url: "demo://dev", demo: true },
  { id: "demo-staging", name: "staging (demo)", base_url: "demo://staging", demo: true },
  { id: "demo-production", name: "production (demo)", base_url: "demo://production", demo: true },
];

function slug(s: string) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "env";
}

function getConfiguredEnvs(): EnvConfig[] {
  const raw = process.env.AGENT_ENVIRONMENTS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((e: any, i: number) => {
          const name = String(e.name ?? e.id ?? `env-${i}`);
          const base = String(e.base_url ?? e.baseUrl ?? "");
          return {
            id: String(e.id ?? slug(name)),
            name,
            base_url: base,
            api_key: e.api_key ?? e.apiKey ?? null,
            demo: base.startsWith("demo://"),
          };
        });
      }
    } catch {
      // fall through to demo
    }
  }
  return DEMO_ENVS;
}

function isDemoMode() {
  if (process.env.DEMO_MODE === "true") return true;
  return !process.env.AGENT_ENVIRONMENTS;
}

function getEnv(id: string): EnvConfig | undefined {
  return getConfiguredEnvs().find((e) => e.id === id);
}

async function agentFetch(
  baseUrl: string,
  apiKey: string | null | undefined,
  path: string,
  init?: RequestInit,
) {
  const url = baseUrl.replace(/\/+$/, "") + path;
  const headers = new Headers(init?.headers);
  if (apiKey) {
    headers.set("x-api-key", apiKey);
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await fetch(url, { ...init, headers });
}

// ============================================================
// Demo mocks
// ============================================================
const DEMO_SUITES = [
  {
    suite_id: "smoke",
    domain: "core",
    tests: [
      "homepage_loads",
      "login_flow",
      "search_returns_results",
      "checkout_starts",
      "logout_clears_session",
    ],
  },
  {
    suite_id: "api-sanity",
    domain: "api",
    tests: [
      "health_ok",
      "users_list",
      "orders_create",
      "orders_get",
      "auth_refresh",
    ],
  },
  {
    suite_id: "billing",
    domain: "payments",
    tests: [
      "invoice_pdf_render",
      "tax_calc_eu",
      "webhook_dispatch",
      "refund_flow",
    ],
  },
];

function demoCapabilities() {
  return { suites: DEMO_SUITES };
}

const DEMO_RUN_MS = 8000;

function demoLogLines(suiteId: string, tests: string[], upToMs: number): string[] {
  const stamps = [
    "[00:00] bootstrapping runner",
    `[00:00] loading suite '${suiteId}'`,
    `[00:00] resolved ${tests.length} test(s)`,
    "[00:01] warming HTTP client",
    "[00:01] auth handshake OK",
  ];
  tests.forEach((t, i) => {
    const start = 1500 + i * 900;
    stamps.push(`[${fmtStamp(start)}] ▶ ${t}`);
    stamps.push(`[${fmtStamp(start + 400)}]   step: prepare fixtures`);
    stamps.push(`[${fmtStamp(start + 700)}]   step: exercise endpoint`);
    stamps.push(`[${fmtStamp(start + 800)}]   ✓ ${t} passed`);
  });
  stamps.push(`[${fmtStamp(DEMO_RUN_MS - 200)}] finalizing report`);
  stamps.push(`[${fmtStamp(DEMO_RUN_MS)}] done`);

  const shown = Math.min(stamps.length, Math.max(2, Math.floor((upToMs / DEMO_RUN_MS) * stamps.length)));
  return stamps.slice(0, shown);
}

function fmtStamp(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function demoResults(suiteId: string, tests: string[], envName: string) {
  const failureMap: Record<string, string> = {
    "checkout_starts": "Timeout waiting for payment iframe (>5s).",
    "orders_get": "Expected 200 but got 502 from /orders/{id}.",
    "webhook_dispatch": "Signature mismatch on retry #2.",
  };
  const alwaysFailInProd = envName.toLowerCase().includes("prod");
  return tests.map((t, i) => {
    const fail = failureMap[t] && (alwaysFailInProd || i % 4 === 3);
    return {
      name: t,
      outcome: fail ? "failed" : "passed",
      duration: 0.4 + Math.random() * 1.6,
      message: fail ? failureMap[t] : "OK",
    };
  });
}

// ============================================================
// Environments (read-only)
// ============================================================
export const listEnvironments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return getConfiguredEnvs().map((e) => ({
      id: e.id,
      name: e.name,
      base_url: e.base_url,
      demo: !!e.demo,
    }));
  });

export const getRunnerConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { demoMode: isDemoMode() };
  });

// ============================================================
// Health & capabilities
// ============================================================
export const getAgentHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ envId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const env = getEnv(data.envId);
    if (!env) return { envId: data.envId, envName: data.envId, up: false, status: 0, error: "Unknown env" };
    if (env.demo) {
      const up = !env.name.toLowerCase().includes("production") || Math.random() > 0.15;
      return { envId: env.id, envName: env.name, up, status: up ? 200 : 503, demo: true };
    }
    try {
      const res = await agentFetch(env.base_url, env.api_key, "/health", { method: "GET" });
      return { envId: env.id, envName: env.name, up: res.ok, status: res.status };
    } catch (e) {
      return { envId: env.id, envName: env.name, up: false, status: 0, error: String(e) };
    }
  });

export const getCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ envId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const env = getEnv(data.envId);
    if (!env) throw new Error("Unknown env");
    if (env.demo) return demoCapabilities();
    const res = await agentFetch(env.base_url, env.api_key, "/capabilities", { method: "GET" });
    if (!res.ok) throw new Error(`Capabilities fetch failed: ${res.status}`);
    return await res.json();
  });

// ============================================================
// Catalogs (raster + three_d)
// ============================================================
type CatalogValue = string | number | boolean | null;
type CatalogRecord = { name: string } & Record<string, CatalogValue>;
type CatalogResponse = { raster: CatalogRecord[]; three_d: CatalogRecord[] };

const DEMO_RASTER_NAMES = ["basemap-world", "elevation-30m", "landcover-2024", "sat-truecolor", "hillshade"];
const DEMO_THREEDS_NAMES = ["city-nyc", "city-sf", "terrain-alps", "buildings-eu", "assets-poi"];

function demoCatalog(envName: string): CatalogResponse {
  const isProd = envName.toLowerCase().includes("prod");
  const isStaging = envName.toLowerCase().includes("staging");
  const mkRaster = (name: string, i: number): CatalogRecord => ({
    name,
    version: isProd ? `1.${i}.0` : isStaging ? `1.${i}.1-rc` : `2.${i}.0-dev`,
    checksum: isProd ? `sha256:aaaa${i}` : isStaging ? `sha256:bbbb${i}` : `sha256:cccc${i}`,
    tiles: 1000 + i * 10 + (isProd ? 0 : isStaging ? 5 : 12),
    updated_at: isProd ? "2026-07-01" : isStaging ? "2026-07-15" : "2026-07-25",
  });
  const mkThree = (name: string, i: number): CatalogRecord => ({
    name,
    version: isProd ? `3.${i}.0` : isStaging ? `3.${i}.2` : `4.0.${i}-dev`,
    lod: isProd ? 3 : isStaging ? 3 : 4,
    triangles: 50_000 + i * 1200 + (isProd ? 0 : isStaging ? 100 : 800),
    textures: isProd ? "webp" : isStaging ? "webp" : "ktx2",
  });
  return {
    raster: DEMO_RASTER_NAMES.map(mkRaster),
    three_d: DEMO_THREEDS_NAMES.map(mkThree),
  };
}

async function fetchCatalog(env: EnvConfig): Promise<CatalogResponse> {
  if (env.demo) return demoCatalog(env.name);
  const [rasterRes, threeRes] = await Promise.all([
    agentFetch(env.base_url, env.api_key, "/catalog/raster", { method: "GET" }),
    agentFetch(env.base_url, env.api_key, "/catalog/three-d", { method: "GET" }),
  ]);
  const parse = async (r: Response): Promise<CatalogRecord[]> => {
    if (!r.ok) throw new Error(`catalog ${r.status}`);
    const body = await r.json();
    if (Array.isArray(body)) return body as CatalogRecord[];
    if (Array.isArray(body?.items)) return body.items as CatalogRecord[];
    if (Array.isArray(body?.records)) return body.records as CatalogRecord[];
    return [];
  };
  return { raster: await parse(rasterRes), three_d: await parse(threeRes) };
}

export const getCatalogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ envId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const env = getEnv(data.envId);
    if (!env) throw new Error("Unknown env");
    return await fetchCatalog(env);
  });

export const compareCatalogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ envIdA: z.string().min(1), envIdB: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const envA = getEnv(data.envIdA);
    const envB = getEnv(data.envIdB);
    if (!envA || !envB) throw new Error("Unknown env");
    const [a, b] = await Promise.all([fetchCatalog(envA), fetchCatalog(envB)]);
    return {
      a: { id: envA.id, name: envA.name, ...a },
      b: { id: envB.id, name: envB.name, ...b },
    };
  });

// ============================================================
// Executions
// ============================================================
export const startExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        envIds: z.array(z.string().min(1)).min(1),
        suiteId: z.string().min(1),
        testIds: z.array(z.string()).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const out: Array<{ executionRowId: string; envName: string; error?: string }> = [];
    for (const envId of data.envIds) {
      const env = getEnv(envId);
      if (!env) {
        out.push({ executionRowId: "", envName: envId, error: "Unknown env" });
        continue;
      }
      let agentExecId: string | null = null;
      let status = "running";
      let errorMsg: string | null = null;

      if (env.demo) {
        agentExecId = `demo:${crypto.randomUUID()}`;
      } else {
        try {
          const res = await agentFetch(env.base_url, env.api_key, "/execute", {
            method: "POST",
            body: JSON.stringify({ suite_id: data.suiteId, test_ids: data.testIds ?? null }),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Agent /execute ${res.status}: ${text}`);
          }
          const body = (await res.json()) as { execution_id: string; status: string };
          agentExecId = body.execution_id;
          status = body.status ?? "running";
        } catch (e) {
          status = "failed";
          errorMsg = String(e);
        }
      }

      const { data: row, error } = await context.supabase
        .from("executions")
        .insert({
          user_id: context.userId,
          environment_id: null,
          environment_name: env.name,
          suite_id: data.suiteId,
          test_ids: data.testIds ?? null,
          agent_execution_id: agentExecId,
          status,
          error: errorMsg,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      out.push({ executionRowId: row.id, envName: env.name, error: errorMsg ?? undefined });
    }
    return { executions: out };
  });

export const pollExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ executionRowId: z.string().uuid(), sinceLines: z.number().int().min(0).default(0) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("executions")
      .select("*")
      .eq("id", data.executionRowId)
      .single();
    if (error || !row) throw new Error("Execution not found");

    const agentExecId: string | null = row.agent_execution_id;
    const isDemo = !!agentExecId && agentExecId.startsWith("demo:");

    // ------- DEMO STREAM -------
    if (isDemo) {
      const startedAt = new Date(row.start_time).getTime();
      const elapsed = Date.now() - startedAt;
      const testIds: string[] = Array.isArray(row.test_ids) && row.test_ids.length
        ? (row.test_ids as any[]).map(String)
        : (DEMO_SUITES.find((s) => s.suite_id === row.suite_id)?.tests ?? []);
      const allLines = demoLogLines(row.suite_id, testIds, elapsed);
      const newLogLines = allLines.slice(data.sinceLines);

      const done = elapsed >= DEMO_RUN_MS;
      const updates: Record<string, unknown> = { logs: allLines.join("\n") };
      let results: any = row.results;
      let status: string = row.status;
      let endTime = row.end_time;
      let duration = row.duration;

      if (done && row.status === "running") {
        results = demoResults(row.suite_id, testIds, row.environment_name);
        const anyFail = results.some((r: any) => r.outcome !== "passed");
        status = anyFail ? "failed" : "completed";
        endTime = new Date().toISOString();
        duration = DEMO_RUN_MS / 1000;
        updates.status = status;
        updates.results = results;
        updates.end_time = endTime;
        updates.duration = duration;
      }
      await context.supabase.from("executions").update(updates as any).eq("id", row.id);

      return {
        status,
        newLogLines,
        totalLines: allLines.length,
        results,
        error: row.error,
        endTime,
        duration,
      };
    }

    // ------- REAL AGENT -------
    if (!agentExecId) {
      return {
        status: row.status,
        newLogLines: [] as string[],
        totalLines: 0,
        results: row.results,
        error: row.error,
        endTime: row.end_time,
        duration: row.duration,
      };
    }
    const env = getConfiguredEnvs().find((e) => e.name === row.environment_name);
    const baseUrl = env?.base_url ?? "";
    const apiKey = env?.api_key ?? null;

    let allLines: string[] = [];
    try {
      const logsRes = await agentFetch(baseUrl, apiKey, `/executions/${agentExecId}/logs/lines`, { method: "GET" });
      if (logsRes.ok) {
        const body = await logsRes.json();
        if (Array.isArray(body)) allLines = body.map(String);
        else if (Array.isArray(body?.lines)) allLines = body.lines.map(String);
        else if (typeof body?.logs === "string") allLines = body.logs.split("\n");
      }
    } catch { /* tolerate */ }

    const newLogLines = allLines.slice(data.sinceLines);

    let statusBody: any = null;
    try {
      const statusRes = await agentFetch(baseUrl, apiKey, `/executions/${agentExecId}/status`, { method: "GET" });
      if (statusRes.ok) statusBody = await statusRes.json();
    } catch { /* ignore */ }

    const updates: Record<string, unknown> = { logs: allLines.join("\n") };
    if (statusBody) {
      updates.status = statusBody.status;
      if (statusBody.end_time) updates.end_time = statusBody.end_time;
      if (typeof statusBody.duration === "number") updates.duration = statusBody.duration;
      if (statusBody.results) updates.results = statusBody.results;
      if (statusBody.error) updates.error = statusBody.error;
    }
    await context.supabase.from("executions").update(updates as any).eq("id", row.id);

    return {
      status: statusBody?.status ?? row.status,
      newLogLines,
      totalLines: allLines.length,
      results: statusBody?.results ?? row.results,
      error: statusBody?.error ?? row.error,
      endTime: statusBody?.end_time ?? row.end_time,
      duration: statusBody?.duration ?? row.duration,
    };
  });

export const listExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("executions")
      .select("id, environment_name, suite_id, status, start_time, end_time, duration, results, error, agent_execution_id")
      .order("start_time", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data;
  });

export const getExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("executions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============================================================
// Seed demo executions for a fresh user (idempotent)
// ============================================================
export const seedDemoExecutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("executions")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return { inserted: 0 };

    const now = Date.now();
    const mk = (offsetMin: number, envName: string, suiteId: string, forcePass?: boolean) => {
      const suite = DEMO_SUITES.find((s) => s.suite_id === suiteId)!;
      const tests = suite.tests;
      const results = demoResults(suiteId, tests, envName).map((r) => forcePass ? { ...r, outcome: "passed", message: "OK" } : r);
      const anyFail = results.some((r) => r.outcome !== "passed");
      const start = new Date(now - offsetMin * 60_000);
      const dur = 6 + Math.random() * 4;
      const end = new Date(start.getTime() + dur * 1000);
      return {
        user_id: context.userId,
        environment_id: null,
        environment_name: envName,
        suite_id: suiteId,
        test_ids: null as any,
        agent_execution_id: `demo:${crypto.randomUUID()}`,
        status: anyFail ? "failed" : "completed",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration: dur,
        results,
        logs: demoLogLines(suiteId, tests, DEMO_RUN_MS).join("\n"),
        error: null as string | null,
      };
    };

    const rows = [
      mk(3, "staging (demo)", "smoke", true),
      mk(18, "production (demo)", "smoke"),
      mk(42, "dev (demo)", "api-sanity", true),
      mk(90, "production (demo)", "billing"),
      mk(180, "staging (demo)", "api-sanity", true),
      mk(360, "production (demo)", "smoke", true),
    ];
    const { error } = await context.supabase.from("executions").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
