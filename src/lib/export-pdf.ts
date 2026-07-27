import { jsPDF } from "jspdf";

function fmtDate(v: any) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

export function exportExecutionPdf(exec: any) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - margin) { doc.addPage(); y = margin; }
  };
  const text = (s: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setTextColor(...(opts.color ?? [20, 20, 20]));
    const x = margin + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(s, contentW - (opts.indent ?? 0));
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, x, y);
      y += size + 4;
    }
  };
  const rule = () => {
    ensure(10);
    doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 10;
  };

  // Header
  text("Execution Report", { size: 18, bold: true });
  text(`${exec.environment_name ?? "—"} · ${exec.suite_id ?? "—"}`, { size: 12, bold: true });
  y += 4;
  rule();

  // Summary
  const results = Array.isArray(exec.results) ? exec.results : [];
  const passed = results.filter((r: any) => r.outcome === "passed" || r.outcome === "success").length;
  const failed = results.length - passed;

  text("Summary", { size: 13, bold: true });
  text(`Status: ${exec.status ?? "—"}`);
  text(`Started: ${fmtDate(exec.start_time)}`);
  text(`Ended: ${fmtDate(exec.end_time)}`);
  text(`Duration: ${exec.duration != null ? Number(exec.duration).toFixed(2) + "s" : "—"}`);
  text(`Tests: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
  if (exec.agent_execution_id) text(`Agent execution ID: ${exec.agent_execution_id}`);
  y += 4;
  rule();

  // Error
  if (exec.error) {
    text("Error", { size: 13, bold: true, color: [180, 30, 30] });
    text(String(exec.error), { color: [120, 20, 20] });
    y += 4;
    rule();
  }

  // Per-test outcomes grouped by suite
  text("Test Results", { size: 13, bold: true });
  if (results.length === 0) {
    text("No test results recorded.", { color: [120, 120, 120] });
  } else {
    const groups = new Map<string, any[]>();
    for (const r of results) {
      const key = r?.suite_id ?? "(ungrouped)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const [suiteId, items] of groups.entries()) {
      y += 4;
      const p = items.filter((x: any) => x.outcome === "passed" || x.outcome === "success").length;
      const f = items.length - p;
      text(`Suite: ${suiteId}  (${items.length} tests, ${p} passed, ${f} failed)`, { size: 12, bold: true, color: [40, 40, 40] });
      items.forEach((r: any, i: number) => {
        const ok = r.outcome === "passed" || r.outcome === "success";
        const warnOnly = !ok && Array.isArray(r.markers) && r.markers.some((x: any) => /^warn(n)?ing$/i.test(String(x)));
        const rawName = r.name ?? r.test_id ?? r.id ?? "Test";
        const last = String(rawName).includes("::") ? String(rawName).split("::").pop()! : String(rawName).split("/").pop() ?? String(rawName);
        const pretty = last.replace(/^test[_-]+/i, "").replace(/_/g, " ").trim() || String(rawName);
        const color: [number, number, number] = ok ? [30, 120, 60] : warnOnly ? [180, 140, 20] : [180, 30, 30];
        ensure(20);
        text(`${i + 1}. ${pretty}  —  ${r.outcome ?? "unknown"}${warnOnly ? "  (warning only)" : ""}`, {
          bold: true,
          color,
          indent: 8,
        });
        if (r.description) text(`Description: ${r.description}`, { indent: 20, color: [90, 90, 90] });
        if (r.duration != null) text(`Duration: ${Number(r.duration).toFixed(2)}s`, { indent: 20, color: [110, 110, 110] });
        if (r.message) text(`Message: ${r.message}`, { indent: 20 });
        if (r.error) text(`Error: ${typeof r.error === "string" ? r.error : JSON.stringify(r.error, null, 2)}`, { indent: 20, color: [140, 30, 30] });
        y += 2;
      });
    }
  }




  const safe = (s: string) => (s || "report").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
  const name = `execution_${safe(exec.environment_name)}_${safe(exec.suite_id)}_${exec.id?.slice(0, 8) ?? "report"}.pdf`;
  doc.save(name);
}
