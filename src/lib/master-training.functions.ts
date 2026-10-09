import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMasterTrainingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const supabase = context.supabase;
    const { data: categories } = await supabase
      .from('training_categories')
      .select('*, courses:training_courses(id, title)')
      .order('order', { ascending: true });

    const { data: courses } = await supabase
      .from('training_courses')
      .select('*, category:training_categories(name)')
      .order('created_at', { ascending: false });

    const { data: banners } = await supabase
      .from('training_banners')
      .select('*')
      .order('sort_order', { ascending: true });

    return { 
      categories: categories || [], 
      courses: courses || [], 
      banners: banners || [] 
    };
  });

export const saveTrainingCategory = createServerFn({ method: "POST" })
  .inputValidator((data: any) => z.object({
    id: z.string().optional(),
    name: z.string(),
    order: z.number().default(0)
  }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    let res;
    if (data.id) {
      res = await supabase.from('training_categories').update(data).eq('id', data.id);
    } else {
      res = await supabase.from('training_categories').insert(data);
    }
    
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  });

export const saveTrainingCourse = createServerFn({ method: "POST" })
  .inputValidator((data: any) => z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    thumbnail: z.string().optional(),
    instructor: z.string().optional(),
    category_id: z.string().optional(),
    is_published: z.boolean().default(false)
  }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    let res;
    if (data.id) {
      res = await supabase.from('training_courses').update(data).eq('id', data.id);
    } else {
      res = await supabase.from('training_courses').insert(data);
    }
    
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  });

export const saveTrainingBanner = createServerFn({ method: "POST" })
  .inputValidator((data: any) => z.object({
    id: z.string().optional(),
    image_url: z.string(),
    link_url: z.string().optional(),
    is_active: z.boolean().default(true),
    sort_order: z.number().default(0)
  }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    let res;
    if (data.id) {
      res = await supabase.from('training_banners').update(data).eq('id', data.id);
    } else {
      res = await supabase.from('training_banners').insert(data);
    }
    
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  });
