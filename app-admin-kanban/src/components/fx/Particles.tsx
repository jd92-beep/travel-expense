// Lightweight 2D-canvas particle drift for the `balanced` effects tier (phones/tablets):
// a plain rewrite of app-compact's particles.tsx concept (no Tailwind/clsx, no mouse
// magnetism — just a calm ambient drift, cheap enough to run on a mid-range phone).
// StrictMode-safe: one `useEffect` owns the rAF loop and tears it down completely.
import { useEffect, useRef } from "react";

const DOT_COUNT = 60;
const COLORS = ["105, 167, 255", "76, 169, 201"]; // accent, teal (rgb triples for canvas)

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  color: string;
};

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = canvas.parentElement;
    let width = container?.clientWidth || 1;
    let height = container?.clientHeight || 1;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const dots: Dot[] = Array.from({ length: DOT_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 6, // px/s
      vy: (Math.random() - 0.5) * 6,
      r: 0.6 + Math.random() * 1.4,
      alpha: 0.15 + Math.random() * 0.35,
      color: COLORS[Math.random() < 0.5 ? 0 : 1],
    }));

    const sizeCanvas = () => {
      width = container?.clientWidth || 1;
      height = container?.clientHeight || 1;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    let rafId = 0;
    let paused = false;
    let lastT = performance.now();

    const tick = (t: number) => {
      if (paused) return;
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        dot.x += dot.vx * dt;
        dot.y += dot.vy * dt;
        if (dot.x < -10) dot.x = width + 10;
        if (dot.x > width + 10) dot.x = -10;
        if (dot.y < -10) dot.y = height + 10;
        if (dot.y > height + 10) dot.y = -10;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${dot.color}, ${dot.alpha})`;
        ctx.fill();
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => sizeCanvas());
    if (container) resizeObserver.observe(container);

    const onVisibilityChange = () => {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(rafId);
      } else {
        paused = false;
        lastT = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      paused = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
