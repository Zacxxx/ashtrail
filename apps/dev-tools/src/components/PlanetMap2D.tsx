import { useEffect, useRef, useState, type PointerEvent } from "react";
import { pickTile, tileCell, type PlanetWorldData, type PlanetTiling } from "../modules/planet/tiles";
import type { TerrainCell } from "../modules/geo/types";
import type { TilingWorkerRequest, TilingWorkerResponse } from "../workers/tiling.worker";

export interface MapTransform {
  x: number;
  y: number;
  scale: number;
}

interface PlanetMap2DProps {
  world: PlanetWorldData;
  onTransformChange?: (transform: MapTransform) => void;
  onCellHover?: (cell: TerrainCell | null) => void;
  onCellClick?: (cell: TerrainCell | null) => void;
  showHexGrid?: boolean;
}

export function PlanetMap2D({ world, onTransformChange, onCellHover, onCellClick, showHexGrid }: PlanetMap2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });

  // Transform state: represents translation (x, y) and zoom (scale)
  const transformRef = useRef<MapTransform>({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const [tiling, setTiling] = useState<PlanetTiling | null>(null);
  const selectedTileIdRef = useRef<string | null>(null);
  const hoveredTileIdRef = useRef<string | null>(null);

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

  // ── 1. Init Image & Tiling ──
  useEffect(() => {
    setTiling(null);

    const worker = new Worker(new URL("../workers/tiling.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<TilingWorkerResponse>) => {
      if (e.data.type === 'TILING_COMPLETE') {
        setTiling(e.data.tiling);
        scheduleDraw();
      }
    };

    const req: TilingWorkerRequest = {
      type: 'BUILD_TILING',
      world: { cols: world.cols, rows: world.rows, cellData: [] }
    };
    worker.postMessage(req);

    return () => worker.terminate();
  }, [world]);

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
    // Draw the image
    ctx.drawImage(imageRef.current, 0, 0);

    // Render Grid
    if (showHexGrid && tiling) {
      ctx.strokeStyle = "rgba(224, 240, 255, 0.45)";
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();

      const width = imageRef.current.width;
      const height = imageRef.current.height;

      for (const tile of tiling.tiles) {
        for (let i = 0; i < tile.vertices.length; i++) {
          const a = tile.vertices[i];
          const b = tile.vertices[(i + 1) % tile.vertices.length];
          // Skip drawing lines that cross the dateline
          if (Math.abs(a.lon - b.lon) > Math.PI * 0.9) continue;

          const ax = ((a.lon + Math.PI) / (2 * Math.PI)) * width;
          const ay = ((Math.PI / 2 - a.lat) / Math.PI) * height;
          const bx = ((b.lon + Math.PI) / (2 * Math.PI)) * width;
          const by = ((Math.PI / 2 - b.lat) / Math.PI) * height;

          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
      }
      ctx.stroke();
    }

    // Highlight selected/hovered tile
    if (tiling && (selectedTileIdRef.current || hoveredTileIdRef.current)) {
      const activeTiles = [];
      if (selectedTileIdRef.current) activeTiles.push({ id: selectedTileIdRef.current, color: "rgba(24, 212, 210, 0.95)" });
      if (hoveredTileIdRef.current && hoveredTileIdRef.current !== selectedTileIdRef.current) activeTiles.push({ id: hoveredTileIdRef.current, color: "rgba(255, 255, 255, 0.5)" });

      for (const active of activeTiles) {
        const tile = tiling.tiles.find(t => t.id === active.id);
        if (tile) {
          ctx.strokeStyle = active.color;
          ctx.lineWidth = 2 / scale;
          ctx.beginPath();
          let started = false;
          for (const v of tile.vertices) {
            const vx = ((v.lon + Math.PI) / (2 * Math.PI)) * imageRef.current.width;
            const vy = ((Math.PI / 2 - v.lat) / Math.PI) * imageRef.current.height;
            if (!started) {
              ctx.moveTo(vx, vy);
              started = true;
            } else {
              ctx.lineTo(vx, vy);
            }
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

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

  // Re-draw grid when visibility changes
  useEffect(() => {
    scheduleDraw();
  }, [showHexGrid]);

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

  const getImageCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const { x, y, scale } = transformRef.current;

    // Mouse relative to canvas
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // Project back to image coordinates
    return {
      imgX: (mouseX - x) / scale,
      imgY: (mouseY - y) / scale
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!imageRef.current || !canvasRef.current) return;

    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;

    if (isDraggingRef.current) {
      let { x, y, scale } = transformRef.current;
      x += dx;
      y += dy;

      lastPosRef.current = { x: e.clientX, y: e.clientY };

      const clamped = clampTransform(x, y, scale, size.width, size.height, imageRef.current.width, imageRef.current.height);
      transformRef.current = clamped;

      onTransformChange?.(clamped);
      scheduleDraw();
      return;
    }

    // Hover picking when not dragging
    if (tiling && imageRef.current) {
      const coords = getImageCoords(e.clientX, e.clientY);
      if (coords) {
        const width = imageRef.current.width;
        const height = imageRef.current.height;

        if (coords.imgX >= 0 && coords.imgX <= width && coords.imgY >= 0 && coords.imgY <= height) {
          const lon = (coords.imgX / width) * 2 * Math.PI - Math.PI;
          const lat = Math.PI / 2 - (coords.imgY / height) * Math.PI;

          const tile = pickTile(tiling, lon, lat);
          if (tile && tile.id !== hoveredTileIdRef.current) {
            hoveredTileIdRef.current = tile.id;
            onCellHover?.((tileCell(world, tile) as TerrainCell | null) ?? null);
            scheduleDraw();
          }
        } else if (hoveredTileIdRef.current) {
          hoveredTileIdRef.current = null;
          onCellHover?.(null);
          scheduleDraw();
        }
      }
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current && tiling && imageRef.current) {
      // Must have been a click
    }
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && tiling && imageRef.current) {
      const coords = getImageCoords(e.clientX, e.clientY);
      if (coords) {
        const width = imageRef.current.width;
        const height = imageRef.current.height;
        if (coords.imgX >= 0 && coords.imgX <= width && coords.imgY >= 0 && coords.imgY <= height) {
          const lon = (coords.imgX / width) * 2 * Math.PI - Math.PI;
          const lat = Math.PI / 2 - (coords.imgY / height) * Math.PI;

          const tile = pickTile(tiling, lon, lat);
          if (tile) {
            selectedTileIdRef.current = tile.id;
            onCellClick?.((tileCell(world, tile) as TerrainCell | null) ?? null);
          } else {
            selectedTileIdRef.current = null;
            onCellClick?.(null);
          }
          scheduleDraw();
        }
      }
    }

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
