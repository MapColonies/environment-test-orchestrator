import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listEnvironments,
  getRunnerConfig,
  getAgentHealth,
  getCapabilities,
  startExecution,
  pollExecution,
  listExecutions,
  getExecution,
  seedDemoExecutions,
  compareCatalogs,
  getCorsTargets,
} from "@/lib/agent.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  FlaskConical, LogOut, RefreshCw, Play, CheckCircle2, XCircle,
  Loader2, Server, Activity, FileText, ChevronRight, Circle, Download, Sparkles,
  GitCompareArrows, Equal, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { exportExecutionPdf } from "@/lib/export-pdf";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sanity Agent Runner" },
      { name: "description", content: "Trigger sanity test suites, monitor live logs, browse reports." },
    ],
  }),
  component: Dashboard,
});

// ============================================================
// Dashboard
// ============================================================
function Dashboard() {
  const navigate = useNavigate();
  const cfg = useServerFn(getRunnerConfig);
  const seed = useServerFn(seedDemoExecutions);
  const qc = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["runner-config"], queryFn: () => cfg() });

  useEffect(() => {
    if (!config?.demoMode) return;
    seed().then((r: any) => {
      if ((r.inserted ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ["executions"] });
        toast.success(`Loaded ${r.inserted} demo reports`);
      }
    }).catch(() => { /* non-fatal */ });
  }, [config?.demoMode]); // eslint-disable-line

  const signOut = async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <span className="font-semibold">Sanity Agent Runner</span>
            {config?.demoMode && (
              <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                <Sparkles className="w-3 h-3 mr-1" /> Demo mode
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">admin</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {config?.demoMode && (
          <Alert className="mb-4 border-amber-500/40">
            <Sparkles className="w-4 h-4" />
            <AlertDescription className="text-sm">
              Running with mock data. To connect real agents, set the <code className="text-xs bg-muted px-1 rounded">AGENT_ENVIRONMENTS</code> deployment
              variable to a JSON array like <code className="text-xs bg-muted px-1 rounded">[{'{'}"name":"staging","base_url":"https://agent.staging.example.com"{'}'}]</code>.
            </AlertDescription>
          </Alert>
        )}
        <Tabs defaultValue="run">
          <TabsList>
            <TabsTrigger value="run"><Play className="w-4 h-4 mr-1" />Run</TabsTrigger>
            <TabsTrigger value="compare"><GitCompareArrows className="w-4 h-4 mr-1" />Compare</TabsTrigger>
            <TabsTrigger value="health"><Activity className="w-4 h-4 mr-1" />Agent health</TabsTrigger>
            <TabsTrigger value="cors"><ShieldCheck className="w-4 h-4 mr-1" />CORS test</TabsTrigger>
            <TabsTrigger value="reports"><FileText className="w-4 h-4 mr-1" />Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="run"><RunTab /></TabsContent>
          <TabsContent value="compare"><CompareTab /></TabsContent>
          <TabsContent value="health"><HealthTab /></TabsContent>
          <TabsContent value="cors"><CorsTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ============================================================
// Health
// ============================================================
function HealthTab() {
  const list = useServerFn(listEnvironments);
  const health = useServerFn(getAgentHealth);
  const { data: envs = [] } = useQuery({ queryKey: ["envs"], queryFn: () => list() });
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);

  const check = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.all(
      envs.map((e: any) => health({ data: { envId: e.id } }).catch((err: any) => ({
        envId: e.id, envName: e.name, up: false, status: 0, error: String(err),
      }))),
    );
    const map: Record<string, any> = {};
    for (const r of results) map[r.envId] = r;
    setStatuses(map);
    setRefreshing(false);
  }, [envs, health]);

  useEffect(() => { if (envs.length) check(); }, [envs.length]); // eslint-disable-line

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Agent health</CardTitle>
        <Button variant="outline" size="sm" onClick={check} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {envs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No environments configured.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {envs.map((env: any) => {
              const s = statuses[env.id];
              const up = s?.up;
              return (
                <div key={env.id} className="p-4 border rounded-lg flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      <span className="font-medium">{env.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 break-all">{env.base_url}</div>
                    {s?.error && <div className="text-xs text-destructive mt-1">{s.error}</div>}
                  </div>
                  {s === undefined ? (
                    <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />checking</Badge>
                  ) : up ? (
                    <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Up</Badge>
                  ) : (
                    <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Down</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Run
// ============================================================
type PerEnvConfig = {
  suiteIds: string[];
  testIds: string[];
  suites: any[];
  loading: boolean;
};

function RunTab() {
  const list = useServerFn(listEnvironments);
  const caps = useServerFn(getCapabilities);
  const start = useServerFn(startExecution);
  const { data: envs = [] } = useQuery({ queryKey: ["envs"], queryFn: () => list() });
  const qc = useQueryClient();

  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [perEnv, setPerEnv] = useState<Record<string, PerEnvConfig>>({});
  const [runningIds, setRunningIds] = useState<string[]>([]);

  const ensureCaps = useCallback(async (envId: string) => {
    setPerEnv((p) => ({
      ...p,
      [envId]: p[envId] ?? { suiteIds: [], testIds: [], suites: [], loading: true },
    }));
    try {
      const res = await caps({ data: { envId } });
      setPerEnv((p) => ({
        ...p,
        [envId]: { ...(p[envId] ?? { suiteIds: [], testIds: [] }), suites: res.suites ?? [], loading: false },
      }));
    } catch (e: any) {
      toast.error(`Failed to load capabilities for ${envId}: ${e.message}`);
      setPerEnv((p) => ({
        ...p,
        [envId]: { ...(p[envId] ?? { suiteIds: [], testIds: [] }), suites: [], loading: false },
      }));
    }
  }, [caps]);

  const toggleEnv = (id: string) => {
    setSelectedEnvs((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      if (!s.includes(id) && !perEnv[id]) ensureCaps(id);
      return next;
    });
  };

  const updatePerEnv = (envId: string, patch: Partial<PerEnvConfig>) => {
    setPerEnv((p) => ({ ...p, [envId]: { ...(p[envId] ?? { suiteIds: [], testIds: [], suites: [], loading: false }), ...patch } }));
  };

  const canRun = selectedEnvs.length > 0 && selectedEnvs.every((id) => (perEnv[id]?.suiteIds.length ?? 0) > 0);

  const runNow = async () => {
    if (!canRun) return;
    try {
      const runs = selectedEnvs.map((envId) => ({
        envId,
        suiteIds: perEnv[envId].suiteIds,
        testIds: perEnv[envId].testIds.length ? perEnv[envId].testIds : null,
      }));
      const res = await start({ data: { runs } });
      toast.success(`Started ${res.executions.length} execution(s)`);
      setRunningIds(res.executions.map((e: any) => e.executionRowId));
      qc.invalidateQueries({ queryKey: ["executions"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>1. Select environments</CardTitle></CardHeader>
        <CardContent>
          {envs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No environments configured.</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {envs.map((env: any) => (
                <label key={env.id} className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={selectedEnvs.includes(env.id)} onCheckedChange={() => toggleEnv(env.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{env.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{env.base_url}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEnvs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>2. Choose suites &amp; tests per environment</CardTitle></CardHeader>
          <CardContent>
            <div
              className={`grid gap-4 ${
                selectedEnvs.length === 1
                  ? "grid-cols-1"
                  : selectedEnvs.length === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {selectedEnvs.map((envId) => {
                const env = envs.find((e: any) => e.id === envId);
                const cfg = perEnv[envId];
                return (
                  <EnvConfigPanel
                    key={envId}
                    envName={env?.name ?? envId}
                    cfg={cfg}
                    onChange={(patch) => updatePerEnv(envId, patch)}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="lg" onClick={runNow} disabled={!canRun}>
          <Play className="w-4 h-4 mr-1" /> Run on {selectedEnvs.length} env{selectedEnvs.length === 1 ? "" : "s"}
        </Button>
      </div>

      {runningIds.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Live execution</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {runningIds.map((id) => <LiveExecution key={id} executionId={id} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EnvConfigPanel({
  envName, cfg, onChange,
}: {
  envName: string;
  cfg: PerEnvConfig | undefined;
  onChange: (patch: Partial<PerEnvConfig>) => void;
}) {
  const suites = cfg?.suites ?? [];
  const suiteIds = cfg?.suiteIds ?? [];
  const testIds = cfg?.testIds ?? [];

  const toggleSuite = (sid: string) => {
    const next = suiteIds.includes(sid) ? suiteIds.filter((x) => x !== sid) : [...suiteIds, sid];
    // Drop selected tests that no longer belong to any selected suite.
    const kept = new Set(
      suites.filter((s: any) => next.includes(s.suite_id)).flatMap((s: any) => s.tests),
    );
    onChange({ suiteIds: next, testIds: testIds.filter((t) => kept.has(t)) });
  };

  const toggleTest = (t: string) => {
    onChange({ testIds: testIds.includes(t) ? testIds.filter((x) => x !== t) : [...testIds, t] });
  };

  const activeSuites = suites.filter((s: any) => suiteIds.includes(s.suite_id));

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4" />
        <span className="font-medium text-sm">{envName}</span>
      </div>
      {cfg?.loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />Loading capabilities...
        </div>
      ) : suites.length === 0 ? (
        <div className="text-sm text-muted-foreground">No suites available.</div>
      ) : (
        <>
          <div>
            <div className="text-xs font-medium mb-1 text-muted-foreground">Suites</div>
            <div className="space-y-1">
              {suites.map((s: any) => (
                <label key={s.suite_id} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted/50 text-sm">
                  <Checkbox checked={suiteIds.includes(s.suite_id)} onCheckedChange={() => toggleSuite(s.suite_id)} />
                  <span className="font-medium">{s.suite_id}</span>
                  <span className="text-xs text-muted-foreground">({s.domain})</span>
                </label>
              ))}
            </div>
          </div>
          {activeSuites.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1 text-muted-foreground">
                Tests <span className="font-normal">(none selected = run all)</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {activeSuites.map((s: any) => (
                  <div key={s.suite_id}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground py-1">{s.suite_id}</div>
                    <div className="space-y-1">
                      {s.tests.map((t: string) => (
                        <label key={s.suite_id + t} className="flex items-center gap-2 p-1.5 border rounded cursor-pointer hover:bg-muted/50 text-xs">
                          <Checkbox checked={testIds.includes(t)} onCheckedChange={() => toggleTest(t)} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Live streaming panel
// ============================================================
function LiveExecution({ executionId }: { executionId: string }) {
  const poll = useServerFn(pollExecution);
  const get = useServerFn(getExecution);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [meta, setMeta] = useState<any>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const sinceRef = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    get({ data: { id: executionId } }).then((r: any) => setMeta(r));
  }, [executionId, get]);

  useEffect(() => {
    stopped.current = false;
    let timer: any;
    const tick = async () => {
      try {
        const res = await poll({ data: { executionRowId: executionId, sinceLines: sinceRef.current } });
        if (res.newLogLines.length) {
          setLogs((L) => [...L, ...res.newLogLines]);
          sinceRef.current = res.totalLines;
        }
        setStatus(res.status);
        setMeta((m: any) => ({ ...m, results: res.results, error: res.error, end_time: res.endTime, duration: res.duration }));
        if (res.status === "completed" || res.status === "failed") {
          stopped.current = true;
          return;
        }
      } catch (e) { console.error(e); }
      if (!stopped.current) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => { stopped.current = true; clearTimeout(timer); };
  }, [executionId, poll]);

  const done = status === "completed" || status === "failed";
  // Newest lines first — user scrolls down for older entries; no auto-scroll needed.
  const displayLogs = useMemo(() => [...logs].reverse(), [logs]);

  return (
    <div className="border rounded-lg">
      <div className="p-3 border-b flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="font-medium">{meta?.environment_name ?? "..."}</span>
          <span className="text-muted-foreground text-sm">· {meta?.suite_id}</span>
        </div>
        <div className="flex items-center gap-3">
          {meta?.duration != null && (
            <span className="text-xs text-muted-foreground">{Number(meta.duration).toFixed(2)}s</span>
          )}
          {done && (
            <Button size="sm" variant="outline" onClick={() => setReportOpen(true)}>
              <FileText className="w-4 h-4 mr-1" /> View report
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="h-64">
        <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">
          {displayLogs.length ? displayLogs.join("\n") : status === "running" ? "Waiting for logs..." : "(no logs)"}
        </pre>
      </ScrollArea>
      {meta?.error && (
        <Alert variant="destructive" className="m-3">
          <AlertDescription className="text-xs whitespace-pre-wrap">{meta.error}</AlertDescription>
        </Alert>
      )}
      {done && meta?.results && (
        <div className="p-3 border-t space-y-1">
          <ResultsList results={meta.results} />
        </div>
      )}
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        execution={meta}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running") return <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />running</Badge>;
  if (status === "completed") return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />passed</Badge>;
  if (status === "failed") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />failed</Badge>;
  return <Badge variant="outline"><Circle className="w-3 h-3 mr-1" />{status}</Badge>;
}

function ResultsList({ results }: { results: any[] }) {
  if (!Array.isArray(results)) return null;
  return (
    <div className="space-y-1">
      {results.map((r, i) => {
        const passed = r.outcome === "passed" || r.outcome === "success";
        return (
          <div key={i} className="flex items-start gap-2 text-sm">
            {passed ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{Number(r.duration).toFixed(2)}s</span>
                <Badge variant={passed ? "outline" : "destructive"} className="text-[10px]">{r.outcome}</Badge>
              </div>
              {r.message && (
                <div className={`text-xs mt-1 whitespace-pre-wrap ${passed ? "text-muted-foreground" : "text-destructive"}`}>
                  {r.message}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Shared report dialog
// ============================================================
function ReportDialog({
  open, onOpenChange, execution,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  execution: any;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <StatusBadge status={execution?.status ?? ""} />
            <span className="flex-1 min-w-0 truncate">{execution?.environment_name} · {execution?.suite_id}</span>
            {execution && (
              <Button variant="outline" size="sm" onClick={() => exportExecutionPdf(execution)}>
                <Download className="w-4 h-4 mr-1" />PDF
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto space-y-4">
          <div className="text-xs text-muted-foreground">
            Started {execution && new Date(execution.start_time).toLocaleString()}
            {execution?.duration != null && ` · ${Number(execution.duration).toFixed(2)}s`}
          </div>
          {execution?.error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs whitespace-pre-wrap">{execution.error}</AlertDescription>
            </Alert>
          )}
          {Array.isArray(execution?.results) && <ResultsList results={execution.results} />}
          {execution?.logs && (
            <div>
              <div className="text-sm font-medium mb-2">Logs</div>
              <ScrollArea className="h-64 border rounded">
                <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">
                  {String(execution.logs).split("\n").reverse().join("\n")}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Reports
// ============================================================
function ReportsTab() {
  const list = useServerFn(listExecutions);
  const get = useServerFn(getExecution);
  const { data: rows = [], refetch, isLoading } = useQuery({
    queryKey: ["executions"],
    queryFn: () => list(),
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState<any>(null);

  const openReport = async (id: string) => {
    const row = await get({ data: { id } });
    setSelected(row);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Execution history</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" />Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No executions yet.</div>
        ) : (
          <div className="divide-y">
            {rows.map((r: any) => {
              const results = Array.isArray(r.results) ? r.results : [];
              const passed = results.filter((x: any) => x.outcome === "passed" || x.outcome === "success").length;
              const failed = results.length - passed;
              return (
                <div key={r.id} className="w-full py-3 flex items-center gap-3 hover:bg-muted/50 px-2">
                  <button onClick={() => openReport(r.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <StatusBadge status={r.status} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{r.environment_name} · {r.suite_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.start_time).toLocaleString()}
                        {r.duration != null && ` · ${Number(r.duration).toFixed(2)}s`}
                      </div>
                    </div>
                    {results.length > 0 && (
                      <div className="flex gap-2 text-xs">
                        {passed > 0 && <Badge className="bg-green-600 hover:bg-green-600">{passed} passed</Badge>}
                        {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
                      </div>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Download PDF report"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const row = await get({ data: { id: r.id } });
                        exportExecutionPdf(row);
                      } catch (err: any) {
                        toast.error(err?.message ?? "Failed to export PDF");
                      }
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <ReportDialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)} execution={selected} />
    </Card>
  );
}

// ============================================================
// Compare (catalog diff between 2 envs) — single-scroll unified table
// ============================================================
type CatalogRecord = { name: string } & Record<string, string | number | boolean | null>;
type CatalogResp = { id: string; name: string; raster: CatalogRecord[]; three_d: CatalogRecord[] };

function CompareTab() {
  const list = useServerFn(listEnvironments);
  const compare = useServerFn(compareCatalogs);
  const { data: envs = [] } = useQuery({ queryKey: ["envs"], queryFn: () => list() });
  const [envA, setEnvA] = useState<string>("");
  const [envB, setEnvB] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ a: CatalogResp; b: CatalogResp } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!envA || !envB || envA === envB) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await compare({ data: { envIdA: envA, envIdB: envB } });
      setResult(r as any);
    } catch (e: any) {
      setError(e?.message ?? "Compare failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Compare catalogs across two environments</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
            <div>
              <div className="text-xs mb-1 text-muted-foreground">Environment A</div>
              <Select value={envA} onValueChange={setEnvA}>
                <SelectTrigger><SelectValue placeholder="Pick environment" /></SelectTrigger>
                <SelectContent>
                  {envs.map((e: any) => (
                    <SelectItem key={e.id} value={e.id} disabled={e.id === envB}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <GitCompareArrows className="w-5 h-5 text-muted-foreground mb-2" />
            <div>
              <div className="text-xs mb-1 text-muted-foreground">Environment B</div>
              <Select value={envB} onValueChange={setEnvB}>
                <SelectTrigger><SelectValue placeholder="Pick environment" /></SelectTrigger>
                <SelectContent>
                  {envs.map((e: any) => (
                    <SelectItem key={e.id} value={e.id} disabled={e.id === envA}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={!envA || !envB || envA === envB || loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <GitCompareArrows className="w-4 h-4 mr-1" />}
              Compare
            </Button>
          </div>
          {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {result && (
        <UnifiedCatalogTable
          aName={result.a.name}
          bName={result.b.name}
          sections={[
            { title: "Raster catalog", aRecs: result.a.raster, bRecs: result.b.raster },
            { title: "3D catalog", aRecs: result.a.three_d, bRecs: result.b.three_d },
          ]}
        />
      )}
    </div>
  );
}

type Section = { title: string; aRecs: CatalogRecord[]; bRecs: CatalogRecord[] };

function UnifiedCatalogTable({
  aName, bName, sections,
}: {
  aName: string; bName: string; sections: Section[];
}) {
  type Row =
    | { kind: "section"; title: string; summary: string; status: "identical" | "differ" | "structure" }
    | { kind: "field"; record: string; field: string; a: any; b: any; changed: boolean; firstOfRecord: boolean };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const s of sections) {
      const namesA = s.aRecs.map((r) => r.name);
      const namesB = s.bRecs.map((r) => r.name);
      const sameCount = namesA.length === namesB.length;
      const nameSetSame = sameCount &&
        [...namesA].sort().every((n, i) => n === [...namesB].sort()[i]);

      let status: "identical" | "differ" | "structure" = "identical";
      let diffCount = 0;

      const allNames = Array.from(new Set([...namesA, ...namesB]));
      const perRecord: Array<{ name: string; changes: Array<{ field: string; a: any; b: any; changed: boolean }> }> = [];

      for (const name of allNames) {
        const ra = s.aRecs.find((r) => r.name === name);
        const rb = s.bRecs.find((r) => r.name === name);
        const fields = Array.from(new Set([
          ...(ra ? Object.keys(ra) : []),
          ...(rb ? Object.keys(rb) : []),
        ])).filter((f) => f !== "name");
        const changes = fields.map((f) => {
          const av = ra?.[f];
          const bv = rb?.[f];
          const changed = !ra || !rb || JSON.stringify(av) !== JSON.stringify(bv);
          if (changed) diffCount++;
          return { field: f, a: av, b: bv, changed };
        });
        perRecord.push({ name, changes });
      }

      if (!nameSetSame) status = "structure";
      else if (diffCount > 0) status = "differ";

      out.push({
        kind: "section",
        title: s.title,
        summary: `${namesA.length} vs ${namesB.length} records${diffCount ? ` · ${diffCount} field diff${diffCount === 1 ? "" : "s"}` : ""}`,
        status,
      });

      for (const rec of perRecord) {
        rec.changes.forEach((c, i) => {
          out.push({
            kind: "field",
            record: rec.name,
            field: c.field,
            a: c.a,
            b: c.b,
            changed: c.changed,
            firstOfRecord: i === 0,
          });
        });
      }
    }
    return out;
  }, [sections]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalog comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-[180px_160px_1fr_1fr_60px] text-xs font-medium bg-muted/60 px-3 py-2 border-b sticky top-0">
            <div>Record</div>
            <div>Field</div>
            <div className="truncate">{aName}</div>
            <div className="truncate">{bName}</div>
            <div className="text-right">Δ</div>
          </div>
          <ScrollArea className="h-[70vh]">
            <div className="divide-y">
              {rows.map((r, i) =>
                r.kind === "section" ? (
                  <div key={i} className="px-3 py-2 bg-muted/30 flex items-center justify-between">
                    <div className="font-semibold text-sm">{r.title}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{r.summary}</span>
                      {r.status === "identical" ? (
                        <Badge className="bg-green-600 hover:bg-green-600"><Equal className="w-3 h-3 mr-1" />identical</Badge>
                      ) : r.status === "differ" ? (
                        <Badge className="bg-amber-600 hover:bg-amber-600"><AlertTriangle className="w-3 h-3 mr-1" />differ</Badge>
                      ) : (
                        <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />structure</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    key={i}
                    className={`grid grid-cols-[180px_160px_1fr_1fr_60px] text-xs px-3 py-1.5 ${
                      r.changed ? "bg-amber-50 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <div className="font-medium truncate">{r.firstOfRecord ? r.record : ""}</div>
                    <div className="text-muted-foreground truncate">{r.field}</div>
                    <div className={`font-mono break-all ${r.changed ? "text-amber-700 dark:text-amber-400" : ""}`}>{fmtVal(r.a)}</div>
                    <div className={`font-mono break-all ${r.changed ? "text-amber-700 dark:text-amber-400" : ""}`}>{fmtVal(r.b)}</div>
                    <div className="text-right">
                      {r.changed ? (
                        <AlertTriangle className="w-3.5 h-3.5 inline text-amber-600" />
                      ) : (
                        <Equal className="w-3.5 h-3.5 inline text-muted-foreground/60" />
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtVal(v: unknown) {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

// ============================================================
// CORS test — browser-side fetch matrix per environment
// ============================================================
type CorsTarget = { name: string; url: string; token?: string | null };
type CorsMethod = "Token in Param" | "Token in Header" | "No Token (expect 401)";
type CorsCellState =
  | { state: "loading" }
  | { state: "success"; label: string }
  | { state: "error"; label: string };

function CorsTab() {
  const list = useServerFn(listEnvironments);
  const getTargets = useServerFn(getCorsTargets);
  const { data: envs = [] } = useQuery({ queryKey: ["envs"], queryFn: () => list() });

  return (
    <div className="mt-4 space-y-4">
      {envs.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground text-center">
          No environments configured.
        </CardContent></Card>
      ) : envs.map((env: any) => (
        <CorsEnvSection key={env.id} env={env} fetchTargets={() => getTargets({ data: { envId: env.id } })} />
      ))}
    </div>
  );
}

function CorsEnvSection({
  env, fetchTargets,
}: {
  env: any;
  fetchTargets: () => Promise<CorsTarget[]>;
}) {
  const [targets, setTargets] = useState<CorsTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await fetchTargets();
      setTargets(Array.isArray(list) ? list : []);
      setNonce((n) => n + 1);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load /cors-test");
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [fetchTargets]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-4 h-4" />{env.name}
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-1 break-all">{env.base_url}</div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />Re-run
        </Button>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-3"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
        {targets === null ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading targets…</div>
        ) : targets.length === 0 && !error ? (
          <div className="text-sm text-muted-foreground">No CORS targets returned.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {targets.map((t, i) => (
              <CorsBox key={`${nonce}-${i}-${t.url}`} target={t} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CorsBox({ target }: { target: CorsTarget }) {
  const methods: CorsMethod[] = ["Token in Param", "Token in Header", "No Token (expect 401)"];
  const [results, setResults] = useState<Record<CorsMethod, CorsCellState>>({
    "Token in Param": { state: "loading" },
    "Token in Header": { state: "loading" },
    "No Token (expect 401)": { state: "loading" },
  });

  useEffect(() => {
    let cancelled = false;
    const set = (m: CorsMethod, v: CorsCellState) => {
      if (!cancelled) setResults((r) => ({ ...r, [m]: v }));
    };

    const runOne = async (
      method: CorsMethod,
      url: string,
      init: RequestInit,
      isSuccess: (r: Response) => boolean = (r) => r.ok,
    ) => {
      try {
        const res = await fetch(url, init);
        if (isSuccess(res)) set(method, { state: "success", label: `Success (${res.status})` });
        else set(method, { state: "error", label: `Got ${res.status} ${res.statusText}` });
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (method === "No Token (expect 401)" && msg === "Failed to fetch") {
          set(method, { state: "success", label: "Success (CORS Block)" });
        } else {
          set(method, {
            state: "error",
            label: msg === "Failed to fetch" ? "Blocked by CORS (see DevTools)" : msg,
          });
        }
      }
    };

    const sep = target.url.includes("?") ? "&" : "?";
    const urlParam = target.token ? `${target.url}${sep}token=${target.token}` : target.url;
    const headers = new Headers();
    if (target.token) headers.set("x-api-key", target.token);

    runOne("Token in Param", urlParam, { method: "GET" });
    runOne("Token in Header", target.url, { method: "GET", headers, redirect: "follow" });
    runOne("No Token (expect 401)", target.url, { method: "GET" }, (r) => r.status === 401);

    return () => { cancelled = true; };
  }, [target.url, target.token]);

  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-sm font-semibold">{target.name}</div>
      <div className="text-[11px] text-muted-foreground break-all mb-2">{target.url}</div>
      <div className="space-y-2">
        {methods.map((m) => {
          const r = results[m];
          const cls = r.state === "loading"
            ? "bg-muted text-muted-foreground"
            : r.state === "success"
              ? "bg-green-600 text-white"
              : "bg-destructive text-destructive-foreground";
          return (
            <div key={m} className={`rounded px-2 py-1.5 text-xs ${cls}`}>
              <div className="font-medium">{m}</div>
              <div className="mt-0.5">
                {r.state === "loading" ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Loading…</span>
                ) : r.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
