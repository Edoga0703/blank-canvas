CREATE TABLE public.plugin_suggestion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES public.company(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    titulo text NOT NULL,
    descricao text,
    status text NOT NULL DEFAULT 'pendente', -- pendente, analise, aprovado, recusado
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.plugin_suggestion TO authenticated;
GRANT ALL ON public.plugin_suggestion TO service_role;

ALTER TABLE public.plugin_suggestion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own suggestions"
ON public.plugin_suggestion
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own suggestions"
ON public.plugin_suggestion
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all suggestions"
ON public.plugin_suggestion
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
