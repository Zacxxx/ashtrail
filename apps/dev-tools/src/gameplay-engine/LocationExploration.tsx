import React, { useRef, useEffect, useState } from "react";
import { ExplorationMap, Tile, ExplorationPawn } from "@ashtrail/core";
import init, { find_path_wasm } from "@ashtrail/geo-wasm";
import wasmUrl from "@ashtrail/geo-wasm/geo_wasm_bg.wasm?url";

export function LocationExploration() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<ExplorationMap | null>(null);
    const [zoom, setZoom] = useState(1.2);
    const [offset, setOffset] = useState({ x: 50, y: 50 });
    const [wasmReady, setWasmReady] = useState(false);
    const [hoverTile, setHoverTile] = useState<{ x: number, y: number } | null>(null);
    const [selectedPawnId, setSelectedPawnId] = useState<string | null>("p1");

    const lastTickRef = useRef<number>(0);
    const requestRef = useRef<number>();

    // Initialize WASM
    useEffect(() => {
        init(wasmUrl).then(() => {
            setWasmReady(true);
        }).catch(err => console.error("WASM Init Error:", err));
    }, []);

    // Initialize a mock map for testing
    useEffect(() => {
        const width = 64;
        const height = 64;
        const tiles: Tile[] = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Procedural room-like generation for testing
                const isWall =
                    x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                    (x === 20 && y > 10 && y < 30 && y !== 20) || // Wall with door
                    (x > 10 && x < 30 && y === 10) ||
                    (x > 10 && x < 30 && y === 30);

                tiles.push({
                    type: isWall ? "wall" : "floor",
                    walkable: !isWall,
                    moveCost: isWall ? 0 : 1.0,
                });
            }
        }

        const pawns: ExplorationPawn[] = [
            {
                id: "p1",
                name: "Valentin",
                x: 15,
                y: 15,
                speed: 4.5,
                factionId: "player",
                type: "human",
            },
            {
                id: "p2",
                name: "Muffalo",
                x: 25,
                y: 25,
                speed: 3.0,
                factionId: "neutral",
                type: "animal",
            }
        ];

        setMap({ id: "rim-test-1", width, height, tiles, pawns });
    }, []);

    const tileSizeBase = 40;
    const tileSize = tileSizeBase * zoom;

    // Movement & Animation Update
    const update = (delta: number) => {
        setMap(prev => {
            if (!prev) return null;
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

        // 1. Draw Grid / Floor
        ctx.save();
        ctx.translate(offset.x, offset.y);

        const startVisibleX = Math.max(0, Math.floor(-offset.x / tileSize));
        const endVisibleX = Math.min(map.width, Math.ceil((canvas.width - offset.x) / tileSize));
        const startVisibleY = Math.max(0, Math.floor(-offset.y / tileSize));
        const endVisibleY = Math.min(map.height, Math.ceil((canvas.height - offset.y) / tileSize));

        for (let y = startVisibleY; y < endVisibleY; y++) {
            for (let x = startVisibleX; x < endVisibleX; x++) {
                const tile = map.tiles[y * map.width + x];
                const screenX = x * tileSize;
                const screenY = y * tileSize;

                // Base Tile
                if (tile.type === "wall") {
                    ctx.fillStyle = "#2d3436";
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);
                    // Add some bevel/texture to walls
                    ctx.strokeStyle = "rgba(0,0,0,0.3)";
                    ctx.strokeRect(screenX + 2, screenY + 2, tileSize - 4, tileSize - 4);
                } else {
                    ctx.fillStyle = "#1a1c23";
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);
                    // Grid lines
                    ctx.strokeStyle = "rgba(255,255,255,0.03)";
                    ctx.strokeRect(screenX, screenY, tileSize, tileSize);
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

        // 3. Draw Paths for selected pawn
        if (selectedPawnId) {
            const pawn = map.pawns.find(p => p.id === selectedPawnId);
            if (pawn?.path && pawn.path.length > 0) {
                ctx.beginPath();
                ctx.moveTo(pawn.x * tileSize + tileSize / 2, pawn.y * tileSize + tileSize / 2);
                pawn.path.forEach(pt => {
                    ctx.lineTo(pt.x * tileSize + tileSize / 2, pt.y * tileSize + tileSize / 2);
                });
                ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineWidth = 1;

                // End destination marker
                const target = pawn.path[pawn.path.length - 1];
                ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
                ctx.beginPath();
                ctx.arc(target.x * tileSize + tileSize / 2, target.y * tileSize + tileSize / 2, tileSize * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 4. Draw Pawns
        map.pawns.forEach(pawn => {
            const screenX = pawn.x * tileSize + tileSize / 2;
            const screenY = pawn.y * tileSize + tileSize / 2;
            const size = tileSize * 0.7;

            // Selection glow
            if (pawn.id === selectedPawnId) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#10b981";
                ctx.strokeStyle = "#10b981";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, size / 2 + 2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Pawn Body
            ctx.fillStyle = pawn.type === "human" ? "#74b9ff" : "#fab1a0";
            ctx.beginPath();
            ctx.arc(screenX, screenY, size / 2, 0, Math.PI * 2);
            ctx.fill();

            // Name Label (Glassmorphism style)
            const labelY = screenY - size / 2 - 12;
            ctx.font = "bold 9px Inter";
            const textWidth = ctx.measureText(pawn.name).width;

            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.roundRect(screenX - textWidth / 2 - 6, labelY - 8, textWidth + 12, 16, 4);
            ctx.fill();

            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText(pawn.name, screenX, labelY + 3);
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
                render();
            }
        };

        window.addEventListener("resize", handleResize);
        handleResize();
        requestRef.current = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener("resize", handleResize);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [map, zoom, offset, hoverTile, selectedPawnId]);

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!map) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const tileX = Math.floor((mouseX - offset.x) / tileSize);
        const tileY = Math.floor((mouseY - offset.y) / tileSize);

        if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
            if (!hoverTile || hoverTile.x !== tileX || hoverTile.y !== tileY) {
                setHoverTile({ x: tileX, y: tileY });
            }
        } else {
            setHoverTile(null);
        }
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (!map || !wasmReady) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const tileX = Math.floor((mouseX - offset.x) / tileSize);
        const tileY = Math.floor((mouseY - offset.y) / tileSize);

        // Right click or special selection could be added here
        // For now, click moves selected pawn
        if (selectedPawnId && tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
            const pawn = map.pawns.find(p => p.id === selectedPawnId);
            if (!pawn) return;

            const startX = Math.round(pawn.x);
            const startY = Math.round(pawn.y);
            const walkableGrid = map.tiles.map(t => t.walkable);

            try {
                const pathResult = find_path_wasm(
                    startX, startY,
                    tileX, tileY,
                    map.width, map.height,
                    walkableGrid
                );

                if (pathResult) {
                    const path = pathResult.map((pt: [number, number]) => ({ x: pt[0], y: pt[1] }));
                    setMap(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            pawns: prev.pawns.map(p => p.id === selectedPawnId ? { ...p, path } : p)
                        };
                    });
                }
            } catch (err) {
                console.error("Pathfinding error:", err);
            }
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(0.2, Math.min(z * delta, 4)));
    };

    return (
        <div ref={containerRef} className="w-full h-full relative bg-[#0f1115] overflow-hidden select-none">
            <canvas
                ref={canvasRef}
                onMouseMove={handleCanvasMouseMove}
                onMouseDown={handleCanvasClick}
                onWheel={handleWheel}
                className="cursor-crosshair w-full h-full"
            />

            {/* HUD Overlay */}
            <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none">
                <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl pointer-events-auto shadow-2xl">
                    <div className="text-[10px] text-[#A2A2A2] font-black tracking-[0.2em] mb-3 uppercase">Navigation</div>
                    <div className="flex gap-2">
                        <button onClick={() => setZoom(z => Math.min(z * 1.2, 4))} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all">+</button>
                        <button onClick={() => setZoom(z => Math.max(z / 1.2, 0.2))} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all">−</button>
                        <button onClick={() => setOffset({ x: 50, y: 50 })} className="px-3 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold tracking-widest transition-all">RESET</button>
                    </div>
                </div>

                {selectedPawnId && (
                    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl pointer-events-auto animate-in fade-in slide-in-from-left-4 duration-500 shadow-2xl">
                        <div className="text-[10px] text-[#10b981] font-black tracking-[0.2em] mb-3 uppercase">Active Pawn</div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#74b9ff]/20 border border-[#74b9ff]/40 flex items-center justify-center text-xl">👤</div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-white leading-tight">
                                    {map?.pawns.find(p => p.id === selectedPawnId)?.name}
                                </span>
                                <span className="text-[10px] text-gray-500 uppercase tracking-tighter">Colonist</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="absolute bottom-6 left-6 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-full backdrop-blur-md text-[9px] font-medium text-gray-500 pointer-events-none">
                <span className={wasmReady ? "text-[#10b981]" : "text-amber-500"}>
                    {wasmReady ? "● WASM_READY" : "○ WASM_LOADING"}
                </span>
                <span className="mx-2 opacity-20">|</span>
                TILE: {hoverTile ? `${hoverTile.x}, ${hoverTile.y}` : "--, --"}
                <span className="mx-2 opacity-20">|</span>
                ZOOM: {(zoom * 100).toFixed(0)}%
            </div>
        </div>
    );
}
