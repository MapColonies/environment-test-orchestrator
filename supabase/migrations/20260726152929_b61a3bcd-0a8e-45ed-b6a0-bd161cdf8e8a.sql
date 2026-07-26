
CREATE TABLE public.environments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  api_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.environments TO authenticated;
GRANT ALL ON public.environments TO service_role;
ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users manage environments" ON public.environments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.environments(id) ON DELETE SET NULL,
  environment_name TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  test_ids JSONB,
  agent_execution_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  duration NUMERIC,
  results JSONB,
  logs TEXT NOT NULL DEFAULT '',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executions TO authenticated;
GRANT ALL ON public.executions TO service_role;
ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users view executions" ON public.executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users create own executions" ON public.executions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth users update own executions" ON public.executions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth users delete own executions" ON public.executions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_executions_user ON public.executions(user_id, created_at DESC);
CREATE INDEX idx_executions_env ON public.executions(environment_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER environments_updated_at BEFORE UPDATE ON public.environments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER executions_updated_at BEFORE UPDATE ON public.executions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
