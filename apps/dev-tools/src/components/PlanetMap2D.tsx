import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { PlanetWorldData } from "../modules/planet/tiles";

export interface MapTransform {
  x: number;
  y: number;
  scale: number;
}

interface PlanetMap2DProps {
  world: PlanetWorldData;
  onTransformChange?: (transform: MapTransform) => void;
}

export function PlanetMap2D({ world, onTransformChange }: PlanetMap2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });

  // Transform state: represents translation (x, y) and zoom (scale)
  const transformRef = useRef<MapTransform>({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // We use a React ref for animation frames
  const rafRef = useRef<number>(0);

  // ── 0. Boundary Logic ──
  const clampTransform = (x: number, y: number, scale: number, w: number, h: number, imgWidth: number, imgHeight: number) => {
    // 1. Min Scale Constraint (Fit to screen)
    // The scale shouldn't be smaller than what fits the entire image in the canvas.
    const minScaleX = w / imgWidth;
    const minScaleY = h / imgHeight;
    const minScale = Math.min(minScaleX, minScaleY);

    scale = Math.max(minScale, scale);
    scale = Math.min(scale, 50); // Max zoom

    // 2. Pan Constraints
    // The image bounds should never enter the canvas area if the image is larger than the canvas.
    // Width boundaries
    const scaledWidth = imgWidth * scale;
    const minX = Math.min(0, w - scaledWidth);
    const maxX = Math.max(0, (w - scaledWidth) / 2); // Center if smaller than canvas

    // Height boundaries
    const scaledHeight = imgHeight * scale;
    const minY = Math.min(0, h - scaledHeight);
    const maxY = Math.max(0, (h - scaledHeight) / 2);

    x = Math.max(minX, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));

    return { x, y, scale };
  };

  // ── 1. Init Image ──
  useEffect(() => {
    if (!world.textureUrl) return;
    const img = new Image();
    img.src = world.textureUrl;
    img.onload = () => {
      imageRef.current = img;

      if (size.width > 0 && size.height > 0) {
        fitImageToScreen(img, size.width, size.height);
        draw(size.width, size.height);
      }
    };
  }, [world.textureUrl, size.width, size.height]); // Add size dependencies to ensure drawing happens if img loaded before resize triggered

  // ── 2. Handle Resize ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.max(100, Math.floor(entry.contentRect.width));
        const newHeight = Math.max(100, Math.floor(entry.contentRect.height));
        setSize({ width: newWidth, height: newHeight });

        if (imageRef.current) {
          // Re-clamp current transform to new bounds instead of fully resetting
          const { x, y, scale } = transformRef.current;
          const clamped = clampTransform(x, y, scale, newWidth, newHeight, imageRef.current.width, imageRef.current.height);
          transformRef.current = clamped;
          onTransformChange?.(clamped);
          draw(newWidth, newHeight);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const fitImageToScreen = (img: HTMLImageElement, w: number, h: number) => {
    const minScaleX = w / img.width;
    const minScaleY = h / img.height;
    const scale = Math.min(minScaleX, minScaleY);

    const x = (w - img.width * scale) / 2;
    const y = (h - img.height * scale) / 2;

    transformRef.current = { x, y, scale };
    onTransformChange?.(transformRef.current);
  };

  // ── 3. Render Loop ──
  const draw = (w = size.width, h = size.height) => {
    if (!canvasRef.current || !imageRef.current || w === 0 || h === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Only update canvas dimensions if they changed to prevent flicker
    if (canvasRef.current.width !== w) canvasRef.current.width = w;
    if (canvasRef.current.height !== h) canvasRef.current.height = h;

    // Clear background
    ctx.fillStyle = "#080d15";
    ctx.fillRect(0, 0, w, h);

    const { x, y, scale } = transformRef.current;

    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.drawImage(imageRef.current, 0, 0);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(0, 0, imageRef.current.width, imageRef.current.height);

    ctx.restore();
  };

  // Render trigger when transform updates
  const scheduleDraw = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => draw());
  };

  // ── 4. Interaction ──
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!imageRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomSensitivity = 0.002;
    const zoomDelta = Math.exp(-e.deltaY * zoomSensitivity);

    const { x, y, scale } = transformRef.current;

    let newScale = scale * zoomDelta;

    const newX = mouseX - (mouseX - x) * (newScale / scale);
    const newY = mouseY - (mouseY - y) * (newScale / scale);

    const clamped = clampTransform(newX, newY, newScale, size.width, size.height, imageRef.current.width, imageRef.current.height);
    transformRef.current = clamped;
    onTransformChange?.(clamped);

    scheduleDraw();
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !imageRef.current) return;

    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;

    let { x, y, scale } = transformRef.current;
    x += dx;
    y += dy;

    lastPosRef.current = { x: e.clientX, y: e.clientY };

    const clamped = clampTransform(x, y, scale, size.width, size.height, imageRef.current.width, imageRef.current.height);
    transformRef.current = clamped;

    onTransformChange?.(clamped);
    scheduleDraw();
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div ref={containerRef} className="w-full h-full rounded-lg border border-[#1f2937] overflow-hidden bg-[#080d15]">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
