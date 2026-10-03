import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, Contrast, Sun, ZoomIn, ZoomOut, Maximize, SunDim } from "lucide-react";
import { Slider } from "@/components/ui/slider";

type Pt = { x: number; y: number };

/**
 * Lightweight X-ray / photo viewer (M4a): pinch-to-zoom, pan (one or two fingers / mouse drag),
 * double-tap 2x, wheel zoom, 90° rotation, colour inversion (negative), brightness & contrast.
 */
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState<Pt>({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [invert, setInvert] = useState(false);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [tools, setTools] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ dist: number; scale: number; mid: Pt; pos: Pt } | null>(null);
  const lastTap = useRef(0);

  const clamp = (s: number) => Math.min(8, Math.max(0.5, s));
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); setRot(0); setBright(100); setContrast(100); setInvert(false); };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clamp(s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 280) {
        setScale((s) => (s > 1.05 ? 1 : 2));
        if (scale > 1.05) setPos({ x: 0, y: 0 });
      }
      lastTap.current = now;
    }
    startGesture();
  }
  function startGesture() {
    const pts = [...pointers.current.values()];
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    const dist = pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture.current = { dist, scale, mid, pos };
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    setPos({ x: g.pos.x + mid.x - g.mid.x, y: g.pos.y + mid.y - g.mid.y });
    if (pts.length > 1 && g.dist > 0) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      setScale(clamp(g.scale * (d / g.dist)));
    }
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture();
    else gesture.current = null;
  }

  const filter = `${invert ? "invert(1) " : ""}brightness(${bright}%) contrast(${contrast}%)`;
  const btn = "flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted";

  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      <div
        ref={box}
        className="relative flex-1 touch-none select-none overflow-hidden bg-foreground"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ cursor: gesture.current ? "grabbing" : "grab" }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-full max-w-full"
          style={{
            transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${scale}) rotate(${rot}deg)`,
            filter,
            transition: gesture.current ? "none" : "transform 120ms ease-out",
          }}
        />
        <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 border-t bg-card p-1">
        <button aria-label="Pomniejsz" className={btn} onClick={() => setScale((s) => clamp(s / 1.25))}><ZoomOut className="h-4 w-4" /></button>
        <button aria-label="Powiększ" className={btn} onClick={() => setScale((s) => clamp(s * 1.25))}><ZoomIn className="h-4 w-4" /></button>
        <button aria-label="Obróć w lewo" className={btn} onClick={() => setRot((r) => r - 90)}><RotateCcw className="h-4 w-4" /></button>
        <button aria-label="Obróć w prawo" className={btn} onClick={() => setRot((r) => r + 90)}><RotateCw className="h-4 w-4" /></button>
        <button
          aria-label="Negatyw"
          aria-pressed={invert}
          className={`${btn} ${invert ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
          onClick={() => setInvert((v) => !v)}
        >
          <Contrast className="h-4 w-4" />
        </button>
        <button aria-label="Jasność i kontrast" aria-pressed={tools} className={`${btn} ${tools ? "bg-muted" : ""}`} onClick={() => setTools((v) => !v)}>
          <Sun className="h-4 w-4" />
        </button>
        <button aria-label="Resetuj widok" className={btn} onClick={reset}><Maximize className="h-4 w-4" /></button>
      </div>
      {tools && (
        <div className="grid gap-3 border-t bg-card p-3 text-xs">
          <label className="flex items-center gap-3"><SunDim className="h-4 w-4" /> Jasność
            <Slider className="flex-1" min={40} max={220} step={5} value={[bright]} onValueChange={(v) => setBright(v[0] ?? 100)} />
          </label>
          <label className="flex items-center gap-3"><Contrast className="h-4 w-4" /> Kontrast
            <Slider className="flex-1" min={40} max={300} step={5} value={[contrast]} onValueChange={(v) => setContrast(v[0] ?? 100)} />
          </label>
        </div>
      )}
    </div>
  );
}
