import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
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
  GitCompareArrows, Equal, AlertTriangle,
} from "lucide-react";
import { exportExecutionPdf } from "@/lib/export-pdf";

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

  // In demo mode, seed a few historical executions once so Reports isn't empty.
  useEffect(() => {
    if (!config?.demoMode) return;
    seed().then((r) => {
      if (r.inserted > 0) {
        qc.invalidateQueries({ queryKey: ["executions"] });
        toast.success(`Loaded ${r.inserted} demo report${r.inserted === 1 ? "" : "s"}`);
      }
    }).catch(() => { /* non-fatal */ });
  }, [config?.demoMode]); // eslint-disable-line

  const signOut = async () => {
    await supabase.auth.signOut();
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
            <span className="text-muted-foreground">{userEmail}</span>
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
            <TabsTrigger value="reports"><FileText className="w-4 h-4 mr-1" />Reports</TabsTrigger>
            <TabsTrigger value="envs"><Server className="w-4 h-4 mr-1" />Environments</TabsTrigger>
          </TabsList>
          <TabsContent value="run"><RunTab /></TabsContent>
          <TabsContent value="compare"><CompareTab /></TabsContent>
          <TabsContent value="health"><HealthTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
          <TabsContent value="envs"><EnvironmentsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ============================================================
// Environments
// ============================================================
function EnvironmentsTab() {
  const list = useServerFn(listEnvironments);
  const { data: envs = [], isLoading } = useQuery({
    queryKey: ["envs"],
    queryFn: () => list(),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Environments</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Configured via the <code className="bg-muted px-1 rounded">AGENT_ENVIRONMENTS</code> deployment
          variable. Set a JSON array of <code className="bg-muted px-1 rounded">{`{name, base_url, api_key?}`}</code> entries to change them.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : envs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No environments configured.
          </div>
        ) : (
          <div className="divide-y">
            {envs.map((env: any) => (
              <div key={env.id} className="py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {env.name}
                    {env.demo && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px]">
                        <Sparkles className="w-3 h-3 mr-1" />mock
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{env.base_url}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
      envs.map((e: any) => health({ data: { envId: e.id } }).catch((err) => ({
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
          <div className="text-sm text-muted-foreground py-8 text-center">Add an environment first.</div>
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
function RunTab() {
  const list = useServerFn(listEnvironments);
  const caps = useServerFn(getCapabilities);
  const start = useServerFn(startExecution);
  const { data: envs = [] } = useQuery({ queryKey: ["envs"], queryFn: () => list() });
  const qc = useQueryClient();

  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [capsSourceEnv, setCapsSourceEnv] = useState<string>("");
  const [suites, setSuites] = useState<any[]>([]);
  const [suiteId, setSuiteId] = useState<string>("");
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [runningIds, setRunningIds] = useState<string[]>([]);

  const suite = useMemo(() => suites.find((s) => s.suite_id === suiteId), [suites, suiteId]);

  const loadCaps = async (envId: string) => {
    setCapsSourceEnv(envId);
    setLoadingCaps(true);
    try {
      const res = await caps({ data: { envId } });
      setSuites(res.suites ?? []);
    } catch (e: any) {
      toast.error("Failed to load capabilities: " + e.message);
      setSuites([]);
    } finally {
      setLoadingCaps(false);
    }
  };

  const toggleEnv = (id: string) => {
    setSelectedEnvs((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    if (!capsSourceEnv) loadCaps(id);
  };

  const runNow = async () => {
    if (!selectedEnvs.length || !suiteId) return;
    try {
      const res = await start({
        data: {
          envIds: selectedEnvs,
          suiteId,
          testIds: selectedTests.length ? selectedTests : null,
        },
      });
      toast.success(`Started ${res.executions.length} execution(s)`);
      setRunningIds(res.executions.map((e) => e.executionRowId));
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
            <div className="text-sm text-muted-foreground">Add environments in the Environments tab.</div>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>2. Choose suite &amp; tests</CardTitle>
          {selectedEnvs.length > 0 && (
            <Select value={capsSourceEnv} onValueChange={loadCaps}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Load capabilities from..." />
              </SelectTrigger>
              <SelectContent>
                {envs.filter((e: any) => selectedEnvs.includes(e.id)).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {loadingCaps ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>
          ) : suites.length === 0 ? (
            <div className="text-sm text-muted-foreground">Select an environment to load available suites.</div>
          ) : (
            <div className="space-y-4">
              <Select value={suiteId} onValueChange={(v) => { setSuiteId(v); setSelectedTests([]); }}>
                <SelectTrigger><SelectValue placeholder="Pick a suite" /></SelectTrigger>
                <SelectContent>
                  {suites.map((s) => (
                    <SelectItem key={s.suite_id} value={s.suite_id}>
                      {s.suite_id} <span className="text-muted-foreground ml-2">({s.domain})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suite && (
                <div>
                  <div className="text-sm font-medium mb-2">Tests <span className="text-muted-foreground font-normal">(none selected = run all)</span></div>
                  <div className="grid md:grid-cols-2 gap-2">
                    {suite.tests.map((t: string) => (
                      <label key={t} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted/50 text-sm">
                        <Checkbox
                          checked={selectedTests.includes(t)}
                          onCheckedChange={() => setSelectedTests((s) => s.includes(t) ? s.filter(x => x !== t) : [...s, t])}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={runNow} disabled={!selectedEnvs.length || !suiteId}>
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

// ============================================================
// Live streaming panel
// ============================================================
function LiveExecution({ executionId }: { executionId: string }) {
  const poll = useServerFn(pollExecution);
  const get = useServerFn(getExecution);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [meta, setMeta] = useState<any>(null);
  const sinceRef = useRef(0);
  const stopped = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    get({ data: { id: executionId } }).then((r) => setMeta(r));
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [logs.length]);

  return (
    <div className="border rounded-lg">
      <div className="p-3 border-b flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="font-medium">{meta?.environment_name ?? "..."}</span>
          <span className="text-muted-foreground text-sm">· {meta?.suite_id}</span>
        </div>
        {meta?.duration != null && (
          <span className="text-xs text-muted-foreground">{Number(meta.duration).toFixed(2)}s</span>
        )}
      </div>
      <ScrollArea className="h-64" ref={scrollRef as any}>
        <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">
          {logs.length ? logs.join("\n") : status === "running" ? "Waiting for logs..." : "(no logs)"}
        </pre>
      </ScrollArea>
      {meta?.error && (
        <Alert variant="destructive" className="m-3">
          <AlertDescription className="text-xs whitespace-pre-wrap">{meta.error}</AlertDescription>
        </Alert>
      )}
      {(status === "completed" || status === "failed") && meta?.results && (
        <div className="p-3 border-t space-y-1">
          <ResultsList results={meta.results} />
        </div>
      )}
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <StatusBadge status={selected?.status ?? ""} />
              <span className="flex-1 min-w-0 truncate">{selected?.environment_name} · {selected?.suite_id}</span>
              {selected && (
                <Button variant="outline" size="sm" onClick={() => exportExecutionPdf(selected)}>
                  <Download className="w-4 h-4 mr-1" />PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto space-y-4">
            <div className="text-xs text-muted-foreground">
              Started {selected && new Date(selected.start_time).toLocaleString()}
              {selected?.duration != null && ` · ${Number(selected.duration).toFixed(2)}s`}
            </div>
            {selected?.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs whitespace-pre-wrap">{selected.error}</AlertDescription>
              </Alert>
            )}
            {Array.isArray(selected?.results) && <ResultsList results={selected.results} />}
            {selected?.logs && (
              <div>
                <div className="text-sm font-medium mb-2">Logs</div>
                <ScrollArea className="h-64 border rounded">
                  <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">{selected.logs}</pre>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
