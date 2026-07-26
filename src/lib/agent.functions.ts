import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  const res = await fetch(url, { ...init, headers });
  return res;
}

// -------- Environments CRUD --------
export const listEnvironments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("environments")
      .select("id, name, base_url, api_key, created_at, updated_at")
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertEnvironment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(64),
        base_url: z.string().url(),
        api_key: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      base_url: data.base_url,
      api_key: data.api_key ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("environments")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("environments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteEnvironment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("environments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Agent proxy --------
async function loadEnv(context: { supabase: any }, envId: string) {
  const { data, error } = await context.supabase
    .from("environments")
    .select("id, name, base_url, api_key")
    .eq("id", envId)
    .single();
  if (error || !data) throw new Error("Environment not found");
  return data;
}

export const getAgentHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ envId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const env = await loadEnv(context, data.envId);
    try {
      const res = await agentFetch(env.base_url, env.api_key, "/health", { method: "GET" });
      return {
        envId: env.id,
        envName: env.name,
        up: res.ok,
        status: res.status,
      };
    } catch (e) {
      return { envId: env.id, envName: env.name, up: false, status: 0, error: String(e) };
    }
  });

export const getCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ envId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const env = await loadEnv(context, data.envId);
    const res = await agentFetch(env.base_url, env.api_key, "/capabilities", { method: "GET" });
    if (!res.ok) throw new Error(`Capabilities fetch failed: ${res.status}`);
    return await res.json();
  });

// Start execution: creates DB row + calls agent /execute
export const startExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        envIds: z.array(z.string().uuid()).min(1),
        suiteId: z.string().min(1),
        testIds: z.array(z.string()).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const results: Array<{ executionRowId: string; envName: string; error?: string }> = [];
    for (const envId of data.envIds) {
      const env = await loadEnv(context, envId);
      let agentExecId: string | null = null;
      let status = "running";
      let errorMsg: string | null = null;
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

      const { data: row, error } = await context.supabase
        .from("executions")
        .insert({
          user_id: context.userId,
          environment_id: env.id,
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
      results.push({ executionRowId: row.id, envName: env.name, error: errorMsg ?? undefined });
    }
    return { executions: results };
  });

// Poll status + logs and persist
export const pollExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ executionRowId: z.string().uuid(), sinceLines: z.number().int().min(0).default(0) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("executions")
      .select("*, environments(base_url, api_key)")
      .eq("id", data.executionRowId)
      .single();
    if (error || !row) throw new Error("Execution not found");
    if (!row.agent_execution_id) {
      return {
        status: row.status,
        logs: row.logs ?? "",
        newLogLines: [] as string[],
        totalLines: 0,
        results: row.results,
        error: row.error,
        endTime: row.end_time,
        duration: row.duration,
      };
    }
    const baseUrl = row.environments?.base_url ?? "";
    const apiKey = row.environments?.api_key ?? null;

    // fetch logs as lines (streaming-friendly per spec)
    let allLines: string[] = [];
    try {
      const logsRes = await agentFetch(
        baseUrl,
        apiKey,
        `/executions/${row.agent_execution_id}/logs/lines`,
        { method: "GET" },
      );
      if (logsRes.ok) {
        const body = await logsRes.json();
        if (Array.isArray(body)) allLines = body.map(String);
        else if (Array.isArray(body?.lines)) allLines = body.lines.map(String);
        else if (typeof body?.logs === "string") allLines = body.logs.split("\n");
      }
    } catch { /* tolerate transient log fetch failures */ }

    const newLogLines = allLines.slice(data.sinceLines);
    const totalLines = allLines.length;

    // fetch status
    let statusBody: any = null;
    try {
      const statusRes = await agentFetch(
        baseUrl,
        apiKey,
        `/executions/${row.agent_execution_id}/status`,
        { method: "GET" },
      );
      if (statusRes.ok) statusBody = await statusRes.json();
    } catch { /* ignore */ }

    const updates: Record<string, unknown> = {
      logs: allLines.join("\n"),
    };
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
      totalLines,
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
