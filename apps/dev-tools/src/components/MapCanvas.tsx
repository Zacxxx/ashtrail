import { useEffect, useRef, useState, useCallback } from "react";
import type { SimulationConfig, LODLevel, VisualizationMode, TerrainCell } from "../modules/geo/types";
import { LOD_LEVELS } from "../modules/geo/types";
import type { WorkerRequest, WorkerResponse } from "../geo.worker";

interface MapCanvasProps {
  config: SimulationConfig;
  lodLevel: LODLevel;
  visualizationMode: VisualizationMode;
  onCellHover?: (cell: TerrainCell | null) => void;
  onGenerating?: (isGenerating: boolean) => void;
}

// ── Parse "#rrggbb" to [r, g, b] ───────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function MapCanvas({ config, lodLevel, visualizationMode, onCellHover, onGenerating }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const cellDataRef = useRef<WorkerResponse["cellData"] | null>(null);
  const worldDims = useRef({ cols: 0, rows: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const [isGenerating, setIsGenerating] = useState(true);

  // Pan state
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // ── Initialize Web Worker ──
  useEffect(() => {
    const worker = new Worker(
      new URL("../geo.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const result = e.data;
      cellDataRef.current = result.cellData;
      worldDims.current = { cols: result.cols, rows: result.rows };

      // Render from worker results
      renderFromColors(result.cellColors, result.cols, result.rows);
      setIsGenerating(false);
      onGenerating?.(false);
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // ── Resize observer ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Dispatch generation to worker ──
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const lod = LOD_LEVELS[lodLevel];
    const ppc = lod.pixelsPerCell;
    const cols = Math.ceil(canvasSize.width / ppc) + 2;
    const rows = Math.ceil(canvasSize.height / ppc) + 2;

    setIsGenerating(true);
    onGenerating?.(true);

    const request: WorkerRequest = {
      type: "generate",
      config,
      cols,
      rows,
      lodLevel,
      visualizationMode,
    };

    worker.postMessage(request);
  }, [config, lodLevel, visualizationMode, canvasSize.width, canvasSize.height]);

  // ── Render pixel map from color array ──
  const renderFromColors = useCallback((
    cellColors: string[], cols: number, rows: number,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lod = LOD_LEVELS[lodLevel];
    const ppc = lod.pixelsPerCell;
    const imgWidth = canvasSize.width;
    const imgHeight = canvasSize.height;

    const imageData = ctx.createImageData(imgWidth, imgHeight);
    const data = imageData.data;
    const ox = offset.x % ppc;
    const oy = offset.y % ppc;

    // Pre-parse all colors to avoid repeated hex parsing
    const rgbCache: [number, number, number][] = new Array(cellColors.length);
    for (let i = 0; i < cellColors.length; i++) {
      rgbCache[i] = hexToRgb(cellColors[i]);
    }

    for (let py = 0; py < imgHeight; py++) {
      for (let px = 0; px < imgWidth; px++) {
        const cx = Math.floor((px - ox) / ppc);
        const cy = Math.floor((py - oy) / ppc);
        const pidx = (py * imgWidth + px) * 4;

        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
          data[pidx] = 10;
          data[pidx + 1] = 15;
          data[pidx + 2] = 28;
          data[pidx + 3] = 255;
          continue;
        }

        const rgb = rgbCache[cy * cols + cx];
        data[pidx] = rgb[0];
        data[pidx + 1] = rgb[1];
        data[pidx + 2] = rgb[2];
        data[pidx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // ── River / lake overlay ──
    const cellData = cellDataRef.current;
    if (cellData && (visualizationMode === "BIOME" || visualizationMode === "RIVERS")) {
      for (const cell of cellData) {
        if (cell.riverFlow > 0.06 && cell.elevation >= config.world.oceanCoverage) {
          const cpx = cell.x * ppc + ox + ppc / 2;
          const cpy = cell.y * ppc + oy + ppc / 2;
          if (cpx < -ppc || cpx > imgWidth + ppc) continue;
          if (cpy < -ppc || cpy > imgHeight + ppc) continue;

          const radius = Math.max(1, cell.riverFlow * ppc * 0.6);
          const alpha = 0.3 + cell.riverFlow * 0.7;
          ctx.fillStyle = cell.isLake
            ? `rgba(21, 101, 192, ${alpha})`
            : `rgba(66, 165, 245, ${alpha})`;
          ctx.beginPath();
          ctx.arc(cpx, cpy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [lodLevel, canvasSize, offset, visualizationMode, config.world.oceanCoverage]);

  // ── Re-render on pan (without re-generating) ──
  useEffect(() => {
    if (!cellDataRef.current) return;
    const colors = cellDataRef.current.map(c => c.color);
    renderFromColors(colors, worldDims.current.cols, worldDims.current.rows);
  }, [offset]);

  // ── Pan handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isPanning.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }

    // Cell hover detection
    if (cellDataRef.current && onCellHover) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const lod = LOD_LEVELS[lodLevel];
      const ppc = lod.pixelsPerCell;
      const ox = offset.x % ppc;
      const oy = offset.y % ppc;
      const col = Math.floor((mx - ox) / ppc);
      const row = Math.floor((my - oy) / ppc);

      const dims = worldDims.current;
      if (col >= 0 && col < dims.cols && row >= 0 && row < dims.rows) {
        const cd = cellDataRef.current[row * dims.cols + col];
        // Cast serialized cell data back to TerrainCell shape for the inspector
        onCellHover(cd as unknown as TerrainCell);
      } else {
        onCellHover(null);
      }
    }
  }, [offset, lodLevel, onCellHover]);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative bg-[#0a0f1c] rounded-lg shadow-2xl border border-[#1f2937] cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="block w-full h-full"
        style={{ imageRendering: "pixelated" }}
      />

      {/* Loading overlay */}
      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1c]/80 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
            <div className="text-sm font-bold tracking-[0.2em] text-teal-500/80">
              GENERATING TERRAIN
            </div>
            <div className="text-[10px] text-gray-600 tracking-wider">
              Simulating geology, climate, hydrology…
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
