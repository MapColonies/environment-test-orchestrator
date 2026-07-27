import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ExecutionResult = {
  name: string;
  outcome: string;
  duration?: number;
  message?: string;
};

export type ExecutionRow = {
  id: string;
  environment_name: string;
  suite_id: string;
  test_ids: string[] | null;
  agent_execution_id: string | null;
  status: string;
  start_time: string;
  end_time: string | null;
  duration: number | null;
  results: ExecutionResult[] | null;
  logs: string | null;
  error: string | null;
};

export type ExecutionSummary = Pick<
  ExecutionRow,
  "id" | "environment_name" | "suite_id" | "status" | "start_time" | "end_time" | "duration" | "results" | "error" | "agent_execution_id"
>;

function reportsDir(): string {
  return process.env.REPORTS_DIR || path.resolve(process.cwd(), ".data/reports");
}

let initPromise: Promise<void> | null = null;
async function ensureDir(): Promise<void> {
  if (!initPromise) {
    initPromise = fs.mkdir(reportsDir(), { recursive: true }).then(() => undefined);
  }
  await initPromise;
}

function fileFor(id: string): string {
  // sanitize id
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(reportsDir(), `${safe}.json`);
}

async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}

// Per-id mutex to avoid concurrent writes clobbering each other during polling.
const locks = new Map<string, Promise<void>>();
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const p = new Promise<void>((r) => (release = r));
  locks.set(id, prev.then(() => p));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (locks.get(id) === prev.then(() => p)) locks.delete(id);
  }
}

export async function insertExecution(row: Omit<ExecutionRow, "id" | "start_time"> & Partial<Pick<ExecutionRow, "id" | "start_time">>): Promise<ExecutionRow> {
  await ensureDir();
  const full: ExecutionRow = {
    id: row.id ?? randomUUID(),
    start_time: row.start_time ?? new Date().toISOString(),
    end_time: row.end_time ?? null,
    duration: row.duration ?? null,
    results: row.results ?? null,
    logs: row.logs ?? null,
    error: row.error ?? null,
    environment_name: row.environment_name,
    suite_id: row.suite_id,
    test_ids: row.test_ids ?? null,
    agent_execution_id: row.agent_execution_id ?? null,
    status: row.status,
  };
  await writeAtomic(fileFor(full.id), JSON.stringify(full, null, 2));
  return full;
}

export async function getExecutionById(id: string): Promise<ExecutionRow | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(fileFor(id), "utf8");
    return JSON.parse(raw) as ExecutionRow;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function updateExecution(id: string, patch: Partial<ExecutionRow>): Promise<ExecutionRow | null> {
  await ensureDir();
  return withLock(id, async () => {
    const cur = await getExecutionById(id);
    if (!cur) return null;
    const next: ExecutionRow = { ...cur, ...patch, id: cur.id };
    await writeAtomic(fileFor(id), JSON.stringify(next, null, 2));
    return next;
  });
}

export async function listExecutionsSummary(limit = 100): Promise<ExecutionSummary[]> {
  await ensureDir();
  const dir = reportsDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const rows: ExecutionRow[] = [];
  await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(dir, f), "utf8");
          rows.push(JSON.parse(raw));
        } catch {
          /* skip corrupt file */
        }
      }),
  );
  rows.sort((a, b) => (a.start_time < b.start_time ? 1 : -1));
  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    environment_name: r.environment_name,
    suite_id: r.suite_id,
    status: r.status,
    start_time: r.start_time,
    end_time: r.end_time,
    duration: r.duration,
    results: r.results,
    error: r.error,
    agent_execution_id: r.agent_execution_id,
  }));
}

export async function countExecutions(): Promise<number> {
  await ensureDir();
  try {
    const files = await fs.readdir(reportsDir());
    return files.filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}
