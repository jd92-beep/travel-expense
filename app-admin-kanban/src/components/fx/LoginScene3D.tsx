// Login showpiece: a slowly rotating field of glowing points plus a faint wireframe
// icosahedron core, rendered with raw three.js (no react-three-fiber — keeps the bundle
// lean and the render loop fully under our control for cleanup/visibility/context-loss
// handling). Mounted only on the `full` effects tier (see LoginGate.tsx) and lazy-loaded
// so three.js never lands in the main chunk.
//
// The canvas is rendered with an alpha-transparent clear color so the CSS aurora layer
// underneath (fx.css) shows through — this component is additive decoration, not a
// background replacement. All setup lives inside one `useEffect` with symmetric teardown
// so React StrictMode's mount→unmount→mount cycle never leaks a WebGL context or a
// dangling rAF loop.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const POINT_COUNT = 1200;
const ACCENT = new THREE.Color("#69a7ff");
const TEAL = new THREE.Color("#4ca9c9");
const FOG_COLOR = 0x0a0c10;
const POINTS_ROTATION_PERIOD_S = 90; // >=60s per the "slow" requirement
const CORE_ROTATION_PERIOD_S = 75;
const MAX_PARALLAX = 0.4;

function buildPointsGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(POINT_COUNT * 3);
  const colors = new Float32Array(POINT_COUNT * 3);
  const sizes = new Float32Array(POINT_COUNT);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < POINT_COUNT; i++) {
    // ~60% loose fuzzy sphere, ~40% loose torus — reads as one soft volumetric cloud
    // rather than two distinct shapes.
    const isTorus = i % 5 < 2;
    let x: number, y: number, z: number;
    if (isTorus) {
      const theta = Math.random() * Math.PI * 2;
      const tubeAngle = Math.random() * Math.PI * 2;
      const R = 2.6; // torus radius
      const r = 0.5 + Math.random() * 0.6; // tube radius, loose
      x = (R + r * Math.cos(tubeAngle)) * Math.cos(theta);
      y = (R + r * Math.cos(tubeAngle)) * Math.sin(theta);
      z = r * Math.sin(tubeAngle) * 1.4;
    } else {
      // Fuzzy sphere shell: random direction, radius jittered around a base value.
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const radius = 2.2 + (Math.random() - 0.5) * 1.6;
      x = radius * Math.sin(phi) * Math.cos(theta);
      y = radius * Math.sin(phi) * Math.sin(theta);
      z = radius * Math.cos(phi);
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    tmpColor.copy(ACCENT).lerp(TEAL, Math.random());
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;

    sizes[i] = 0.04 + Math.random() * 0.09;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  return geometry;
}

/** Small radial-gradient sprite so points render as soft glowing dots, not hard squares. */
function buildGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function LoginScene3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let contextCreationFailed = false;
    const onContextCreationError = () => {
      contextCreationFailed = true;
    };
    canvas.addEventListener("webglcontextcreationerror", onContextCreationError, false);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      canvas.removeEventListener("webglcontextcreationerror", onContextCreationError);
      setFailed(true);
      return;
    }
    if (contextCreationFailed || !renderer.getContext()) {
      renderer.dispose();
      canvas.removeEventListener("webglcontextcreationerror", onContextCreationError);
      setFailed(true);
      return;
    }

    const container = canvas.parentElement;
    const initialWidth = container?.clientWidth || canvas.clientWidth || 1;
    const initialHeight = container?.clientHeight || canvas.clientHeight || 1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialWidth, initialHeight, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.07);

    const camera = new THREE.PerspectiveCamera(50, initialWidth / Math.max(initialHeight, 1), 0.1, 100);
    camera.position.set(0, 0, 8);

    const pointsGeometry = buildPointsGeometry();
    const glowTexture = buildGlowTexture();
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.09,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    const coreGeometry = new THREE.IcosahedronGeometry(2.1, 1);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x69a7ff,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    const timer = new THREE.Timer();
    const pointer = { x: 0, y: 0 };
    let rafId = 0;
    let paused = false;

    const onPointerMove = (event: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      pointer.x = (event.clientX / w) * 2 - 1;
      pointer.y = (event.clientY / h) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const tick = (timestamp: number) => {
      if (paused) return;
      timer.update(timestamp);
      const delta = timer.getDelta();
      points.rotation.y += (delta * Math.PI * 2) / POINTS_ROTATION_PERIOD_S;
      points.rotation.x += (delta * Math.PI * 2) / (POINTS_ROTATION_PERIOD_S * 1.7);
      core.rotation.y -= (delta * Math.PI * 2) / CORE_ROTATION_PERIOD_S;
      core.rotation.x -= (delta * Math.PI * 2) / (CORE_ROTATION_PERIOD_S * 1.3);

      const targetX = pointer.x * MAX_PARALLAX;
      const targetY = -pointer.y * MAX_PARALLAX;
      camera.position.x += (targetX - camera.position.x) * 0.04;
      camera.position.y += (targetY - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    if (container) resizeObserver.observe(container);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      paused = true;
      cancelAnimationFrame(rafId);
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);

    const onVisibilityChange = () => {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(rafId);
      } else if (!contextCreationFailed) {
        paused = false;
        timer.update(); // drop the paused-time delta so nothing jumps
        rafId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      paused = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextcreationerror", onContextCreationError);
      window.removeEventListener("pointermove", onPointerMove);
      resizeObserver.disconnect();

      pointsGeometry.dispose();
      pointsMaterial.dispose();
      glowTexture.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      // Deliberately NOT calling renderer.forceContextLoss() here: it drives the
      // WEBGL_lose_context extension, which — under React StrictMode's synchronous
      // mount→cleanup→mount double-invoke in dev — races the very next
      // `new THREE.WebGLRenderer({ canvas })` call on the same canvas and can make that
      // second context creation fail (observed: component would render nothing on the
      // second, "real" mount). Plain dispose() frees all GPU-side resources (programs,
      // buffers, render lists) and leaves the underlying WebGL context intact so the
      // second mount's WebGLRenderer picks the same context back up via canvas.getContext().
      renderer.dispose();
    };
  }, []);

  if (failed) return null;

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
