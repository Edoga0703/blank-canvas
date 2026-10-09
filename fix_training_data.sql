-- Inserindo categorias se não existirem (com base na estrutura da migração 20260813015202)
INSERT INTO public.training_categories (name, "order")
VALUES 
  ('Comece por Aqui', 1),
  ('Metrics CRM', 2),
  ('Marketing', 3),
  ('Vendas', 4),
  ('Automação', 5)
ON CONFLICT DO NOTHING;

-- Inserindo cursos de exemplo para "Comece por Aqui"
DO $$
DECLARE
    cat_id UUID;
    course_id UUID;
    module_id UUID;
BEGIN
    SELECT id INTO cat_id FROM public.training_categories WHERE name = 'Comece por Aqui' LIMIT 1;
    
    IF cat_id IS NOT NULL THEN
        -- Curso 1
        INSERT INTO public.training_courses (category_id, title, description, thumbnail, "order", instructor)
        VALUES (cat_id, 'Bem-vindo à Academia Metrix', 'Conheça sua nova casa de treinamentos.', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80', 1, 'Equipe Metrix')
        RETURNING id INTO course_id;

        INSERT INTO public.training_modules (course_id, title, "order")
        VALUES (course_id, 'Boas-vindas', 1)
        RETURNING id INTO module_id;

        INSERT INTO public.training_lessons (module_id, title, description, video_url, duration, "order")
        VALUES (module_id, 'Introdução', 'Como aproveitar ao máximo a plataforma.', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '05:00', 1);

        -- Curso 2
        INSERT INTO public.training_courses (category_id, title, description, thumbnail, "order", instructor)
        VALUES (cat_id, 'Configurações Iniciais', 'Configure seu CRM do zero.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', 2, 'Suporte Metrix')
        RETURNING id INTO course_id;

        INSERT INTO public.training_modules (course_id, title, "order")
        VALUES (course_id, 'Passo a Passo', 1)
        RETURNING id INTO module_id;

        INSERT INTO public.training_lessons (module_id, title, description, video_url, duration, "order")
        VALUES (module_id, 'Primeiros Passos', 'Configurando sua conta.', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '10:00', 1);
    END IF;
END $$;
