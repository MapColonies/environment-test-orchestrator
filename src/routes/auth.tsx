import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlaskConical } from "lucide-react";

// Naive constant credentials — anyone who knows them can log in.
const NAIVE_USER = "admin";
const NAIVE_PASS = "admin";
// Backing Supabase account used transparently so server functions still work.
const BACKING_EMAIL = "admin@sanity.local";
const BACKING_PASSWORD = "sanity-admin-shared-secret";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sanity Agent Runner" },
      { name: "description", content: "Sign in to run sanity tests across environments." },
    ],
  }),
  component: AuthPage,
});

async function ensureBackingSession() {
  const { error } = await supabase.auth.signInWithPassword({
    email: BACKING_EMAIL,
    password: BACKING_PASSWORD,
  });
  if (!error) return;
  // Account doesn't exist yet — create it, then sign in.
  const { error: signUpErr } = await supabase.auth.signUp({
    email: BACKING_EMAIL,
    password: BACKING_PASSWORD,
    options: { emailRedirectTo: window.location.origin + "/dashboard" },
  });
  if (signUpErr && !/registered/i.test(signUpErr.message)) throw signUpErr;
  const { error: retryErr } = await supabase.auth.signInWithPassword({
    email: BACKING_EMAIL,
    password: BACKING_PASSWORD,
  });
  if (retryErr) throw retryErr;
}

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (username !== NAIVE_USER || password !== NAIVE_PASS) {
      setLoading(false);
      setError("Invalid username or password.");
      return;
    }
    try {
      await ensureBackingSession();
      navigate({ to: "/dashboard", replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-full bg-primary/10">
              <FlaskConical className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Sanity Agent Runner</CardTitle>
          <CardDescription>Sign in to run sanity tests across environments</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : "Sign in"}
            </Button>
            <Alert>
              <AlertDescription className="text-xs">
                Demo credentials — <code className="bg-muted px-1 rounded">admin</code> / <code className="bg-muted px-1 rounded">admin</code>
              </AlertDescription>
            </Alert>
          </form>
          <div className="text-center mt-4 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Back home</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
