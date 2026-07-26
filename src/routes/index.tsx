import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FlaskConical, Activity, FileText, Server } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sanity Agent Runner" },
      { name: "description", content: "Run sanity tests across your environments with live logs and reports." },
      { property: "og:title", content: "Sanity Agent Runner" },
      { property: "og:description", content: "Run sanity tests across environments with live logs and reports." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
      else setChecked(true);
    });
  }, [navigate]);
  if (!checked) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background">
      <div className="max-w-5xl mx-auto px-6 py-24">
        <div className="flex items-center gap-2 mb-8">
          <FlaskConical className="w-6 h-6 text-primary" />
          <span className="font-semibold">Sanity Agent Runner</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Run sanity tests across every environment
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mb-10">
          Trigger test suites on your per-env sanity agents, follow live execution logs, and browse
          historical reports — all from one control panel.
        </p>
        <div className="flex gap-3 mb-16">
          <Button asChild size="lg"><Link to="/auth">Sign in to start</Link></Button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Server, title: "Multi-env selection", desc: "Fan out one run across dev, staging, prod agents." },
            { icon: Activity, title: "Live streaming logs", desc: "Follow execution line-by-line as it happens." },
            { icon: FileText, title: "History & reports", desc: "Every past run stored with pass/fail details." },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-lg border bg-card">
              <f.icon className="w-6 h-6 text-primary mb-3" />
              <div className="font-semibold mb-1">{f.title}</div>
              <div className="text-sm text-muted-foreground">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
