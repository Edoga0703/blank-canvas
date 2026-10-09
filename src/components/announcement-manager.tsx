import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveAnnouncements } from "@/lib/announcements.functions";
import { X, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";

export function AnnouncementManager() {
  const getAnnouncements = useServerFn(getActiveAnnouncements);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAnnouncements();
        setAnnouncements(data);
      } catch (e) {
        console.error("Failed to load announcements", e);
      }
    };
    load();
    
    // Load dismissed from local storage
    const saved = localStorage.getItem("metrix_dismissed_announcements");
    if (saved) setDismissed(JSON.parse(saved));
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem("metrix_dismissed_announcements", JSON.stringify(next));
  };

  useEffect(() => {
    const activeAnns = announcements.filter(a => !dismissed.includes(a.id));
    
    const timers = activeAnns.map(a => {
      if (a.display_time_seconds && a.display_time_seconds > 0) {
        return setTimeout(() => {
          dismiss(a.id);
        }, a.display_time_seconds * 1000);
      }
      return null;
    }).filter(Boolean);

    return () => timers.forEach(t => clearTimeout(t as any));
  }, [announcements, dismissed]);

  const active = announcements.filter(a => !dismissed.includes(a.id));

  if (active.length === 0) return null;

  const sizeClass: Record<string, string> = {
    sm: "max-w-[380px]",
    md: "max-w-[560px]",
    lg: "max-w-[800px]",
    full: "max-w-[95%]",
  };

  return (
    <div className="space-y-4 mb-6">
      {active.map((a) => (
        <Card key={a.id} className={`relative overflow-hidden border-[color:var(--hairline)] shadow-sm animate-in fade-in slide-in-from-top-4 duration-500 w-full mx-auto ${sizeClass[a.size] ?? sizeClass.md}`}>
          <button 
            onClick={() => dismiss(a.id)}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors z-10"
          >
            <X className="size-4" />
          </button>
          
          <div className="flex flex-col md:flex-row items-center gap-6 p-6">
            {a.image_url && (
              <div className="shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden bg-muted grid place-items-center">
                <img src={a.image_url} alt="" className="w-full h-full object-contain p-4" />
              </div>
            )}
            <div className="flex-1 text-center md:text-left space-y-2">
              <h3 className="text-xl font-bold tracking-tight">{a.title}</h3>
              {a.content && <p className="text-muted-foreground leading-relaxed">{a.content}</p>}
              
              {a.button_text && (
                <div className="pt-2">
                  {a.button_link?.startsWith('http') ? (
                    <Button asChild className="rounded-xl h-10 px-6 font-semibold bg-[color:var(--brand-text)]">
                      <a href={a.button_link} target="_blank" rel="noopener noreferrer">
                        {a.button_text} <ExternalLink className="ml-2 size-4" />
                      </a>
                    </Button>
                  ) : (
                    <Button asChild className="rounded-xl h-10 px-6 font-semibold bg-[color:var(--brand-text)]">
                      <Link to={a.button_link || '#'}>
                        {a.button_text} <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
