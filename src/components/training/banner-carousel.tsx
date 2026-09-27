import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  highlight: string;
  image_url: string;
  tags: string[];
}

interface BannerCarouselProps {
  banners: Banner[];
}

export function BannerCarousel({ banners }: BannerCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { 
      loop: true, 
      align: "center",
      slidesToScroll: 1,
    }, 
    [Autoplay({ delay: 5000, stopOnInteraction: false })]
  );

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  if (!banners || banners.length === 0) return null;

  return (
    <div className="relative group/banners w-full">
      <div className="overflow-hidden rounded-[20px] shadow-sm border border-[#E7EAEE]" ref={emblaRef}>
        <div className="flex">
          {banners.map((banner) => (
            <div key={banner.id} className="flex-[0_0_100%] min-w-0 relative aspect-[4/1] min-h-[220px]">
              <img 
                src={banner.image_url} 
                className="w-full h-full object-cover" 
                alt={banner.title} 
              />
              
              {/* Overlay Gradient - Optional, removed to keep it just the image as requested */}
              {/* <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 via-blue-900/40 to-transparent" /> */}
              
              {/* Logo/Brand placeholder on the right if needed, but removing all text for now */}
              {/* <div className="absolute inset-0 flex items-center justify-between px-8 md:px-20">
                ...
              </div> */}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button 
            onClick={scrollPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-40 bg-black/50 hover:bg-primary text-white p-2 rounded-full opacity-0 group-hover/banners:opacity-100 transition-all active:scale-90"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button 
            onClick={scrollNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-40 bg-black/50 hover:bg-primary text-white p-2 rounded-full opacity-0 group-hover/banners:opacity-100 transition-all active:scale-90"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-40">
          {banners.map((_, idx) => (
            <div 
              key={idx} 
              className="size-1.5 rounded-full bg-white/30" 
            />
          ))}
        </div>
      )}
    </div>
  );
}
