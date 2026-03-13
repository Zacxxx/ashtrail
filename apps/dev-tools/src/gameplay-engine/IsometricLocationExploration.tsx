import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ExplorationChunk, ExplorationManifestDescriptor, ExplorationPawn, MapObject, Tile } from "@ashtrail/core";
import { TILE_ELEVATION, TILE_HEIGHT, TILE_WIDTH, gridToScreen, screenToGrid } from "./iso/shared";
import { useExplorationWebSocket } from "./exploration/useExplorationWebSocket";
import type { ExplorationLaunchConfig } from "./explorationSupport";

interface IsometricLocationExplorationProps {
    session: ExplorationLaunchConfig;
    onExit: () => void;
}

type HoverCell = { row: number; col: number } | null;
type Camera = { x: number; y: number };

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;

function cellKey(row: number, col: number) {
    return `${row}:${col}`;
}

function objectKey(object: MapObject) {
    return object.id;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function objectFootprintContains(object: MapObject, row: number, col: number) {
    return row >= object.y
        && row < object.y + object.height
        && col >= object.x
        && col < object.x + object.width;
}

function isWallTile(tile: Tile | null | undefined) {
    return tile?.type === "wall" || (!tile?.walkable && tile?.type !== "door");
}

function isDoorTile(tile: Tile | null | undefined) {
    return tile?.type === "door" || Boolean(tile?.doorId);
}

function isInteriorTile(tile: Tile | null | undefined) {
    return Boolean(tile?.interiorId && (tile.type === "interior-floor" || tile.type === "door" || tile.type === "wall"));
}

function isRoofObject(object: MapObject) {
    return object.type.includes("roof") || Boolean(object.roofGroupId);
}

function isDoorObject(object: MapObject) {
    return object.type === "door" || Boolean(object.doorId);
}

function applyLight(hex: string, factor: number) {
    const normalized = hex.replace("#", "");
    const bytes = normalized.length === 3
        ? normalized.split("").map((value) => parseInt(`${value}${value}`, 16))
        : [normalized.slice(0, 2), normalized.slice(2, 4), normalized.slice(4, 6)].map((value) => parseInt(value, 16));
    const [r, g, b] = bytes.map((value) => clamp(Math.round(value * factor), 0, 255));
    return `rgb(${r}, ${g}, ${b})`;
}

function getPawnSpriteUrl(pawn: ExplorationPawn) {
    if (pawn.textureUrl) return pawn.textureUrl;
    if (pawn.sprite?.directions && pawn.facing) {
        return pawn.sprite.directions[pawn.facing] || null;
    }
    return null;
}

function getPawnTone(pawn: ExplorationPawn, isSelected: boolean) {
    if (isSelected) return { fill: "#67e8f9", stroke: "#d1f8ff" };
    if (pawn.factionId === "player") return { fill: "#60a5fa", stroke: "#dbeafe" };
    return { fill: "#f59e0b", stroke: "#fde68a" };
}

function getObjectTone(object: MapObject) {
    if (isDoorObject(object)) return { top: "#c68a3a", left: "#8f5e24", right: "#73491a" };
    if (isRoofObject(object)) return { top: "#7a3642", left: "#542430", right: "#451d28" };
    if (object.type.includes("tree")) return { top: "#355f3a", left: "#244229", right: "#1c3420" };
    if (object.type.includes("rock")) return { top: "#6b7280", left: "#4b5563", right: "#374151" };
    if (object.type.includes("ruin")) return { top: "#8b7355", left: "#62513d", right: "#4d4031" };
    return { top: "#8b5e3c", left: "#5f3f29", right: "#4f3422" };
}

function getTile(
    chunksByCoord: Map<string, ExplorationChunk>,
    descriptor: ExplorationManifestDescriptor | null,
    row: number,
    col: number,
) {
    if (!descriptor || row < 0 || col < 0 || row >= descriptor.height || col >= descriptor.width) {
        return null;
    }
    const chunkRow = Math.floor(row / descriptor.chunkSize);
    const chunkCol = Math.floor(col / descriptor.chunkSize);
    const chunk = chunksByCoord.get(cellKey(chunkRow, chunkCol));
    if (!chunk) return null;
    const localRow = row - chunk.originRow;
    const localCol = col - chunk.originCol;
    if (localRow < 0 || localCol < 0 || localRow >= chunk.height || localCol >= chunk.width) {
        return null;
    }
    return chunk.tiles[localRow * chunk.width + localCol] || null;
}

export function IsometricLocationExploration({ session, onExit }: IsometricLocationExplorationProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ active: boolean; x: number; y: number; cameraX: number; cameraY: number }>({
        active: false,
        x: 0,
        y: 0,
        cameraX: 0,
        cameraY: 0,
    });
    const frameRef = useRef<number>(0);
    const lastFrameRef = useRef<number>(0);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const keysPressedRef = useRef<Set<string>>(new Set());
    const pointerRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });
    const lastSubscriptionRef = useRef<string>("");

    const [hoverCell, setHoverCell] = useState<HoverCell>(null);
    const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [showGrid, setShowGrid] = useState(false);
    const {
        descriptor,
        chunks,
        pawns,
        selectedPawnId,
        visibility,
        connectionState,
        isConnected,
        error,
        lastInteraction,
        moveTo,
        setSelectedPawnId,
        interact,
        subscribeChunks,
    } = useExplorationWebSocket({ session });

    const chunksByCoord = useMemo(
        () => new Map(chunks.map((chunk) => [cellKey(chunk.chunkRow, chunk.chunkCol), chunk])),
        [chunks],
    );
    const loadedObjects = useMemo(() => {
        const deduped = new Map<string, MapObject>();
        for (const chunk of chunks) {
            for (const object of chunk.objects) {
                if (!deduped.has(objectKey(object))) {
                    deduped.set(objectKey(object), object);
                }
            }
        }
        return [...deduped.values()];
    }, [chunks]);

    const visibleObjects = useMemo(
        () => loadedObjects.filter((object) => {
            if (isRoofObject(object) && object.roofGroupId && visibility.revealedRoofGroupIds.includes(object.roofGroupId)) {
                return false;
            }
            if (object.interiorId && object.interiorId !== visibility.revealedInteriorId && !isRoofObject(object) && !isDoorObject(object)) {
                return false;
            }
            return true;
        }),
        [loadedObjects, visibility.openedDoorIds, visibility.revealedInteriorId, visibility.revealedRoofGroupIds],
    );

    const selectedPawn = useMemo(
        () => pawns.find((pawn) => pawn.id === selectedPawnId) || pawns.find((pawn) => pawn.factionId === "player") || pawns[0] || null,
        [pawns, selectedPawnId],
    );
    const hoveredTile = useMemo(
        () => (hoverCell ? getTile(chunksByCoord, descriptor, hoverCell.row, hoverCell.col) : null),
        [chunksByCoord, descriptor, hoverCell],
    );
    const hoveredPawn = useMemo(
        () => hoverCell
            ? pawns.find((pawn) => Math.round(pawn.y) === hoverCell.row && Math.round(pawn.x) === hoverCell.col) || null
            : null,
        [hoverCell, pawns],
    );
    const hoveredObject = useMemo(
        () => hoverCell
            ? visibleObjects.find((object) => objectFootprintContains(object, hoverCell.row, hoverCell.col)) || null
            : null,
        [hoverCell, visibleObjects],
    );
    const sortedObjects = useMemo(
        () => [...visibleObjects].sort((left, right) => (left.x + left.y + left.height + left.width) - (right.x + right.y + right.height + right.width)),
        [visibleObjects],
    );
    const sortedPawns = useMemo(
        () => [...pawns].sort((left, right) => (left.x + left.y) - (right.x + right.y)),
        [pawns],
    );
    const interactionText = useMemo(() => {
        if (lastInteraction) {
            return lastInteraction;
        }
        if (hoveredPawn?.isNpc) {
            return `${hoveredPawn.interactionLabel || "Talk"}: ${hoveredPawn.name}`;
        }
        if (hoveredObject && isDoorObject(hoveredObject)) {
            return visibility.openedDoorIds.includes(hoveredObject.doorId || "") ? "Open doorway" : "Closed doorway";
        }
        if (hoveredTile?.type === "door") {
            return hoveredTile.doorId && visibility.openedDoorIds.includes(hoveredTile.doorId) ? "Open doorway" : "Closed doorway";
        }
        if (hoveredObject && !isRoofObject(hoveredObject)) {
            return hoveredObject.type.replace(/-/g, " ");
        }
        return selectedPawn ? `${selectedPawn.name} ready` : "Connecting exploration session";
    }, [hoveredObject, hoveredPawn, hoveredTile?.doorId, hoveredTile?.type, lastInteraction, selectedPawn, visibility.openedDoorIds]);

    const centerCameraOnPawn = React.useCallback((pawn: ExplorationPawn | null, nextZoom: number) => {
        if (!pawn) return;
        const { x, y } = gridToScreen(pawn.y, pawn.x);
        setCamera({
            x: -x * nextZoom,
            y: (-y - TILE_HEIGHT) * nextZoom,
        });
    }, []);

    useEffect(() => {
        if (selectedPawn && containerRef.current) {
            centerCameraOnPawn(selectedPawn, zoom);
        }
    }, [centerCameraOnPawn, selectedPawn?.id, zoom]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            keysPressedRef.current.add(event.key.toLowerCase());
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            keysPressedRef.current.delete(event.key.toLowerCase());
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    useEffect(() => {
        const urls = new Set<string>();
        for (const pawn of pawns) {
            const url = getPawnSpriteUrl(pawn);
            if (url) urls.add(url);
        }
        urls.forEach((url) => {
            if (imageCacheRef.current.has(url)) return;
            const image = new Image();
            image.src = url;
            image.onload = () => {
                imageCacheRef.current.set(url, image);
            };
        });
    }, [pawns]);

    useEffect(() => {
        const tick = (timestamp: number) => {
            const delta = lastFrameRef.current ? Math.min(0.05, (timestamp - lastFrameRef.current) / 1000) : 0;
            lastFrameRef.current = timestamp;

            if (delta > 0 && containerRef.current) {
                const EDGE_THRESHOLD = 72;
                const PAN_SPEED = 840 * delta;
                let panX = 0;
                let panY = 0;
                const keys = keysPressedRef.current;
                const pointer = pointerRef.current;
                const width = containerRef.current.clientWidth;
                const height = containerRef.current.clientHeight;

                if (pointer.inside) {
                    if (pointer.x <= EDGE_THRESHOLD) panX += PAN_SPEED;
                    if (pointer.x >= width - EDGE_THRESHOLD) panX -= PAN_SPEED;
                    if (pointer.y <= EDGE_THRESHOLD) panY += PAN_SPEED;
                    if (pointer.y >= height - EDGE_THRESHOLD) panY -= PAN_SPEED;
                }

                if (keys.has("a") || keys.has("arrowleft")) panX += PAN_SPEED;
                if (keys.has("d") || keys.has("arrowright")) panX -= PAN_SPEED;
                if (keys.has("w") || keys.has("arrowup")) panY += PAN_SPEED;
                if (keys.has("s") || keys.has("arrowdown")) panY -= PAN_SPEED;

                if (panX !== 0 || panY !== 0) {
                    setCamera((previous) => ({
                        x: previous.x + panX,
                        y: previous.y + panY,
                    }));
                }
            }

            frameRef.current = window.requestAnimationFrame(tick);
        };

        frameRef.current = window.requestAnimationFrame(tick);
        return () => {
            window.cancelAnimationFrame(frameRef.current);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        };

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !descriptor) return;

        const worldX = (-camera.x) / zoom;
        const worldY = (-camera.y) / zoom;
        const center = screenToGrid(worldX, worldY);
        const halfWidth = canvas.width / (2 * zoom);
        const halfHeight = canvas.height / (2 * zoom);
        const corners = [
            screenToGrid(worldX - halfWidth, worldY - halfHeight),
            screenToGrid(worldX + halfWidth, worldY - halfHeight),
            screenToGrid(worldX - halfWidth, worldY + halfHeight),
            screenToGrid(worldX + halfWidth, worldY + halfHeight),
        ];
        const centerChunkRow = Math.floor(center.row / descriptor.chunkSize);
        const centerChunkCol = Math.floor(center.col / descriptor.chunkSize);
        const chunkRadius = Math.min(2, Math.max(
            0,
            ...corners.map((corner) => Math.max(
                Math.abs(Math.floor(corner.row / descriptor.chunkSize) - centerChunkRow),
                Math.abs(Math.floor(corner.col / descriptor.chunkSize) - centerChunkCol),
            )),
        ) + 1);
        const subscriptionKey = `${center.row}:${center.col}:${chunkRadius}`;
        if (lastSubscriptionRef.current !== subscriptionKey) {
            lastSubscriptionRef.current = subscriptionKey;
            subscribeChunks(
                clamp(center.row, 0, descriptor.height - 1),
                clamp(center.col, 0, descriptor.width - 1),
                chunkRadius,
            );
        }
    }, [camera.x, camera.y, descriptor, subscribeChunks, zoom]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !descriptor) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#081018";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const originX = canvas.width / 2 + camera.x;
        const originY = canvas.height / 2 + camera.y;
        const scaledWidth = TILE_WIDTH * zoom;
        const scaledHeight = TILE_HEIGHT * zoom;
        const scaledElevation = TILE_ELEVATION * zoom;
        const ambientLight = descriptor.ambientLight ?? 0.76;

        const pathCells = new Set<string>();
        if (selectedPawn?.path) {
            for (const step of selectedPawn.path) {
                pathCells.add(cellKey(step.y, step.x));
            }
        }

        const drawDiamond = (screenX: number, screenY: number, fill: string, stroke = "rgba(0,0,0,0)") => {
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
            ctx.lineTo(screenX, screenY + scaledHeight);
            ctx.lineTo(screenX - scaledWidth / 2, screenY + scaledHeight / 2);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            if (stroke !== "rgba(0,0,0,0)") {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        };

        for (const chunk of chunks) {
            for (let localRow = 0; localRow < chunk.height; localRow += 1) {
                for (let localCol = 0; localCol < chunk.width; localCol += 1) {
                    const row = chunk.originRow + localRow;
                    const col = chunk.originCol + localCol;
                    const tile = chunk.tiles[localRow * chunk.width + localCol];
                    if (!tile) continue;

                    const { x, y } = gridToScreen(row, col);
                    const screenX = originX + x * zoom;
                    const screenY = originY + y * zoom;
                    const isHovered = hoverCell?.row === row && hoverCell?.col === col;
                    const inPath = pathCells.has(cellKey(row, col));
                    const interiorVisible = tile.interiorId && tile.interiorId === visibility.revealedInteriorId;
                    const interiorHidden = isInteriorTile(tile) && !interiorVisible;
                    const doorOpen = tile.doorId ? visibility.openedDoorIds.includes(tile.doorId) : false;
                    const tileLight = clamp((tile.lightLevel ?? 0.82) * ambientLight * (interiorVisible ? 1.18 : 1), 0.18, 1.15);

                    let fill = tile.walkable ? "#273444" : "#1a2230";
                    let stroke = "rgba(0,0,0,0)";
                    if (tile.type === "wall") {
                        fill = "#3b3b45";
                    }
                    if (tile.type === "interior-floor") {
                        fill = "#473a2c";
                    }
                    if (tile.type === "door") {
                        fill = doorOpen ? "#9a7a54" : "#6b5538";
                    }
                    if (tile.type === "floor") {
                        fill = "#314638";
                    }
                    if (interiorHidden && tile.type !== "door") {
                        fill = "#12161f";
                    }
                    if (isHovered) {
                        fill = "#155e75";
                        stroke = "#67e8f9";
                    } else if (inPath) {
                        fill = "#0f766e";
                        stroke = "#5eead4";
                    }

                    drawDiamond(screenX, screenY, applyLight(fill, tileLight), stroke);

                    if (isWallTile(tile) && !interiorHidden) {
                        const southBlocked = isWallTile(getTile(chunksByCoord, descriptor, row + 1, col));
                        const eastBlocked = isWallTile(getTile(chunksByCoord, descriptor, row, col + 1));
                        const topVisible = !isWallTile(getTile(chunksByCoord, descriptor, row - 1, col)) || !isWallTile(getTile(chunksByCoord, descriptor, row, col - 1));
                        if (topVisible) {
                            drawDiamond(screenX, screenY - scaledElevation, applyLight("#4b5563", tileLight * 1.04), "rgba(255,255,255,0.04)");
                        }
                        if (!southBlocked) {
                            ctx.beginPath();
                            ctx.moveTo(screenX - scaledWidth / 2, screenY + scaledHeight / 2 - scaledElevation);
                            ctx.lineTo(screenX, screenY + scaledHeight - scaledElevation);
                            ctx.lineTo(screenX, screenY + scaledHeight);
                            ctx.lineTo(screenX - scaledWidth / 2, screenY + scaledHeight / 2);
                            ctx.closePath();
                            ctx.fillStyle = applyLight("#374151", tileLight * 0.84);
                            ctx.fill();
                        }
                        if (!eastBlocked) {
                            ctx.beginPath();
                            ctx.moveTo(screenX + scaledWidth / 2, screenY + scaledHeight / 2 - scaledElevation);
                            ctx.lineTo(screenX, screenY + scaledHeight - scaledElevation);
                            ctx.lineTo(screenX, screenY + scaledHeight);
                            ctx.lineTo(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
                            ctx.closePath();
                            ctx.fillStyle = applyLight("#1f2937", tileLight * 0.72);
                            ctx.fill();
                        }
                    }
                }
            }
        }

        for (const object of sortedObjects) {
            const { top, left, right } = getObjectTone(object);
            const alpha = object.isHidden ? 0.24 : isRoofObject(object) ? 0.88 : 0.96;
            const anchorRow = object.y + (object.height - 1) / 2;
            const anchorCol = object.x + (object.width - 1) / 2;
            const { x, y } = gridToScreen(anchorRow, anchorCol);
            const footprintScale = isRoofObject(object) ? 1 : isDoorObject(object) ? 0.42 : 0.68;
            const screenX = originX + x * zoom;
            const screenY = originY + y * zoom - (Math.max(object.heightTiles || 1, 1) * scaledElevation * (isRoofObject(object) ? 0.72 : 0.26));
            const footprintWidth = scaledWidth * ((object.width + object.height) / 2) * footprintScale;
            const footprintHeight = scaledHeight * ((object.width + object.height) / 2) * footprintScale;
            const height = scaledElevation * Math.max(1, object.heightTiles || Math.min(3, Math.max(object.width, object.height)));

            ctx.save();
            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + footprintWidth / 2, screenY + footprintHeight / 2);
            ctx.lineTo(screenX, screenY + footprintHeight);
            ctx.lineTo(screenX - footprintWidth / 2, screenY + footprintHeight / 2);
            ctx.closePath();
            ctx.fillStyle = top;
            ctx.fill();
            if (isRoofObject(object)) {
                ctx.strokeStyle = "rgba(255,255,255,0.06)";
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.moveTo(screenX - footprintWidth / 2, screenY + footprintHeight / 2);
            ctx.lineTo(screenX, screenY + footprintHeight);
            ctx.lineTo(screenX, screenY + footprintHeight + height);
            ctx.lineTo(screenX - footprintWidth / 2, screenY + footprintHeight / 2 + height);
            ctx.closePath();
            ctx.fillStyle = left;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(screenX + footprintWidth / 2, screenY + footprintHeight / 2);
            ctx.lineTo(screenX, screenY + footprintHeight);
            ctx.lineTo(screenX, screenY + footprintHeight + height);
            ctx.lineTo(screenX + footprintWidth / 2, screenY + footprintHeight / 2 + height);
            ctx.closePath();
            ctx.fillStyle = right;
            ctx.fill();
            ctx.restore();
        }

        for (const pawn of sortedPawns) {
            if (pawn.homeInteriorId && pawn.homeInteriorId !== visibility.revealedInteriorId && pawn.isNpc) {
                continue;
            }
            const { x, y } = gridToScreen(pawn.y, pawn.x);
            const screenX = originX + x * zoom;
            const screenY = originY + y * zoom;
            const isSelected = pawn.id === selectedPawn?.id;
            const tone = getPawnTone(pawn, isSelected);
            const spriteUrl = getPawnSpriteUrl(pawn);
            const sprite = spriteUrl ? imageCacheRef.current.get(spriteUrl) : null;

            ctx.beginPath();
            ctx.ellipse(screenX, screenY + scaledHeight * 0.78, scaledWidth * 0.18, scaledHeight * 0.18, 0, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? "rgba(34,211,238,0.35)" : "rgba(15,23,42,0.45)";
            ctx.fill();

            if (sprite) {
                const spriteWidth = scaledWidth * 0.95;
                const spriteHeight = scaledWidth * 1.05;
                ctx.drawImage(sprite, screenX - spriteWidth / 2, screenY - spriteHeight * 0.66, spriteWidth, spriteHeight);
            } else {
                ctx.beginPath();
                ctx.arc(screenX, screenY + scaledHeight * 0.12, scaledWidth * 0.18, 0, Math.PI * 2);
                ctx.fillStyle = tone.fill;
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = tone.stroke;
                ctx.stroke();
            }

            ctx.fillStyle = "#f8fafc";
            ctx.font = `${Math.max(10, 11 * zoom)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(pawn.name, screenX, screenY - scaledHeight * 0.18);
        }

        if (showGrid) {
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.045)";
            ctx.lineWidth = 1;
            for (const chunk of chunks) {
                for (let localRow = 0; localRow < chunk.height; localRow += 1) {
                    for (let localCol = 0; localCol < chunk.width; localCol += 1) {
                        const row = chunk.originRow + localRow;
                        const col = chunk.originCol + localCol;
                        const { x, y } = gridToScreen(row, col);
                        const screenX = originX + x * zoom;
                        const screenY = originY + y * zoom;
                        ctx.beginPath();
                        ctx.moveTo(screenX, screenY);
                        ctx.lineTo(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
                        ctx.lineTo(screenX, screenY + scaledHeight);
                        ctx.lineTo(screenX - scaledWidth / 2, screenY + scaledHeight / 2);
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
            }
            ctx.restore();
        }
    }, [
        camera.x,
        camera.y,
        chunks,
        chunksByCoord,
        descriptor,
        hoverCell,
        pawns,
        selectedPawn,
        showGrid,
        sortedObjects,
        sortedPawns,
        visibility.openedDoorIds,
        visibility.revealedInteriorId,
        visibility.revealedRoofGroupIds,
        zoom,
    ]);

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !descriptor) return;
        const rect = canvas.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        pointerRef.current = { x: localX, y: localY, inside: true };

        if (dragRef.current.active) {
            setCamera({
                x: dragRef.current.cameraX + (event.clientX - dragRef.current.x),
                y: dragRef.current.cameraY + (event.clientY - dragRef.current.y),
            });
            return;
        }

        const worldX = (localX - canvas.width / 2 - camera.x) / zoom;
        const worldY = (localY - canvas.height / 2 - camera.y) / zoom;
        const { row, col } = screenToGrid(worldX, worldY);

        if (row >= 0 && col >= 0 && row < descriptor.height && col < descriptor.width) {
            setHoverCell((previous) => (previous?.row === row && previous?.col === col ? previous : { row, col }));
        } else {
            setHoverCell((previous) => (previous === null ? previous : null));
        }
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 1 && event.button !== 2) return;
        dragRef.current = {
            active: true,
            x: event.clientX,
            y: event.clientY,
            cameraX: camera.x,
            cameraY: camera.y,
        };
    };

    const handlePointerUp = () => {
        dragRef.current.active = false;
    };

    const updateZoom = (direction: "in" | "out") => {
        setZoom((previous) => {
            const next = clamp(previous + (direction === "in" ? 0.1 : -0.1), MIN_ZOOM, MAX_ZOOM);
            centerCameraOnPawn(selectedPawn, next);
            return next;
        });
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        if (event.deltaY < 0) {
            updateZoom("in");
        } else {
            updateZoom("out");
        }
    };

    const handleClick = () => {
        if (!hoverCell || !selectedPawn) return;

        const clickedPawn = pawns.find((pawn) => Math.round(pawn.y) === hoverCell.row && Math.round(pawn.x) === hoverCell.col);
        if (clickedPawn) {
            if (clickedPawn.isNpc) {
                interact(hoverCell.row, hoverCell.col, undefined, clickedPawn.id);
            } else {
                setSelectedPawnId(clickedPawn.id);
            }
            return;
        }

        const clickedObject = visibleObjects.find((object) => objectFootprintContains(object, hoverCell.row, hoverCell.col)) || null;
        const clickedTile = getTile(chunksByCoord, descriptor, hoverCell.row, hoverCell.col);
        const isClosedDoor = Boolean(
            (clickedObject?.doorId && !visibility.openedDoorIds.includes(clickedObject.doorId))
            || (clickedTile?.doorId && !visibility.openedDoorIds.includes(clickedTile.doorId)),
        );

        if (clickedObject && (isClosedDoor || !clickedObject.passable)) {
            interact(hoverCell.row, hoverCell.col, clickedObject.id, undefined);
            return;
        }

        if (clickedTile?.type === "door" && isClosedDoor) {
            interact(hoverCell.row, hoverCell.col, undefined, undefined);
            return;
        }

        moveTo(selectedPawn.id, hoverCell.row, hoverCell.col);
    };

    return (
        <div className="w-full h-full min-h-0 flex flex-col bg-[#05090f]">
            <div className="shrink-0 flex items-center justify-between gap-4 border-b border-white/5 bg-black/50 px-4 py-3">
                <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white">
                        {descriptor?.name || session.locationId || "Exploration"}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                        {interactionText} • {pawns.filter((pawn) => pawn.isNpc).length} NPCs • {isConnected ? connectionState : "connecting"}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => updateZoom("out")}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                    >
                        -
                    </button>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300">
                        {Math.round(zoom * 100)}%
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowGrid((previous) => !previous)}
                        className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${showGrid
                            ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
                            : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:text-white"}`}
                    >
                        Grid
                    </button>
                    <button
                        type="button"
                        onClick={() => updateZoom("in")}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        onClick={onExit}
                        className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-red-200 transition-colors hover:border-red-400/40 hover:text-white"
                    >
                        Exit
                    </button>
                </div>
            </div>

            <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
                {error && (
                    <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border border-red-500/20 bg-red-950/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-red-100 backdrop-blur-md">
                        {error}
                    </div>
                )}
                {!descriptor && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[11px] font-black uppercase tracking-[0.24em] text-gray-400">
                        Loading exploration chunks...
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className="h-full w-full cursor-crosshair"
                    onPointerMove={handlePointerMove}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={() => {
                        dragRef.current.active = false;
                        pointerRef.current.inside = false;
                        setHoverCell(null);
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                    onWheel={handleWheel}
                    onClick={handleClick}
                />

                <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300 backdrop-blur-md">
                    <span>Click to move</span>
                    <span className="text-white/20">•</span>
                    <span>Click pawn to select</span>
                    <span className="text-white/20">•</span>
                    <span>Edge or WASD to pan</span>
                </div>
            </div>
        </div>
    );
}
