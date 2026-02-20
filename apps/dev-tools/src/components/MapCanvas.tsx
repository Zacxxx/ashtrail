import { useEffect, useRef, useState, useCallback } from "react";
import type { SimulationConfig, LODLevel, VisualizationMode, TerrainCell } from "../modules/geo/types";
import { LOD_LEVELS } from "../modules/geo/types";
import { GeoEngine } from "../modules/geo/engine";

interface MapCanvasProps {
  config: SimulationConfig;
  lodLevel: LODLevel;
  visualizationMode: VisualizationMode;
  generationNonce: number;
  onCellHover?: (cell: TerrainCell | null) => void;
  onGenerating?: (isGenerating: boolean) => void;
}

interface GenerateTerrainRequest {
  config: SimulationConfig;
  cols: number;
  rows: number;
  kmPerCell: number;
  octaves: number;
}

interface GenerateTerrainResponse {
  cols: number;
  rows: number;
  cellData: any[];
  cellColors: string[];
}

interface StartJobResponse {
  jobId: string;
}

interface JobStatusResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  progress: number;
  currentStage: string;
  result?: GenerateTerrainResponse;
  error?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cancelJob(jobId: string | null): Promise<void> {
  if (!jobId) return;
  try {
    await fetch(`/api/terrain/jobs/${jobId}`, { method: "DELETE" });
  } catch {
    // Best-effort cancellation only.
  }
}

export function MapCanvas({ config, lodLevel, visualizationMode, generationNonce, onCellHover, onGenerating }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cellDataRef = useRef<any[] | null>(null);
  const rawCellDataRef = useRef<any[] | null>(null);
  const worldDims = useRef({ cols: 0, rows: 0 });
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestDebounceRef = useRef<number | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const latestConfigRef = useRef(config);
  const latestLodLevelRef = useRef(lodLevel);
  const latestCanvasSizeRef = useRef(canvasSize);
  const latestOnGeneratingRef = useRef(onGenerating);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("Queued");

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

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

  const applyVisualizationAndRender = useCallback((rawCells: any[], cols: number, rows: number) => {
    const cells = visualizationMode === "BIOME"
      ? rawCells
      : GeoEngine.recolorCells(rawCells as unknown as TerrainCell[], visualizationMode);

    cellDataRef.current = cells as any[];
    const cellColors = cells.map((c: any) => c.color);
    renderFromColors(cellColors, cols, rows);
  }, [renderFromColors, visualizationMode]);
  const latestApplyVisualizationAndRenderRef = useRef(applyVisualizationAndRender);

  useEffect(() => {
    latestCanvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    latestLodLevelRef.current = lodLevel;
  }, [lodLevel]);

  useEffect(() => {
    latestOnGeneratingRef.current = onGenerating;
  }, [onGenerating]);

  useEffect(() => {
    latestApplyVisualizationAndRenderRef.current = applyVisualizationAndRender;
  }, [applyVisualizationAndRender]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const next = { width: Math.floor(width), height: Math.floor(height) };
        setCanvasSize(prev =>
          prev.width === next.width && prev.height === next.height ? prev : next
        );
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (generationNonce <= 0) {
      return;
    }

    if (requestDebounceRef.current !== null) {
      window.clearTimeout(requestDebounceRef.current);
      requestDebounceRef.current = null;
    }

    const run = async () => {
      const liveConfig = latestConfigRef.current;
      const liveLodLevel = latestLodLevelRef.current;
      const liveCanvasSize = latestCanvasSizeRef.current;
      const lod = LOD_LEVELS[liveLodLevel];
      const ppc = lod.pixelsPerCell;
      const cols = Math.ceil(liveCanvasSize.width / ppc) + 2;
      const rows = Math.ceil(liveCanvasSize.height / ppc) + 2;

      await cancelJob(currentJobIdRef.current);
      currentJobIdRef.current = null;
      requestAbortRef.current?.abort();
      const abortController = new AbortController();
      requestAbortRef.current = abortController;

      setIsGenerating(true);
      setGenerationProgress(0);
      setGenerationStage("Queued");
      latestOnGeneratingRef.current?.(true);

      const requestBody: GenerateTerrainRequest = {
        config: liveConfig,
        cols,
        rows,
        kmPerCell: lod.kmPerCell,
        octaves: lod.octaves,
      };

      try {
        const startResponse = await fetch("/api/terrain/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        if (!startResponse.ok) {
          const message = await startResponse.text();
          throw new Error(message || `Backend error (${startResponse.status})`);
        }

        const { jobId }: StartJobResponse = await startResponse.json();
        currentJobIdRef.current = jobId;

        while (!abortController.signal.aborted) {
          const statusResponse = await fetch(`/api/terrain/jobs/${jobId}`, {
            signal: abortController.signal,
          });

          if (!statusResponse.ok) {
            const message = await statusResponse.text();
            throw new Error(message || `Status error (${statusResponse.status})`);
          }

          const status: JobStatusResponse = await statusResponse.json();
          setGenerationProgress(Math.max(0, Math.min(100, status.progress || 0)));
          setGenerationStage(status.currentStage || "Running");

          if (status.status === "failed") {
            throw new Error(status.error || "Terrain generation failed");
          }

          if (status.status === "cancelled") {
            throw new Error("Terrain generation was cancelled");
          }

          if (status.status === "completed") {
            if (!status.result) {
              throw new Error("Terrain generation completed without a result payload");
            }

            rawCellDataRef.current = status.result.cellData;
            worldDims.current = { cols: status.result.cols, rows: status.result.rows };
            latestApplyVisualizationAndRenderRef.current(
              status.result.cellData,
              status.result.cols,
              status.result.rows
            );
            currentJobIdRef.current = null;
            break;
          }

          await sleep(120);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          await cancelJob(currentJobIdRef.current);
          currentJobIdRef.current = null;
          return;
        }
        console.error("Terrain generation request failed:", error);
        currentJobIdRef.current = null;
      } finally {
        if (!abortController.signal.aborted) {
          setIsGenerating(false);
          latestOnGeneratingRef.current?.(false);
        }
      }
    };

    requestDebounceRef.current = window.setTimeout(() => {
      requestDebounceRef.current = null;
      void run();
    }, 150);

    return () => {
      if (requestDebounceRef.current !== null) {
        window.clearTimeout(requestDebounceRef.current);
        requestDebounceRef.current = null;
      }
      requestAbortRef.current?.abort();
      void cancelJob(currentJobIdRef.current);
      currentJobIdRef.current = null;
    };
  }, [generationNonce]);

  useEffect(() => {
    const rawCells = rawCellDataRef.current;
    if (!rawCells) return;
    applyVisualizationAndRender(rawCells, worldDims.current.cols, worldDims.current.rows);
  }, [visualizationMode, applyVisualizationAndRender]);

  useEffect(() => {
    if (!cellDataRef.current) return;
    const colors = cellDataRef.current.map(c => c.color);
    renderFromColors(colors, worldDims.current.cols, worldDims.current.rows);
  }, [offset, renderFromColors]);

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

      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1c]/80 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3 w-72">
            <div className="w-10 h-10 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
            <div className="text-sm font-bold tracking-[0.2em] text-teal-500/80">
              GENERATING TERRAIN
            </div>
            <div className="w-full h-2 bg-[#1f2937] rounded-full overflow-hidden border border-[#253342]">
              <div
                className="h-full bg-teal-500 transition-all duration-150"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <div className="w-full flex items-center justify-between text-[10px] tracking-wider">
              <span className="text-gray-400">{generationStage}</span>
              <span className="text-teal-400 font-mono">{Math.round(generationProgress)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
