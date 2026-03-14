import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type {
    ExplorationChunk,
    ExplorationManifestDescriptor,
    ExplorationPawn,
    MapObject,
    Tile,
} from "@ashtrail/core";
import { useExplorationWebSocket } from "./exploration/useExplorationWebSocket";
import type { ExplorationLaunchConfig } from "./explorationSupport";

interface IsometricLocationExplorationProps {
    session: ExplorationLaunchConfig;
    onExit: () => void;
}

type HoverCell = { row: number; col: number } | null;

type ChunkVisual = {
    group: THREE.Group;
    roofs: Array<{ groupId: string | null; mesh: THREE.Object3D }>;
    interiors: Array<{ interiorId: string | null; mesh: THREE.Object3D }>;
};

const DEFAULT_ZOOM = 1.15;
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 4.25;
const PAN_SPEED = 14;
const EDGE_THRESHOLD = 72;
const TILE_HEIGHT = 0.28;
const WALL_HEIGHT = 1.75;
const MAX_PIXEL_RATIO = 1.5;

const BOX_GEOMETRY_CACHE = new Map<string, THREE.BoxGeometry>();
const MATERIAL_CACHE = new Map<string, THREE.MeshLambertMaterial>();

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function cellKey(row: number, col: number) {
    return `${row}:${col}`;
}

function objectKey(object: MapObject) {
    return object.id;
}

function chunkCoordKey(chunk: ExplorationChunk) {
    return cellKey(chunk.chunkRow, chunk.chunkCol);
}

function objectFootprintContains(object: MapObject, row: number, col: number) {
    return row >= object.y
        && row < object.y + object.height
        && col >= object.x
        && col < object.x + object.width;
}

function isRoofObject(object: MapObject) {
    return object.type.includes("roof") || Boolean(object.roofGroupId);
}

function isDoorObject(object: MapObject) {
    return object.type === "door" || Boolean(object.doorId);
}

function isStructuralObject(object: MapObject) {
    return isRoofObject(object) || isDoorObject(object) || object.type.includes("wall");
}

function isWallTile(tile: Tile | null | undefined) {
    return tile?.type === "wall" || (!tile?.walkable && tile?.type !== "door");
}

function isInteriorContentTile(tile: Tile | null | undefined) {
    return tile?.type === "interior-floor";
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

function tileColor(tile: Tile, hovered: boolean, inRoute: boolean, interiorVisible: boolean, doorOpen: boolean) {
    let color = "#27303d";
    if (hovered) return "#2dd4bf";
    if (inRoute) return "#22c55e";
    if (tile.type === "wall") color = "#b1a89a";
    else if (tile.type === "interior-floor") color = interiorVisible ? "#d6b27a" : "#4f3c2a";
    else if (tile.type === "door") color = doorOpen ? "#be9660" : "#7e5426";
    else if (tile.type === "floor") color = "#78ad54";
    else if (tile.walkable) color = "#5f8248";

    const shaded = new THREE.Color(color);
    const lightFactor = tile.lightLevel == null
        ? 1
        : 0.62 + tile.lightLevel * (tile.type === "interior-floor" ? 0.44 : 0.52);
    shaded.multiplyScalar(clamp(lightFactor, 0.2, 1.65));
    return `#${shaded.getHexString()}`;
}

function objectPalette(object: MapObject) {
    if (isDoorObject(object)) return { color: "#9b622c", emissive: "#2c1402" };
    if (isRoofObject(object)) return { color: "#c09155", emissive: "#2b1304" };
    if (object.type.includes("tree")) return { color: "#5f8e42", emissive: "#10200a" };
    if (object.type.includes("rock")) return { color: "#7a7f89", emissive: "#0f1014" };
    return { color: "#93704e", emissive: "#201006" };
}

function visiblePawnAtCell(
    pawns: ExplorationPawn[],
    chunksByCoord: Map<string, ExplorationChunk>,
    descriptor: ExplorationManifestDescriptor | null,
    revealedInteriorId: string | null,
    row: number,
    col: number,
) {
    return pawns.find((pawn) => {
        const pawnRow = Number.isFinite(pawn.tileRow) ? pawn.tileRow : Math.round(pawn.y);
        const pawnCol = Number.isFinite(pawn.tileCol) ? pawn.tileCol : Math.round(pawn.x);
        if (pawnRow !== row || pawnCol !== col) {
            return false;
        }
        if (!pawn.isNpc) {
            return true;
        }
        const tile = getTile(chunksByCoord, descriptor, pawnRow, pawnCol);
        return !tile?.interiorId || tile.interiorId === revealedInteriorId;
    }) || null;
}

function createStandardMaterial(color: string, emissive?: string, opacity = 1) {
    const key = `${color}:${emissive || ""}:${opacity}`;
    const cached = MATERIAL_CACHE.get(key);
    if (cached) {
        return cached;
    }
    const material = new THREE.MeshLambertMaterial({
        color,
        emissive: emissive ? new THREE.Color(emissive) : new THREE.Color("#000000"),
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
    });
    MATERIAL_CACHE.set(key, material);
    return material;
}

function getBoxGeometry(width: number, height: number, depth: number) {
    const key = `${width}:${height}:${depth}`;
    const cached = BOX_GEOMETRY_CACHE.get(key);
    if (cached) {
        return cached;
    }
    const geometry = new THREE.BoxGeometry(width, height, depth);
    BOX_GEOMETRY_CACHE.set(key, geometry);
    return geometry;
}

function createBlock(
    width: number,
    height: number,
    depth: number,
    color: string,
    position: THREE.Vector3Like,
    emissive?: string,
    opacity = 1,
) {
    const mesh = new THREE.Mesh(
        getBoxGeometry(width, height, depth),
        createStandardMaterial(color, emissive, opacity),
    );
    mesh.position.set(position.x, position.y, position.z);
    return mesh;
}

function buildChunkVisual(
    chunk: ExplorationChunk,
    chunksByCoord: Map<string, ExplorationChunk>,
    descriptor: ExplorationManifestDescriptor,
    visibility: {
        revealedInteriorId: string | null;
        revealedRoofGroupIds: string[];
        openedDoorIds: string[];
    },
    showGrid: boolean,
) {
    const group = new THREE.Group();
    group.name = chunk.id;
    const roofs: ChunkVisual["roofs"] = [];
    const interiors: ChunkVisual["interiors"] = [];

    for (let localRow = 0; localRow < chunk.height; localRow += 1) {
        for (let localCol = 0; localCol < chunk.width; localCol += 1) {
            const row = chunk.originRow + localRow;
            const col = chunk.originCol + localCol;
            const tile = chunk.tiles[localRow * chunk.width + localCol];
            if (!tile) continue;

            const interiorVisible = !tile.interiorId || tile.interiorId === visibility.revealedInteriorId;
            const doorOpen = Boolean(tile.doorId && visibility.openedDoorIds.includes(tile.doorId));
            const color = tileColor(
                tile,
                false,
                false,
                interiorVisible,
                doorOpen,
            );
            const baseHeight = tile.type === "interior-floor" ? 0.18 : TILE_HEIGHT;
            const floor = createBlock(1, baseHeight, 1, color, {
                x: col,
                y: baseHeight / 2,
                z: row,
            }, "#050805");
            if (isInteriorContentTile(tile) && !interiorVisible) {
                floor.visible = false;
            }
            group.add(floor);

            if (showGrid) {
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.01, 1)),
                    new THREE.LineBasicMaterial({ color: "#17202a", transparent: true, opacity: 0.18 }),
                );
                edges.position.set(col, 0.02, row);
                group.add(edges);
            }

            if (isWallTile(tile)) {
                const wall = createBlock(0.92, WALL_HEIGHT, 0.92, "#b3a896", {
                    x: col,
                    y: baseHeight + WALL_HEIGHT / 2,
                    z: row,
                }, "#0a0804");
                if (isInteriorContentTile(tile) && !interiorVisible) {
                    wall.visible = false;
                }
                group.add(wall);
            }
        }
    }

    const seen = new Set<string>();
    for (const object of chunk.objects) {
        if (seen.has(objectKey(object))) continue;
        seen.add(objectKey(object));

        const palette = objectPalette(object);
        const centerX = object.x + (object.width - 1) / 2;
        const centerZ = object.y + (object.height - 1) / 2;
        const interiorVisible = !object.interiorId || object.interiorId === visibility.revealedInteriorId;
        if (object.interiorId && !interiorVisible && !isStructuralObject(object)) {
            continue;
        }

        if (isRoofObject(object)) {
            const roofRevealed = Boolean(
                object.roofGroupId && visibility.revealedRoofGroupIds.includes(object.roofGroupId),
            );
            const roofHeight = 0.38;
            const roof = createBlock(
                Math.max(0.92, object.width - 0.08),
                roofHeight,
                Math.max(0.92, object.height - 0.08),
                palette.color,
                {
                    x: centerX,
                    y: TILE_HEIGHT + WALL_HEIGHT + roofHeight / 2 - 0.03,
                    z: centerZ,
                },
                palette.emissive,
                roofRevealed ? 0.24 : 1,
            );
            roof.renderOrder = roofRevealed ? 1 : 0;
            roofs.push({ groupId: object.roofGroupId || null, mesh: roof });
            group.add(roof);
            continue;
        }

        if (object.type.includes("tree")) {
            const treeShadow = new THREE.Mesh(
                new THREE.CylinderGeometry(0.34, 0.42, 0.02, 14),
                new THREE.MeshBasicMaterial({ color: "#0b1408", transparent: true, opacity: 0.22 }),
            );
            treeShadow.position.set(centerX, 0.02, centerZ + 0.04);
            const trunk = createBlock(0.28, 1.05, 0.28, "#8e5b33", {
                x: centerX,
                y: TILE_HEIGHT + 0.52,
                z: centerZ,
            });
            const canopyA = createBlock(0.9, 0.55, 0.9, palette.color, {
                x: centerX,
                y: TILE_HEIGHT + 1.18,
                z: centerZ,
            }, palette.emissive);
            const canopyB = createBlock(0.56, 0.46, 0.56, "#6ea24d", {
                x: centerX + 0.14,
                y: TILE_HEIGHT + 1.54,
                z: centerZ - 0.12,
            }, "#0f1a08");
            const canopyC = createBlock(0.48, 0.34, 0.48, "#7ab155", {
                x: centerX - 0.2,
                y: TILE_HEIGHT + 1.34,
                z: centerZ + 0.16,
            }, "#10230a");
            group.add(treeShadow, trunk, canopyA, canopyB, canopyC);
            continue;
        }

        const objectHeight = isDoorObject(object)
            ? 1.18
            : (object.heightTiles || Math.max(1, Math.min(3, Math.max(object.width, object.height)))) * 0.6;
        const mesh = createBlock(
            Math.max(0.28, object.width * (isDoorObject(object) ? 0.26 : 0.9)),
            objectHeight,
            Math.max(0.12, object.height * (isDoorObject(object) ? 0.12 : 0.9)),
            palette.color,
            {
                x: centerX,
                y: TILE_HEIGHT + objectHeight / 2,
                z: centerZ,
            },
            palette.emissive,
        );
        if (isDoorObject(object) && object.doorId && visibility.openedDoorIds.includes(object.doorId)) {
            mesh.visible = false;
        }
        if (object.interiorId) {
            interiors.push({ interiorId: object.interiorId || null, mesh });
        }
        group.add(mesh);
    }

    return { group, roofs, interiors };
}

function createPawnMesh(pawn: ExplorationPawn, isSelected: boolean) {
    const group = new THREE.Group();
    const baseColor = isSelected ? "#67e8f9" : pawn.factionId === "player" ? "#60a5fa" : "#f59e0b";
    const shadow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.03, 18),
        new THREE.MeshBasicMaterial({ color: "#0b1120", transparent: true, opacity: isSelected ? 0.45 : 0.28 }),
    );
    shadow.position.y = 0.03;
    group.add(shadow);

    const torso = createBlock(0.42, 0.72, 0.42, baseColor, { x: 0, y: 0.43, z: 0 });
    const head = createBlock(0.3, 0.3, 0.3, "#f8d4b4", { x: 0, y: 0.93, z: 0 });
    group.add(torso, head);
    group.position.set(pawn.x, TILE_HEIGHT, pawn.y);
    return group;
}

function applyCameraPose(camera: THREE.OrthographicCamera, targetX: number, targetZ: number, zoom: number) {
    camera.position.set(targetX + 18, 22, targetZ + 18);
    camera.lookAt(targetX, 0, targetZ);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
}

export function IsometricLocationExploration({ session, onExit }: IsometricLocationExplorationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const hoverMeshRef = useRef<THREE.Mesh | null>(null);
    const pathLineRef = useRef<THREE.Line | null>(null);
    const groundPlaneRef = useRef<THREE.Mesh | null>(null);
    const chunkVisualsRef = useRef<Map<string, ChunkVisual>>(new Map());
    const pawnMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
    const animationRef = useRef<number>(0);
    const dragRef = useRef<{ active: boolean; button: number; x: number; y: number; targetX: number; targetZ: number }>({
        active: false,
        button: 0,
        x: 0,
        y: 0,
        targetX: 0,
        targetZ: 0,
    });
    const raycasterRef = useRef(new THREE.Raycaster());
    const pointerNdcRef = useRef(new THREE.Vector2());
    const pointerRef = useRef({ x: 0, y: 0, inside: false });
    const keysPressedRef = useRef<Set<string>>(new Set());
    const cameraTargetRef = useRef({ x: 0, z: 0, zoom: DEFAULT_ZOOM });
    const lastFrameRef = useRef(0);
    const lastSubscriptionRef = useRef("");
    const latestPawnsRef = useRef<ExplorationPawn[]>([]);
    const latestDescriptorRef = useRef<ExplorationManifestDescriptor | null>(null);
    const latestSubscribeChunksRef = useRef<(centerRow: number, centerCol: number, radius: number) => void>(() => {});

    const [hoverCell, setHoverCell] = useState<HoverCell>(null);
    const [showGrid, setShowGrid] = useState(false);
    const [zoomPercent, setZoomPercent] = useState(100);

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

    latestPawnsRef.current = pawns;
    latestDescriptorRef.current = descriptor;
    latestSubscribeChunksRef.current = subscribeChunks;

    const chunksByCoord = useMemo(
        () => new Map(chunks.map((chunk) => [chunkCoordKey(chunk), chunk])),
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
            if (object.interiorId && object.interiorId !== visibility.revealedInteriorId && !isStructuralObject(object)) {
                return false;
            }
            return true;
        }),
        [loadedObjects, visibility.revealedInteriorId, visibility.revealedRoofGroupIds],
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
            ? visiblePawnAtCell(
                pawns,
                chunksByCoord,
                descriptor,
                visibility.revealedInteriorId,
                hoverCell.row,
                hoverCell.col,
            )
            : null,
        [chunksByCoord, descriptor, hoverCell, pawns, visibility.revealedInteriorId],
    );
    const hoveredObject = useMemo(
        () => hoverCell
            ? visibleObjects.find((object) => !isRoofObject(object) && objectFootprintContains(object, hoverCell.row, hoverCell.col)) || null
            : null,
        [hoverCell, visibleObjects],
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
        if (hoveredObject) {
            return hoveredObject.type.replace(/-/g, " ");
        }
        return selectedPawn ? `${selectedPawn.name} ready` : "Connecting exploration session";
    }, [hoveredObject, hoveredPawn, hoveredTile?.doorId, hoveredTile?.type, lastInteraction, selectedPawn, visibility.openedDoorIds]);

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
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#071018");
        scene.fog = new THREE.Fog("#071018", 28, 85);
        sceneRef.current = scene;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = false;
        renderer.setClearColor("#071018");
        rendererRef.current = renderer;
        container.appendChild(renderer.domElement);

        const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 200);
        applyCameraPose(camera, cameraTargetRef.current.x, cameraTargetRef.current.z, cameraTargetRef.current.zoom);
        cameraRef.current = camera;
        scene.add(camera);

        scene.add(new THREE.HemisphereLight("#dff3ff", "#132012", 1.18));
        scene.add(new THREE.AmbientLight("#d7e6ff", 0.58));
        const sun = new THREE.DirectionalLight("#ffe6b5", 1.95);
        sun.position.set(16, 32, 10);
        scene.add(sun);

        const rim = new THREE.DirectionalLight("#6bc6ff", 0.48);
        rim.position.set(-12, 10, -16);
        scene.add(rim);

        const highlight = new THREE.Mesh(
            new THREE.BoxGeometry(1.04, 0.06, 1.04),
            new THREE.MeshBasicMaterial({ color: "#67e8f9", transparent: true, opacity: 0.38 }),
        );
        highlight.visible = false;
        hoverMeshRef.current = highlight;
        scene.add(highlight);

        const pathLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: "#34d399", transparent: true, opacity: 0.9 }),
        );
        pathLine.visible = false;
        pathLineRef.current = pathLine;
        scene.add(pathLine);

        const resize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            renderer.setSize(width, height);
            const aspect = Math.max(width / Math.max(height, 1), 1);
            camera.left = -20 * aspect;
            camera.right = 20 * aspect;
            camera.top = 15;
            camera.bottom = -15;
            camera.updateProjectionMatrix();
        };

        const animate = (timestamp: number) => {
            const delta = lastFrameRef.current ? Math.min(0.05, (timestamp - lastFrameRef.current) / 1000) : 0;
            lastFrameRef.current = timestamp;

            const pointer = pointerRef.current;
            const keys = keysPressedRef.current;
            if (delta > 0) {
                let panX = 0;
                let panZ = 0;
                if (pointer.inside) {
                    if (pointer.x <= EDGE_THRESHOLD) panX -= PAN_SPEED * delta;
                    if (pointer.x >= container.clientWidth - EDGE_THRESHOLD) panX += PAN_SPEED * delta;
                    if (pointer.y <= EDGE_THRESHOLD) panZ -= PAN_SPEED * delta;
                    if (pointer.y >= container.clientHeight - EDGE_THRESHOLD) panZ += PAN_SPEED * delta;
                }
                if (keys.has("a") || keys.has("arrowleft")) panX -= PAN_SPEED * delta;
                if (keys.has("d") || keys.has("arrowright")) panX += PAN_SPEED * delta;
                if (keys.has("w") || keys.has("arrowup")) panZ -= PAN_SPEED * delta;
                if (keys.has("s") || keys.has("arrowdown")) panZ += PAN_SPEED * delta;
                cameraTargetRef.current.x += panX;
                cameraTargetRef.current.z += panZ;
            }

            applyCameraPose(
                camera,
                cameraTargetRef.current.x,
                cameraTargetRef.current.z,
                cameraTargetRef.current.zoom,
            );

            const currentDescriptor = latestDescriptorRef.current;
            if (currentDescriptor) {
                const visibleWidth = (camera.right - camera.left) / Math.max(camera.zoom, 1);
                const visibleHeight = (camera.top - camera.bottom) / Math.max(camera.zoom, 1);
                const radius = clamp(
                    Math.ceil(Math.max(visibleWidth, visibleHeight) / Math.max(1, currentDescriptor.chunkSize)) + 1,
                    0,
                    2,
                );
                const centerRow = clamp(Math.round(cameraTargetRef.current.z), 0, currentDescriptor.height - 1);
                const centerCol = clamp(Math.round(cameraTargetRef.current.x), 0, currentDescriptor.width - 1);
                const subscriptionKey = `${centerRow}:${centerCol}:${radius}`;
                if (lastSubscriptionRef.current !== subscriptionKey) {
                    lastSubscriptionRef.current = subscriptionKey;
                    latestSubscribeChunksRef.current(centerRow, centerCol, radius);
                }
            }

            for (const pawn of latestPawnsRef.current) {
                const mesh = pawnMeshesRef.current.get(pawn.id);
                if (!mesh) continue;
                mesh.position.x += (pawn.x - mesh.position.x) * 0.28;
                mesh.position.z += (pawn.y - mesh.position.z) * 0.28;
            }

            renderer.render(scene, camera);
            animationRef.current = window.requestAnimationFrame(animate);
        };

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        animationRef.current = window.requestAnimationFrame(animate);

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(animationRef.current);
            hoverMeshRef.current = null;
            pathLineRef.current = null;
            pawnMeshesRef.current.clear();
            chunkVisualsRef.current.clear();
            renderer.dispose();
            container.removeChild(renderer.domElement);
            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
        };
    }, []);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (groundPlaneRef.current) {
            scene.remove(groundPlaneRef.current);
            groundPlaneRef.current.geometry.dispose();
            (groundPlaneRef.current.material as THREE.Material).dispose();
        }

        if (!descriptor) {
            groundPlaneRef.current = null;
            return;
        }

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(descriptor.width + 2, descriptor.height + 2),
            new THREE.MeshBasicMaterial({ visible: false }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set((descriptor.width - 1) / 2, 0, (descriptor.height - 1) / 2);
        groundPlaneRef.current = plane;
        scene.add(plane);
    }, [descriptor]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene || !descriptor) return;

        for (const visual of chunkVisualsRef.current.values()) {
            scene.remove(visual.group);
        }
        chunkVisualsRef.current.clear();

        for (const chunk of chunks) {
            const visual = buildChunkVisual(
                chunk,
                chunksByCoord,
                descriptor,
                visibility,
                showGrid,
            );
            chunkVisualsRef.current.set(chunk.id, visual);
            scene.add(visual.group);
        }
    }, [chunks, chunksByCoord, descriptor, showGrid, visibility]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        const existing = new Set(pawnMeshesRef.current.keys());
        for (const pawn of pawns) {
            const isSelected = pawn.id === selectedPawn?.id;
            const pawnRow = Number.isFinite(pawn.tileRow) ? pawn.tileRow : Math.round(pawn.y);
            const pawnCol = Number.isFinite(pawn.tileCol) ? pawn.tileCol : Math.round(pawn.x);
            const pawnTile = getTile(chunksByCoord, descriptor, pawnRow, pawnCol);
            const pawnVisible = !pawn.isNpc || !pawnTile?.interiorId || pawnTile.interiorId === visibility.revealedInteriorId;
            const existingMesh = pawnMeshesRef.current.get(pawn.id);
            if (!existingMesh) {
                const mesh = createPawnMesh(pawn, isSelected);
                mesh.visible = pawnVisible;
                pawnMeshesRef.current.set(pawn.id, mesh);
                scene.add(mesh);
            } else {
                existing.delete(pawn.id);
                existingMesh.visible = pawnVisible;
                const material = (existingMesh.children[1] as THREE.Mesh).material;
                if (material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial) {
                    material.color.set(isSelected ? "#67e8f9" : pawn.factionId === "player" ? "#60a5fa" : "#f59e0b");
                }
            }
        }
        for (const pawnId of existing) {
            const mesh = pawnMeshesRef.current.get(pawnId);
            if (!mesh) continue;
            scene.remove(mesh);
            pawnMeshesRef.current.delete(pawnId);
        }
    }, [chunksByCoord, descriptor, pawns, selectedPawn?.id, visibility.revealedInteriorId]);

    useEffect(() => {
        const highlight = hoverMeshRef.current;
        if (!highlight || !hoverCell) {
            if (highlight) highlight.visible = false;
            return;
        }
        highlight.visible = true;
        highlight.position.set(hoverCell.col, 0.09, hoverCell.row);
    }, [hoverCell]);

    useEffect(() => {
        const pathLine = pathLineRef.current;
        if (!pathLine || !selectedPawn?.route?.length) {
            if (pathLine) pathLine.visible = false;
            return;
        }
        const points = [
            new THREE.Vector3(selectedPawn.x, TILE_HEIGHT + 0.04, selectedPawn.y),
            ...selectedPawn.route.slice(selectedPawn.routeIndex).map((step) => (
                new THREE.Vector3(step.col, TILE_HEIGHT + 0.04, step.row)
            )),
        ];
        pathLine.geometry.dispose();
        pathLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
        pathLine.visible = points.length > 1;
    }, [selectedPawn]);

    useEffect(() => {
        if (!selectedPawn || dragRef.current.active) {
            return;
        }
        cameraTargetRef.current.x = selectedPawn.x;
        cameraTargetRef.current.z = selectedPawn.y;
    }, [selectedPawn?.id]);

    const updateZoom = (direction: "in" | "out") => {
        cameraTargetRef.current.zoom = clamp(
            cameraTargetRef.current.zoom + (direction === "in" ? 0.35 : -0.35),
            MIN_ZOOM,
            MAX_ZOOM,
        );
        setZoomPercent(Math.round((cameraTargetRef.current.zoom / DEFAULT_ZOOM) * 100));
    };

    const updateHoverFromPointer = (clientX: number, clientY: number) => {
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        const groundPlane = groundPlaneRef.current;
        if (!camera || !renderer || !groundPlane || !descriptor) {
            setHoverCell(null);
            return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdcRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdcRef.current.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
        raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);
        const hits = raycasterRef.current.intersectObject(groundPlane, false);
        const hit = hits[0];
        if (!hit) {
            setHoverCell(null);
            return;
        }
        const row = Math.round(hit.point.z);
        const col = Math.round(hit.point.x);
        if (row < 0 || col < 0 || row >= descriptor.height || col >= descriptor.width) {
            setHoverCell(null);
            return;
        }
        setHoverCell({ row, col });
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        pointerRef.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY, inside: true };
        if (dragRef.current.active) {
            cameraTargetRef.current.x = dragRef.current.targetX - (event.clientX - dragRef.current.x) * 0.05;
            cameraTargetRef.current.z = dragRef.current.targetZ - (event.clientY - dragRef.current.y) * 0.05;
            return;
        }
        updateHoverFromPointer(event.clientX, event.clientY);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 1 && event.button !== 2) return;
        dragRef.current = {
            active: true,
            button: event.button,
            x: event.clientX,
            y: event.clientY,
            targetX: cameraTargetRef.current.x,
            targetZ: cameraTargetRef.current.z,
        };
    };

    const handlePointerUp = () => {
        dragRef.current.active = false;
    };

    const handleClick = () => {
        if (!hoverCell || !selectedPawn) return;

        const clickedPawn = visiblePawnAtCell(
            pawns,
            chunksByCoord,
            descriptor,
            visibility.revealedInteriorId,
            hoverCell.row,
            hoverCell.col,
        );
        if (clickedPawn) {
            if (clickedPawn.isNpc) {
                interact(hoverCell.row, hoverCell.col, undefined, clickedPawn.id);
            } else {
                setSelectedPawnId(clickedPawn.id);
            }
            return;
        }

        const clickedObject = visibleObjects.find((object) => !isRoofObject(object) && objectFootprintContains(object, hoverCell.row, hoverCell.col)) || null;
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
                        {zoomPercent}%
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

            <div
                ref={containerRef}
                className="relative min-h-0 flex-1 overflow-hidden cursor-crosshair"
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => {
                    dragRef.current.active = false;
                    pointerRef.current.inside = false;
                    setHoverCell(null);
                }}
                onContextMenu={(event) => event.preventDefault()}
                onWheel={(event) => {
                    event.preventDefault();
                    if (event.deltaY < 0) {
                        updateZoom("in");
                    } else {
                        updateZoom("out");
                    }
                }}
                onClick={handleClick}
            >
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

                <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300 backdrop-blur-md">
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
