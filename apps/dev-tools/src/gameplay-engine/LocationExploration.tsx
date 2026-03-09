import React, { useRef, useEffect, useState } from "react";
import { ExplorationMap, Tile, ExplorationPawn } from "@ashtrail/core";
// @ts-ignore - Ignore member export if TS is lagging behind wasm-pack build
import init, { find_path_wasm } from "@ashtrail/geo-wasm";
// @ts-ignore - Vite will resolve this correctly
import wasmUrl from "@ashtrail/geo-wasm/geo_wasm_bg.wasm?url";

interface LocationExplorationProps {
    initialMap: ExplorationMap;
    initialSelectedPawnId: string | null;
    onExit: () => void;
}

export function LocationExploration({ initialMap, initialSelectedPawnId, onExit }: LocationExplorationProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<ExplorationMap>(initialMap);

    const [zoom, setZoom] = useState(1.0);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [wasmReady, setWasmReady] = useState(false);
    const [hoverTile, setHoverTile] = useState<{ x: number, y: number } | null>(null);
    const [selectedPawnId, setSelectedPawnId] = useState<string | null>(initialSelectedPawnId);

    const mousePos = useRef({ x: 0, y: 0 });
    const keysPressed = useRef<Set<string>>(new Set());
    const lastTickRef = useRef<number>(0);
    const requestRef = useRef<number>();
    const texturesRef = useRef<Map<string, HTMLImageElement>>(new Map());

    // Initialize WASM
    useEffect(() => {
        init(wasmUrl).then(() => {
            setWasmReady(true);
        }).catch(err => console.error("WASM Init Error:", err));
    }, []);

    // Load Textures
    useEffect(() => {
        const uniqueUrls = Array.from(new Set(map.tiles.map(t => t.textureUrl).filter(Boolean))) as string[];
        uniqueUrls.forEach(url => {
            if (!texturesRef.current.has(url)) {
                const img = new Image();
                img.src = url;
                img.onload = () => {
                    texturesRef.current.set(url, img);
                };
            }
        });
    }, [map.tiles]);

    // Center camera on first pawn initially
    useEffect(() => {
        if (initialMap.pawns.length > 0 && containerRef.current) {
            const p = initialMap.pawns[0];
            const ts = 40 * zoom;
            const centerX = containerRef.current.clientWidth / 2 - p.x * ts;
            const centerY = containerRef.current.clientHeight / 2 - p.y * ts;
            setOffset({ x: centerX, y: centerY });
        }
    }, []);

    const tileSizeBase = 40;
    const tileSize = tileSizeBase * zoom;


    const update = (delta: number) => {
        // 1. Camera Movement (Edge Scrolling + Keyboard)
        const EDGE_THRESHOLD = 50;
        const SCROLL_SPEED = 800 * delta;

        let camDx = 0;
        let camDy = 0;

        if (containerRef.current) {
            const { x, y } = mousePos.current;
            const { clientWidth, clientHeight } = containerRef.current;

            // Edge Scrolling
            if (x < EDGE_THRESHOLD) camDx += SCROLL_SPEED;
            if (x > clientWidth - EDGE_THRESHOLD) camDx -= SCROLL_SPEED;
            if (y < EDGE_THRESHOLD) camDy += SCROLL_SPEED;
            if (y > clientHeight - EDGE_THRESHOLD) camDy -= SCROLL_SPEED;
        }

        // Keyboard Controls (WASD / Arrows)
        if (keysPressed.current.has("w") || keysPressed.current.has("arrowup")) camDy += SCROLL_SPEED;
        if (keysPressed.current.has("s") || keysPressed.current.has("arrowdown")) camDy -= SCROLL_SPEED;
        if (keysPressed.current.has("a") || keysPressed.current.has("arrowleft")) camDx += SCROLL_SPEED;
        if (keysPressed.current.has("d") || keysPressed.current.has("arrowright")) camDx -= SCROLL_SPEED;

        if (camDx !== 0 || camDy !== 0) {
            setOffset(prev => ({ x: prev.x + camDx, y: prev.y + camDy }));
        }

        if (delta === 0) return;

        // 2. Pawn Movement
        setMap(prev => {
            let changed = false;
            const newPawns = prev.pawns.map(pawn => {
                if (pawn.path && pawn.path.length > 0) {
                    changed = true;
                    const target = pawn.path[0];
                    const dx = target.x - pawn.x;
                    const dy = target.y - pawn.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const moveDist = pawn.speed * delta;

                    if (dist <= moveDist) {
                        const nextPath = pawn.path.slice(1);
                        return {
                            ...pawn,
                            x: target.x,
                            y: target.y,
                            path: nextPath.length > 0 ? nextPath : undefined
                        };
                    } else {
                        return {
                            ...pawn,
                            x: pawn.x + (dx / dist) * moveDist,
                            y: pawn.y + (dy / dist) * moveDist
                        };
                    }
                }
                return pawn;
            });

            return changed ? { ...prev, pawns: newPawns } : prev;
        });
    };

    const render = () => {
        const canvas = canvasRef.current;
        if (!canvas || !map) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(offset.x, offset.y);

        const startVisibleX = Math.max(0, Math.floor(-offset.x / tileSize));
        const endVisibleX = Math.min(map.width, Math.ceil((canvas.width - offset.x) / tileSize));
        const startVisibleY = Math.max(0, Math.floor(-offset.y / tileSize));
        const endVisibleY = Math.min(map.height, Math.ceil((canvas.height - offset.y) / tileSize));

        // 1. Draw Tiles
        for (let y = startVisibleY; y < endVisibleY; y++) {
            for (let x = startVisibleX; x < endVisibleX; x++) {
                const idx = y * map.width + x;
                const tile = map.tiles[idx];
                const screenX = x * tileSize;
                const screenY = y * tileSize;

                if (tile.textureUrl && texturesRef.current.has(tile.textureUrl)) {
                    ctx.drawImage(texturesRef.current.get(tile.textureUrl)!, screenX, screenY, tileSize, tileSize);
                } else {
                    if (tile.type === "wall") {
                        ctx.fillStyle = "#2d3436";
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                    } else {
                        ctx.fillStyle = "#1a1c23";
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                        ctx.strokeStyle = "rgba(255,255,255,0.02)";
                        ctx.strokeRect(screenX, screenY, tileSize, tileSize);
                    }
                }
            }
        }

        // 2. Hover Highlight
        if (hoverTile) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
            ctx.fillRect(hoverTile.x * tileSize, hoverTile.y * tileSize, tileSize, tileSize);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.strokeRect(hoverTile.x * tileSize, hoverTile.y * tileSize, tileSize, tileSize);
        }

        // 3. Draw Pawns
        map.pawns.forEach(pawn => {
            const screenX = pawn.x * tileSize + tileSize / 2;
            const screenY = pawn.y * tileSize + tileSize / 2;
            const size = tileSize * 0.7;

            if (pawn.id === selectedPawnId) {
                ctx.strokeStyle = "#10b981";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, size / 2 + 3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.lineWidth = 1;

                // Draw path
                if (pawn.path && pawn.path.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(screenX, screenY);
                    pawn.path.forEach(pt => ctx.lineTo(pt.x * tileSize + tileSize / 2, pt.y * tileSize + tileSize / 2));
                    ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            ctx.fillStyle = pawn.type === "human" ? "#3498db" : pawn.type === "animal" ? "#e67e22" : "#95a5a6";
            ctx.beginPath();
            ctx.arc(screenX, screenY, size / 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "white";
            ctx.font = "bold 9px Inter";
            ctx.textAlign = "center";
            ctx.fillText(pawn.name, screenX, screenY - size / 2 - 8);
        });

        ctx.restore();
    };

    useEffect(() => {
        const loop = (time: number) => {
            if (!lastTickRef.current) lastTickRef.current = time;
            const delta = (time - lastTickRef.current) / 1000;
            lastTickRef.current = time;
            update(delta);
            render();
            requestRef.current = requestAnimationFrame(loop);
        };
        const handleResize = () => {
            if (canvasRef.current && containerRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
            }
        };
        const handleMouseMove = (e: MouseEvent) => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                mousePos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            keysPressed.current.add(e.key.toLowerCase());
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            keysPressed.current.delete(e.key.toLowerCase());
        };

        window.addEventListener("resize", handleResize);
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        handleResize();
        requestRef.current = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [map, zoom, offset, hoverTile, selectedPawnId]);

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (!map || !wasmReady) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const tileX = Math.floor((mouseX - offset.x) / tileSize);
        const tileY = Math.floor((mouseY - offset.y) / tileSize);

        if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) return;

        // Selection
        const clickedPawn = map.pawns.find(p => Math.abs(p.x - tileX) < 1 && Math.abs(p.y - tileY) < 1);
        if (clickedPawn) {
            setSelectedPawnId(clickedPawn.id);
            return;
        }

        // Move order
        if (selectedPawnId) {
            const pawn = map.pawns.find(p => p.id === selectedPawnId);
            if (!pawn) return;

            const startX = Math.round(pawn.x);
            const startY = Math.round(pawn.y);
            const walkableGrid = map.tiles.map(t => t.walkable);

            try {
                const pathResult = find_path_wasm(startX, startY, tileX, tileY, map.width, map.height, walkableGrid);
                if (pathResult) {
                    const path = pathResult.map((pt: [number, number]) => ({ x: pt[0], y: pt[1] }));
                    setMap(prev => ({
                        ...prev,
                        pawns: prev.pawns.map(p => p.id === selectedPawnId ? { ...p, path } : p)
                    }));
                }
            } catch (err) {
                console.error("Pathfinding error:", err);
            }
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const tileX = Math.floor((e.clientX - rect.left - offset.x) / tileSize);
        const tileY = Math.floor((e.clientY - rect.top - offset.y) / tileSize);

        if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
            if (!hoverTile || hoverTile.x !== tileX || hoverTile.y !== tileY) {
                setHoverTile({ x: tileX, y: tileY });
            }
        } else {
            setHoverTile(null);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom centered on mouse
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.2, Math.min(zoom * zoomDelta, 4));

        const worldX = (mouseX - offset.x) / zoom;
        const worldY = (mouseY - offset.y) / zoom;

        const newOffsetX = mouseX - worldX * newZoom;
        const newOffsetY = mouseY - worldY * newZoom;

        setZoom(newZoom);
        setOffset({ x: newOffsetX, y: newOffsetY });
    };

    return (
        <div ref={containerRef} className="w-full h-full relative bg-[#050505] overflow-hidden select-none">
            <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onWheel={handleWheel}
                className="w-full h-full cursor-crosshair"
            />

            {/* Top HUD */}
            <div className="absolute top-6 left-6 flex flex-col gap-3 pointer-events-none">
                <button
                    onClick={onExit}
                    className="pointer-events-auto px-4 py-2 bg-black/80 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all backdrop-blur-xl"
                >
                    ← TERMINATE MISSION
                </button>
            </div>

            {/* Stats (Bottom Left) */}
            <div className="absolute bottom-6 left-6 flex items-center gap-3">
                <div className="px-5 py-2.5 bg-black/80 border border-white/10 rounded-2xl backdrop-blur-xl text-[9px] font-bold text-gray-400 flex items-center gap-3">
                    <span className="text-emerald-500 tracking-widest uppercase">{map.name || "SECTOR_X"}</span>
                    <span className="opacity-20">|</span>
                    <span>COORD: {hoverTile ? `${hoverTile.x}, ${hoverTile.y}` : "--, --"}</span>
                    <span className="opacity-20">|</span>
                    <span>ZOOM: {(zoom * 100).toFixed(0)}%</span>
                </div>
            </div>

            {/* Pawn Selection Indicator (Left Center) */}
            {selectedPawnId && (
                <div className="absolute top-1/2 -translate-y-1/2 left-6 p-4 bg-black/80 border border-white/10 rounded-3xl backdrop-blur-xl animate-in slide-in-from-left-4 duration-500">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl">
                            {map.pawns.find(p => p.id === selectedPawnId)?.type === "human" ? "👤" : "🐾"}
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-white leading-tight uppercase tracking-widest">
                                {map.pawns.find(p => p.id === selectedPawnId)?.name}
                            </span>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">Status: Active</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
