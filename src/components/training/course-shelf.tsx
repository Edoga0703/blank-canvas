import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { 
  Play, 
  Clock, 
  LayoutGrid, 
  Bookmark, 
  ChevronLeft, 
  ChevronRight 
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Course {
  id: string;
  title: string;
  duration: string;
  lessons: number;
  thumbnail: string;
}

interface CourseShelfProps {
  courses: Course[];
}

export function CourseShelf({ courses }: CourseShelfProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { 
      loop: false, 
      align: "start",
      slidesToScroll: 1,
      containScroll: "trimSnaps"
    }, 
    [Autoplay({ delay: 4000, stopOnInteraction: true })]
  );

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback((api: any) => {
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect(emblaApi);
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  return (
    <div className="relative group/shelf px-0">
      {/* Removed lateral fading overlays as requested */}

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-2 py-6 ml-[2px]">
          {courses.map((course) => (
            <Link 
              key={course.id}
              to="/app/treinamentos/$courseId"
              params={{ courseId: course.id }}
              className="flex-[0_0_180px] md:flex-[0_0_210px] aspect-[2/3] relative group cursor-pointer rounded-[20px] overflow-hidden bg-white border border-[#E7EAEE] transition-all duration-300 hover:scale-[1.04] hover:z-40 shadow-sm hover:shadow-md"
            >
              <img src={course.thumbnail} className="w-full h-full object-cover" loading="lazy" />
              
              {/* Central Play Overlay - visible on hover */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10">
                <div className="size-16 rounded-full bg-primary flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)] transition-transform group-hover:scale-110">
                  <Play className="size-6 text-white fill-white ml-1" />
                </div>
                <span className="mt-4 text-xs font-medium text-white uppercase tracking-wider">Assistir</span>
              </div>

              {/* Hover Glow Border */}
              <div className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ring-2 ring-primary ring-inset" />
            </Link>
          ))}
        </div>
      </div>

      {/* Navigation Buttons - Simple and outside cards */}
      {canScrollPrev && (
        <button 
          onClick={scrollPrev}
          className="absolute -left-10 top-1/2 -translate-y-1/2 z-40 text-[#7B8794] hover:text-[#12263A] transition-all p-2"
          aria-label="Anterior"
        >
          <ChevronLeft className="size-8" strokeWidth={1.5} />
        </button>
      )}
      
      {canScrollNext && (
        <button 
          onClick={scrollNext}
          className="absolute -right-10 top-1/2 -translate-y-1/2 z-40 text-[#7B8794] hover:text-[#12263A] transition-all p-2"
          aria-label="Próximo"
        >
          <ChevronRight className="size-8" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
