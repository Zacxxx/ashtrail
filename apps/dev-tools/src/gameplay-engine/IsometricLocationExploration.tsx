import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ExplorationMap, ExplorationPawn, MapObject } from "@ashtrail/core";
import { TILE_ELEVATION, TILE_HEIGHT, TILE_WIDTH, gridToScreen, screenToGrid } from "./iso/shared";
import { useExplorationWebSocket } from "./exploration/useExplorationWebSocket";

interface IsometricLocationExplorationProps {
    initialMap: ExplorationMap;
    initialSelectedPawnId: string | null;
    onExit: () => void;
}

type HoverCell = { row: number; col: number } | null;
type Camera = { x: number; y: number };

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;

function cellKey(row: number, col: number) {
    return `${row}:${col}`;
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

function getTile(map: ExplorationMap, row: number, col: number) {
    if (row < 0 || col < 0 || row >= map.height || col >= map.width) return null;
    return map.tiles[row * map.width + col] || null;
}

function isWallTile(tile: ExplorationMap["tiles"][number] | null | undefined) {
    return tile?.type === "wall" || (!tile?.walkable && tile?.type !== "door");
}

function isDoorTile(tile: ExplorationMap["tiles"][number] | null | undefined) {
    return tile?.type === "door";
}

function isInteriorTile(tile: ExplorationMap["tiles"][number] | null | undefined) {
    return Boolean(tile?.interiorId && (tile.type === "interior-floor" || tile.type === "door" || tile.type === "wall"));
}

function isRoofObject(object: MapObject) {
    return object.type.includes("roof") || Boolean(object.roofGroupId);
}

function isDoorObject(object: MapObject) {
    return object.type === "door" || Boolean(object.doorId);
}

function resolveInteriorReveal(map: ExplorationMap, selectedPawn: ExplorationPawn | null) {
    if (!selectedPawn) return { interiorId: null as string | null, roofGroups: new Set<string>() };
    const tile = getTile(map, Math.round(selectedPawn.y), Math.round(selectedPawn.x));
    const interiorId = tile?.interiorId || selectedPawn.homeInteriorId || null;
    const roofGroups = new Set<string>();
    if (!interiorId) return { interiorId, roofGroups };
    for (const object of map.objects) {
        if (object.interiorId === interiorId && object.roofGroupId) {
            roofGroups.add(object.roofGroupId);
        }
    }
    return { interiorId, roofGroups };
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

function isDiamondVisible(
    screenX: number,
    screenY: number,
    width: number,
    height: number,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
) {
    return !(
        screenX + width / 2 < -padding
        || screenX - width / 2 > viewportWidth + padding
        || screenY + height < -padding
        || screenY > viewportHeight + padding
    );
}

function isObjectVisible(
    screenX: number,
    screenY: number,
    width: number,
    height: number,
    extrusion: number,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
) {
    return !(
        screenX + width / 2 < -padding
        || screenX - width / 2 > viewportWidth + padding
        || screenY + height + extrusion < -padding
        || screenY - extrusion > viewportHeight + padding
    );
}

export function IsometricLocationExploration({
    initialMap,
    initialSelectedPawnId,
    onExit,
}: IsometricLocationExplorationProps) {
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

    const [hoverCell, setHoverCell] = useState<HoverCell>(null);
    const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [showGrid, setShowGrid] = useState(false);
    const {
        map,
        selectedPawnId,
        connectionState,
        isConnected,
        error,
        lastInteraction,
        moveTo,
        setSelectedPawnId,
        interact,
    } = useExplorationWebSocket({
        initialMap,
        initialSelectedPawnId,
    });

    const selectedPawn = useMemo(
        () => map.pawns.find((pawn) => pawn.id === selectedPawnId) || map.pawns[0] || null,
        [map.pawns, selectedPawnId],
    );
    const interiorReveal = useMemo(
        () => resolveInteriorReveal(map, selectedPawn),
        [map, selectedPawn],
    );
    const hoveredTile = useMemo(
        () => (hoverCell ? getTile(map, hoverCell.row, hoverCell.col) : null),
        [hoverCell, map],
    );
    const hoveredPawn = useMemo(
        () => hoverCell
            ? map.pawns.find((pawn) => Math.round(pawn.y) === hoverCell.row && Math.round(pawn.x) === hoverCell.col) || null
            : null,
        [hoverCell, map.pawns],
    );
    const hoveredObject = useMemo(
        () => hoverCell
            ? map.objects.find((object) => objectFootprintContains(object, hoverCell.row, hoverCell.col)) || null
            : null,
        [hoverCell, map.objects],
    );
    const sortedObjects = useMemo(
        () => [...map.objects].sort((left, right) => (left.x + left.y + left.height + left.width) - (right.x + right.y + right.height + right.width)),
        [map.objects],
    );
    const sortedPawns = useMemo(
        () => [...map.pawns].sort((left, right) => (left.x + left.y) - (right.x + right.y)),
        [map.pawns],
    );
    const interactionText = useMemo(() => {
        if (lastInteraction) {
            return lastInteraction;
        }
        if (hoveredPawn?.isNpc) {
            return `${hoveredPawn.interactionLabel || "Talk"}: ${hoveredPawn.name}`;
        }
        if (hoveredObject && isDoorObject(hoveredObject)) {
            return "Doorway";
        }
        if (hoveredTile?.type === "door") {
            return "Doorway";
        }
        if (hoveredObject && !isRoofObject(hoveredObject)) {
            return hoveredObject.type.replace(/-/g, " ");
        }
        return selectedPawn ? `${selectedPawn.name} ready` : "No active pawn";
    }, [hoveredObject, hoveredPawn, hoveredTile?.type, lastInteraction, selectedPawn]);

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
        for (const pawn of map.pawns) {
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
    }, [map.pawns]);

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
        if (!canvas) return;
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
        const ambientLight = map.ambientLight ?? 0.76;
        const viewportPadding = Math.max(120, scaledWidth * 2.5);

        const pathCells = new Set<string>();
        if (selectedPawn?.path) {
            for (const step of selectedPawn.path) {
                pathCells.add(cellKey(step.y, step.x));
            }
        }

        const drawDiamond = (screenX: number, screenY: number, fill: string, stroke = "rgba(0,0,0,0)", alpha = 1) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
            ctx.lineTo(screenX, screenY + scaledHeight);
            ctx.lineTo(screenX - scaledWidth / 2, screenY + scaledHeight / 2);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        };

        for (let row = 0; row < map.height; row += 1) {
            for (let col = 0; col < map.width; col += 1) {
                const tile = map.tiles[row * map.width + col];
                if (!tile) continue;

                const { x, y } = gridToScreen(row, col);
                const screenX = originX + x * zoom;
                const screenY = originY + y * zoom;
                if (!isDiamondVisible(screenX, screenY, scaledWidth, scaledHeight + scaledElevation, canvas.width, canvas.height, viewportPadding)) {
                    continue;
                }
                const isHovered = hoverCell?.row === row && hoverCell?.col === col;
                const inPath = pathCells.has(cellKey(row, col));
                const interiorVisible = tile.interiorId && tile.interiorId === interiorReveal.interiorId;
                const interiorHidden = isInteriorTile(tile) && !interiorVisible;
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
                    fill = "#6b5538";
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
                    const southBlocked = isWallTile(getTile(map, row + 1, col));
                    const eastBlocked = isWallTile(getTile(map, row, col + 1));
                    const topVisible = !isWallTile(getTile(map, row - 1, col)) || !isWallTile(getTile(map, row, col - 1));
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

                if (isDoorTile(tile)) {
                    ctx.beginPath();
                    ctx.moveTo(screenX - scaledWidth * 0.18, screenY + scaledHeight * 0.2 - scaledElevation * 0.75);
                    ctx.lineTo(screenX + scaledWidth * 0.18, screenY + scaledHeight * 0.35 - scaledElevation * 0.75);
                    ctx.lineTo(screenX + scaledWidth * 0.18, screenY + scaledHeight * 0.35);
                    ctx.lineTo(screenX - scaledWidth * 0.18, screenY + scaledHeight * 0.2);
                    ctx.closePath();
                    ctx.fillStyle = applyLight("#8b5e34", tileLight);
                    ctx.fill();
                }
            }
        }

        for (const object of sortedObjects) {
            if (isRoofObject(object) && object.roofGroupId && interiorReveal.roofGroups.has(object.roofGroupId)) {
                continue;
            }
            if (object.interiorId && object.interiorId !== interiorReveal.interiorId && !isRoofObject(object) && !isDoorObject(object)) {
                continue;
            }
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
            if (!isObjectVisible(screenX, screenY, footprintWidth, footprintHeight, height, canvas.width, canvas.height, viewportPadding)) {
                continue;
            }

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
            if (pawn.homeInteriorId && pawn.homeInteriorId !== interiorReveal.interiorId && pawn.isNpc) {
                continue;
            }
            const { x, y } = gridToScreen(pawn.y, pawn.x);
            const screenX = originX + x * zoom;
            const screenY = originY + y * zoom;
            if (!isObjectVisible(screenX, screenY - scaledHeight * 0.66, scaledWidth, scaledWidth * 1.15, scaledHeight, canvas.width, canvas.height, viewportPadding)) {
                continue;
            }
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
            for (let row = 0; row < map.height; row += 1) {
                for (let col = 0; col < map.width; col += 1) {
                    const { x, y } = gridToScreen(row, col);
                    const screenX = originX + x * zoom;
                    const screenY = originY + y * zoom;
                    if (!isDiamondVisible(screenX, screenY, scaledWidth, scaledHeight, canvas.width, canvas.height, viewportPadding)) {
                        continue;
                    }
                    ctx.beginPath();
                    ctx.moveTo(screenX, screenY);
                    ctx.lineTo(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
                    ctx.lineTo(screenX, screenY + scaledHeight);
                    ctx.lineTo(screenX - scaledWidth / 2, screenY + scaledHeight / 2);
                    ctx.closePath();
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        const glow = ctx.createRadialGradient(
            originX,
            originY,
            scaledWidth,
            originX,
            originY,
            Math.max(canvas.width, canvas.height) * 0.8,
        );
        glow.addColorStop(0, "rgba(255,255,255,0.04)");
        glow.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, [camera.x, camera.y, hoverCell, interiorReveal.interiorId, interiorReveal.roofGroups, map, selectedPawn, showGrid, sortedObjects, sortedPawns, zoom]);

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
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

        if (row >= 0 && col >= 0 && row < map.height && col < map.width) {
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

        const clickedPawn = map.pawns.find((pawn) => Math.round(pawn.y) === hoverCell.row && Math.round(pawn.x) === hoverCell.col);
        if (clickedPawn) {
            if (clickedPawn.isNpc) {
                interact(hoverCell.row, hoverCell.col, undefined, clickedPawn.id);
            } else {
                setSelectedPawnId(clickedPawn.id);
            }
            return;
        }

        const clickedObject = map.objects.find((object) => objectFootprintContains(object, hoverCell.row, hoverCell.col));
        if (clickedObject && (isDoorObject(clickedObject) || !clickedObject.passable)) {
            interact(hoverCell.row, hoverCell.col, clickedObject.id, undefined);
        }

        moveTo(selectedPawn.id, hoverCell.row, hoverCell.col);
    };

    return (
        <div className="w-full h-full min-h-0 flex flex-col bg-[#05090f]">
            <div className="shrink-0 flex items-center justify-between gap-4 border-b border-white/5 bg-black/50 px-4 py-3">
                <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white">
                        {map.name || "Exploration"}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                        {interactionText} • {map.pawns.filter((pawn) => pawn.isNpc).length} NPCs • {isConnected ? connectionState : "connecting"}
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
