import { useState, useEffect } from "react";
import { TrainingLayout } from "@/components/training/training-layout";
import { CourseShelf } from "@/components/training/course-shelf";
import { BannerCarousel } from "@/components/training/banner-carousel";
import academyLogo from "@/assets/academy-logo.png.asset.json";
import { useServerFn } from "@tanstack/react-start";
import { getTrainingHomeData } from "@/lib/training.functions";

interface Course {
  id: string;
  title: string;
  duration: string;
  lessons: number;
  thumbnail: string;
  progress?: number;
  lesson?: string;
}

interface Category {
  id: string;
  name: string;
  courses: Course[];
}

export function AcademiaMetricsHome() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const fetchHomeData = useServerFn(getTrainingHomeData);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchHomeData();
        setData(result);
      } catch (error) {
        console.error("Erro ao carregar dados da Academia:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchHomeData]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#050505] z-[100] flex flex-col items-center justify-center gap-8">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse" />
          <img src={academyLogo.url} alt="Capi Conversa Academy" className="size-32 relative z-10" />
        </div>
        <div className="w-48 h-1 bg-zinc-900 rounded-full overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 bg-primary w-0 animate-[loading-bar_2s_ease-in-out_infinite]" />
        </div>
        <span className="text-zinc-500 font-medium tracking-[0.2em] text-xs uppercase">Capi Conversa Academy</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <TrainingLayout>
      <div className="animate-in fade-in duration-1000 pb-20">
        <section className="relative w-full px-6 md:px-8 pt-8">
          <BannerCarousel banners={data.banners} />
        </section>

        <div className="px-6 md:px-8 space-y-12 mt-8 relative z-20">
          {data.categories.map((cat: Category) => (
            <section key={cat.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium tracking-tight text-white/90">{cat.name}</h3>
              </div>
              <CourseShelf courses={cat.courses} />
            </section>
          ))}
        </div>
      </div>
    </TrainingLayout>
  );
}
