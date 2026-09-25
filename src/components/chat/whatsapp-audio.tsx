import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Deterministic pseudo-waveform based on url so bars are stable
function makeBars(url: string, n = 42): number[] {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const v = (h % 1000) / 1000; // 0..1
    // shape: center a bit taller
    const shape = 0.35 + 0.65 * Math.sin((i / n) * Math.PI);
    arr.push(0.25 + v * 0.75 * shape);
  }
  return arr;
}

const SPEEDS = [1, 1.5, 2] as const;

export function WhatsappAudio({ src, outbound }: { src: string; outbound: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const bars = useMemo(() => makeBars(src), [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  function cycleSpeed() {
    const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length]!);
  }


  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onLoaded = () => setDur(a.duration || 0);
    const onEnd = () => { setPlaying(false); setCur(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  }

  function seekAt(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = p * dur;
    setCur(a.currentTime);
  }

  const progress = dur ? cur / dur : 0;
  const btnColor = outbound ? "bg-white/20 hover:bg-white/30 text-white" : "bg-[color:var(--brand)]/10 hover:bg-[color:var(--brand)]/20 text-[color:var(--brand)]";
  const activeBar = outbound ? "bg-white" : "bg-[color:var(--brand)]";
  const idleBar = outbound ? "bg-white/40" : "bg-foreground/25";

  return (
    <div className="flex items-center gap-2.5 min-w-[240px] py-0.5">
      <button
        type="button"
        onClick={toggle}
        className={`shrink-0 size-9 rounded-full grid place-items-center transition ${btnColor}`}
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-[1px]" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          role="slider"
          aria-valuenow={Math.round(progress * 100)}
          onClick={seekAt}
          className="flex items-center gap-[2px] h-8 cursor-pointer"
        >
          {bars.map((b, i) => {
            const on = i / bars.length <= progress;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-colors ${on ? activeBar : idleBar}`}
                style={{ height: `${Math.round(b * 100)}%`, minWidth: 2 }}
              />
            );
          })}
        </div>
        <div className={`text-[10.5px] mt-0.5 tabular-nums ${outbound ? "opacity-80" : "text-muted-foreground"}`}>
          {fmt(playing || cur > 0 ? cur : dur)}
        </div>
      </div>
      <button
        type="button"
        onClick={cycleSpeed}
        title="Velocidade de reprodução"
        className={`shrink-0 h-6 min-w-[34px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums transition ${btnColor}`}
      >
        {speed.toString().replace(".", ",")}x
      </button>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}
