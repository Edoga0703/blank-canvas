import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { 
  Play, 
  ChevronLeft, 
  CheckCircle2, 
  Circle,
  Clock,
  ChevronRight,
  ChevronDown,
  Maximize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrainingLayout } from "@/components/training/training-layout";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { getCourseDetails, markLessonComplete } from "@/lib/training.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/treinamentos/$courseId")({
  loader: async () => {
    return { timestamp: Date.now() };
  },
  component: CourseViewerPage,
});

function CourseViewerPage() {
  const { courseId } = Route.useParams();
  const [course, setCourse] = useState<any>(null);
  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  
  const fetchCourseDetails = useServerFn(getCourseDetails);
  const markComplete = useServerFn(markLessonComplete);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        console.log("Loading details for course:", courseId);
        
        // Use hard fallback if it's a mock ID
        if (courseId === 'mock-course-1' || courseId.startsWith('mock-')) {
          console.log("Using manual mock data for:", courseId);
          const data = {
            id: courseId,
            title: 'Bem-vindo à Capi Conversa Academy',
            description: 'Comece sua jornada dominando as principais ferramentas do Capi Conversa.',
            modules: [
              {
                id: 'mock-mod-1',
                title: 'Primeiros Passos',
                lessons: [
                  { 
                    id: 'mock-less-1', 
                    title: 'Visão Geral do Sistema', 
                    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
                    duration: '05:00',
                    description: 'Aprenda a navegar e configurar o seu ambiente de trabalho.'
                  }
                ]
              }
            ]
          };
          setCourse(data);
          setActiveLesson(data.modules[0].lessons[0]);
          setExpandedModules([data.modules[0].id]);
          setLoading(false);
          return;
        }

        const data = await fetchCourseDetails({ data: { courseId } });
        console.log("Course details loaded:", data);
        setCourse(data);
        if (data && data.modules?.[0]?.lessons?.[0]) {
          setActiveLesson(data.modules[0].lessons[0]);
          setExpandedModules([data.modules[0].id]);
        }
      } catch (err) {
        console.error("Error loading course details:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId, fetchCourseDetails]);

  const toggleModule = (id: string) => {
    setExpandedModules(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleLessonComplete = async (lessonId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await markComplete({ data: { lessonId, userId: user.id } });
      // Update local state to show checkmark
      setCourse((prev: any) => ({
        ...prev,
        modules: prev.modules.map((m: any) => ({
          ...m,
          lessons: m.lessons.map((l: any) => 
            l.id === lessonId ? { ...l, completed: true } : l
          )
        }))
      }));
    }
  };

  if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">Carregando curso...</div>;
  if (!course) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">Curso não encontrado.</div>;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans" id="training-viewer-root">
      {/* Top Header */}
      <header className="h-16 border-b border-white/5 flex items-center px-6 justify-between bg-[#0A0A0A] sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/app/treinamentos" className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ChevronLeft className="size-6 text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold tracking-tight uppercase text-zinc-400">{course.title}</h1>
            <p className="text-xs text-zinc-500">{activeLesson?.title}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Player Area */}
        <main className="flex-1 overflow-y-auto bg-black flex flex-col">
          <div className="aspect-video w-full max-w-[1200px] mx-auto mt-8 relative bg-zinc-900 shadow-2xl overflow-hidden">
            {activeLesson?.video_url ? (
              <div className="w-full h-full relative">
                {activeLesson.video_url.includes('youtube.com') || activeLesson.video_url.includes('youtu.be') ? (
                  <>
                    <iframe 
                      src={`${activeLesson.video_url.replace('watch?v=', 'embed/').split('&')[0]}?rel=0&modestbranding=1&showinfo=0&controls=1&iv_load_policy=3&disablekb=1`}
                      className="w-full h-full absolute inset-0 scale-[1.01]"
                      allowFullScreen
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                    {/* Overlay para esconder o logo do YouTube que aparece no final/início e o título */}
                    <div className="absolute top-0 right-0 w-32 h-20 bg-black/0 pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-24 h-12 bg-black/0 pointer-events-none" />
                  </>
                ) : activeLesson.video_url.includes('vimeo.com') ? (
                  <iframe 
                    src={`https://player.vimeo.com/video/${activeLesson.video_url.split('/').pop()}`}
                    className="w-full h-full"
                    allowFullScreen
                    frameBorder="0"
                  />
                ) : (
                  <video 
                    src={activeLesson.video_url} 
                    controls 
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center flex-col gap-4 text-zinc-500">
                <Play className="size-16 opacity-20" />
                <span>Vídeo indisponível</span>
              </div>
            )}
          </div>

          <div className="max-w-[1200px] mx-auto w-full px-6 py-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold">{activeLesson?.title}</h2>
              <Button 
                onClick={() => handleLessonComplete(activeLesson.id)}
                className={cn(
                  "gap-2 px-6 rounded-full font-semibold transition-all",
                  activeLesson?.completed ? "bg-green-500 hover:bg-green-600" : "bg-primary hover:bg-primary/90"
                )}
              >
                {activeLesson?.completed ? (
                  <>
                    <CheckCircle2 className="size-5" />
                    Concluída
                  </>
                ) : (
                  "Concluir Aula"
                )}
              </Button>
            </div>
            <p className="text-zinc-400 leading-relaxed max-w-3xl">
              {activeLesson?.description || course.description}
            </p>
          </div>
        </main>

        {/* Sidebar Lesson List */}
        <aside className="w-[380px] border-l border-white/5 bg-[#0A0A0A] hidden md:flex flex-col">
          <div className="p-6 border-b border-white/5">
            <h3 className="font-bold text-lg mb-1">Conteúdo do Curso</h3>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Clock className="size-3" />
              <span>{course.modules.length} Módulos</span>
              <span>•</span>
              <span>{course.modules.reduce((acc: number, m: any) => acc + m.lessons.length, 0)} Aulas</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {course.modules.map((module: any, idx: number) => (
              <div key={module.id} className="mb-2">
                <button 
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-600">{(idx + 1).toString().padStart(2, '0')}</span>
                    <span className="font-semibold text-sm">{module.title}</span>
                  </div>
                  <ChevronDown className={cn("size-4 text-zinc-500 transition-transform", expandedModules.includes(module.id) && "rotate-180")} />
                </button>

                {expandedModules.includes(module.id) && (
                  <div className="mt-1 space-y-1 px-2">
                    {module.lessons.map((lesson: any) => (
                      <button
                        key={lesson.id}
                        onClick={() => setActiveLesson(lesson)}
                        className={cn(
                          "w-full flex items-center gap-4 p-3 rounded-lg transition-all group",
                          activeLesson?.id === lesson.id ? "bg-primary/10 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                        )}
                      >
                        <div className="relative">
                          {lesson.completed ? (
                            <CheckCircle2 className="size-5 text-green-500" />
                          ) : (
                            <Circle className="size-5 text-zinc-700 group-hover:text-zinc-500" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium line-clamp-1">{lesson.title}</p>
                          <span className="text-[10px] text-zinc-600">{lesson.duration}</span>
                        </div>
                        {activeLesson?.id === lesson.id && <Play className="size-3 fill-primary text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
