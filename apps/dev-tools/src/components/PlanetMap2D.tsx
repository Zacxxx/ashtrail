import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { TerrainCell } from "../modules/geo/types";
import {
  buildPlanetTiling,
  pickTile,
  tileCell,
  type PlanetWorldData,
} from "../modules/planet/tiles";

interface PlanetMap2DProps {
  world: PlanetWorldData;
  onCellHover?: (cell: TerrainCell | null) => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
// Extend canvas type for our memoized cache
declare global {
  interface HTMLCanvasElement {
    __hexCache?: HTMLCanvasElement | null;
    __moveTimeout?: any;
  }
}

export function PlanetMap2D({ world, onCellHover }: PlanetMap2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 700 });
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const textureRef = useRef<HTMLCanvasElement | null>(null);

  const tiling = useMemo(() => buildPlanetTiling(world), [world]);
  const worldAspect = world.cols / world.rows;

  const mapRect = (() => {
    const canvasAspect = size.width / size.height;
    if (canvasAspect >= worldAspect) {
      const h = size.height;
      const w = h * worldAspect;
      return { x: (size.width - w) * 0.5, y: 0, w, h };
    }
    const w = size.width;
    const h = w / worldAspect;
    return { x: 0, y: (size.height - h) * 0.5, w, h };
  })();

  const project = (lon: number, lat: number) => ({
    x: mapRect.x + ((lon + Math.PI) / (Math.PI * 2)) * mapRect.w,
    y: mapRect.y + ((lat + Math.PI / 2) / Math.PI) * mapRect.h,
  });

  const drawWrappedEdge = (
    ctx: CanvasRenderingContext2D,
    a: { lon: number; lat: number },
    b: { lon: number; lat: number }
  ) => {
    const pa = project(a.lon, a.lat);
    const pb = project(b.lon, b.lat);
    const w = mapRect.w;
    let x1 = pa.x;
    let x2 = pb.x;

    if (Math.abs(x2 - x1) > w * 0.5) {
      if (x1 < x2) x1 += w;
      else x2 += w;
    }

    ctx.moveTo(x1, pa.y);
    ctx.lineTo(x2, pb.y);
    ctx.moveTo(x1 - w, pa.y);
    ctx.lineTo(x2 - w, pb.y);
    ctx.moveTo(x1 + w, pa.y);
    ctx.lineTo(x2 + w, pb.y);
  };

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = world.cols;
    c.height = world.rows;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(world.cols, world.rows);

    for (let i = 0; i < world.cellData.length; i++) {
      const [r, g, b] = hexToRgb(world.cellData[i]?.color ?? "#000000");
      const p = i * 4;
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
    textureRef.current = c;
  }, [world]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: Math.max(100, Math.floor(entry.contentRect.width)),
          height: Math.max(100, Math.floor(entry.contentRect.height)),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size.width;
    canvas.height = size.height;

    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#080d15";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = false;

    // Fast render loop for interactive hover without redrawing all 6000 hexes
    let animFrame: number;
    const render = () => {
      // 1. Draw base texture
      ctx.drawImage(texture, mapRect.x, mapRect.y, mapRect.w, mapRect.h);

      // 2. Draw static hex grid (cached on offscreen canvas for O(1) draw)
      // We lazily create the static hex grid overlay once
      if (!ctx.canvas.__hexCache) {
        const hexCanvas = document.createElement("canvas");
        hexCanvas.width = size.width;
        hexCanvas.height = size.height;
        const hCtx = hexCanvas.getContext("2d");
        if (hCtx) {
          hCtx.strokeStyle = "rgba(220, 234, 255, 0.25)";
          hCtx.lineWidth = 1;
          for (const tile of tiling.tiles) {
            hCtx.beginPath();
            for (let i = 0; i < tile.vertices.length; i++) {
              const a = tile.vertices[i];
              const b = tile.vertices[(i + 1) % tile.vertices.length];
              drawWrappedEdge(hCtx, a, b);
            }
            hCtx.stroke();
          }
        }
        ctx.canvas.__hexCache = hexCanvas;
      }
      ctx.drawImage(ctx.canvas.__hexCache, 0, 0);

      // 3. Draw dynamic highlight if hovered
      if (hoveredTileId) {
        const hovered = tiling.tileById[hoveredTileId];
        if (hovered) {
          ctx.strokeStyle = "rgba(16, 214, 210, 0.95)";
          ctx.fillStyle = "rgba(16, 214, 210, 0.0)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < hovered.vertices.length; i++) {
            const a = hovered.vertices[i];
            const b = hovered.vertices[(i + 1) % hovered.vertices.length];
            drawWrappedEdge(ctx, a, b);
          }
          ctx.stroke();
        }
      }
      animFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrame);
      if (ctx.canvas.__hexCache) {
        ctx.canvas.__hexCache = null;
      }
    };
  }, [size, tiling, hoveredTileId, mapRect]);

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    // Throttle pointer move to prevent event flooding
    if (e.currentTarget.__moveTimeout) return;
    e.currentTarget.__moveTimeout = setTimeout(() => {
      (e.target as HTMLCanvasElement).__moveTimeout = null;
    }, 16); // ~60fps throttle
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * size.width;
    const cy = ((e.clientY - rect.top) / rect.height) * size.height;
    if (cx < mapRect.x || cy < mapRect.y || cx > mapRect.x + mapRect.w || cy > mapRect.y + mapRect.h) {
      setHoveredTileId(null);
      onCellHover?.(null);
      return;
    }
    const px = (cx - mapRect.x) / mapRect.w;
    const py = (cy - mapRect.y) / mapRect.h;
    const lon = px * Math.PI * 2 - Math.PI;
    const lat = py * Math.PI - Math.PI / 2;

    const tile = pickTile(tiling, lon, lat);
    setHoveredTileId(tile?.id ?? null);
    const cell = tileCell(world, tile);
    onCellHover?.((cell as TerrainCell | null) ?? null);
  };

  const onPointerLeave = () => {
    setHoveredTileId(null);
    onCellHover?.(null);
  };

  return (
    <div ref={containerRef} className="w-full h-full rounded-lg border border-[#1f2937] overflow-hidden bg-[#080d15]">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
}
