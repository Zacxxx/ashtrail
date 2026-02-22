import { useRef, useCallback, useState, useEffect } from "react";
import type { GeoRegion, GeographyTool, RegionType } from "./types";
import { REGION_TYPE_COLORS } from "./types";
import type { MapTransform } from "../components/PlanetMap2D";

interface RegionOverlayProps {
    regions: GeoRegion[];
    activeTool: GeographyTool;
    activeRegionType: RegionType;
    selectedRegionId: string | null;
    hoveredRegionId: string | null;
    onAddRegion: (name: string, type: RegionType, polygon: [number, number][], parentId?: string) => void;
    onSelectRegion: (id: string | null) => void;
    onHoverRegion: (id: string | null) => void;
    findRegionAtPoint: (x: number, y: number) => GeoRegion | null;
    transform: MapTransform;
    originalWidth: number;
    originalHeight: number;
}

/** Douglas-Peucker simplification */
function simplifyPolygon(points: [number, number][], epsilon: number): [number, number][] {
    if (points.length < 3) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDist(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }

    if (maxDist > epsilon) {
        const left = simplifyPolygon(points.slice(0, maxIdx + 1), epsilon);
        const right = simplifyPolygon(points.slice(maxIdx), epsilon);
        return [...left.slice(0, -1), ...right];
    }

    return [first, last];
}

function perpendicularDist(p: [number, number], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function RegionOverlay({
    regions,
    activeTool,
    activeRegionType,
    selectedRegionId,
    hoveredRegionId,
    onAddRegion,
    onSelectRegion,
    onHoverRegion,
    findRegionAtPoint,
    transform,
    originalWidth,
    originalHeight,
}: RegionOverlayProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPath, setCurrentPath] = useState<[number, number][]>([]);
    const regionCountRef = useRef(regions.length);

    // Keep count ref in sync for auto-naming
    useEffect(() => {
        regionCountRef.current = regions.length;
    }, [regions.length]);


    // Convert screen pointer back into 0-1 normalized space relative to the unscaled image bounds
    const getNormalizedPoint = useCallback((e: React.MouseEvent): [number, number] | null => {
        if (!wrapperRef.current) return null;

        // Bounding rect of the wrapper (which fills the whole map container)
        const rect = wrapperRef.current.getBoundingClientRect();

        // Mouse coordinate in CSS pixels relative to the wrapper top-left corner
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Invert the pan/zoom transform
        // mouseX = transform.x + (localImageX * transform.scale)
        // localImageX = (mouseX - transform.x) / transform.scale
        const localX = (mouseX - transform.x) / transform.scale;
        const localY = (mouseY - transform.y) / transform.scale;

        // Image space coordinates → Normalize 0 to 1 relative to original image size
        const nx = localX / originalWidth;
        const ny = localY / originalHeight;

        // Only return if it's within the image bounds
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;

        return [nx, ny];
    }, [transform, originalWidth, originalHeight]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (activeTool === "lasso") {
            const pt = getNormalizedPoint(e);
            if (!pt) return;
            setIsDrawing(true);
            setCurrentPath([pt]);
        } else if (activeTool === "select") {
            const pt = getNormalizedPoint(e);
            if (!pt) return;
            const region = findRegionAtPoint(pt[0], pt[1]);
            onSelectRegion(region?.id ?? null);
        }
    }, [activeTool, getNormalizedPoint, findRegionAtPoint, onSelectRegion]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const pt = getNormalizedPoint(e);

        if (isDrawing && activeTool === "lasso" && pt) {
            setCurrentPath(prev => [...prev, pt]);
        } else if (activeTool === "select" || activeTool === "pan") {
            if (pt) {
                const region = findRegionAtPoint(pt[0], pt[1]);
                onHoverRegion(region?.id ?? null);
            } else {
                onHoverRegion(null);
            }
        }
    }, [isDrawing, activeTool, getNormalizedPoint, findRegionAtPoint, onHoverRegion]);

    const handleMouseUp = useCallback(() => {
        if (!isDrawing || activeTool !== "lasso") return;
        setIsDrawing(false);

        if (currentPath.length < 8) {
            setCurrentPath([]);
            return; // Too few points, discard
        }

        // Simplify the drawn path (epsilon depends on how jagged the drawing is)
        const simplified = simplifyPolygon(currentPath, 0.003);
        if (simplified.length < 3) {
            setCurrentPath([]);
            return;
        }

        const typeLabel = activeRegionType.charAt(0).toUpperCase() + activeRegionType.slice(1);
        const name = `${typeLabel} ${regionCountRef.current + 1}`;
        onAddRegion(name, activeRegionType, simplified, selectedRegionId || undefined);
        setCurrentPath([]);
    }, [isDrawing, activeTool, currentPath, activeRegionType, selectedRegionId, onAddRegion]);

    const toSvgPoints = (polygon: [number, number][]): string => {
        // SVG size is mapped directly to actual image pixels (originalWidth x originalHeight)
        return polygon.map(([x, y]) => `${x * originalWidth},${y * originalHeight}`).join(" ");
    };

    const cursorClass =
        activeTool === "lasso" ? "cursor-crosshair" :
            activeTool === "select" ? "cursor-pointer" :
                "pointer-events-none"; // Let the canvas underneath handle pan grabbing

    return (
        <div
            ref={wrapperRef}
            className={`absolute inset-0 w-full h-full z-10 overflow-hidden ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsDrawing(false); setCurrentPath([]); onHoverRegion(null); }}
        >
            <svg
                // We apply the exact same transform to the SVG element that holds the polygons
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    transformOrigin: 'top left',
                    width: `${originalWidth}px`,
                    height: `${originalHeight}px`,
                    position: 'absolute',
                    top: 0,
                    left: 0
                }}
                viewBox={`0 0 ${originalWidth} ${originalHeight}`}
                preserveAspectRatio="none"
            >
                {/* Existing regions */}
                {regions.map(region => {
                    const isSelected = region.id === selectedRegionId;
                    const isHovered = region.id === hoveredRegionId;
                    return (
                        <polygon
                            key={region.id}
                            points={toSvgPoints(region.polygon)}
                            fill={region.color}
                            fillOpacity={isSelected ? 0.45 : isHovered ? 0.35 : 0.2}
                            stroke={isSelected ? "#22d3ee" : isHovered ? "#67e8f9" : region.color}
                            // Counter-scale the stroke so it doesn't get massive when zooming in
                            strokeWidth={(isSelected ? 10 : isHovered ? 6 : 3) / transform.scale}
                            strokeLinejoin="round"
                            className="transition-all duration-150"
                        />
                    );
                })}

                {/* Active lasso path */}
                {isDrawing && currentPath.length > 1 && (
                    <polyline
                        points={currentPath.map(([x, y]) => `${x * originalWidth},${y * originalHeight}`).join(" ")}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth={6 / transform.scale}
                        strokeDasharray={`${8 / transform.scale} ${4 / transform.scale}`}
                        strokeLinecap="round"
                        className="animate-pulse"
                    />
                )}

                {/* Hover tooltip region name */}
                {hoveredRegionId && !isDrawing && (() => {
                    const region = regions.find(r => r.id === hoveredRegionId);
                    if (!region) return null;
                    // Show label at centroid
                    const cx = region.polygon.reduce((s, p) => s + p[0], 0) / region.polygon.length * originalWidth;
                    const cy = region.polygon.reduce((s, p) => s + p[1], 0) / region.polygon.length * originalHeight;
                    return (
                        <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="white"
                            fontSize={40 / transform.scale}
                            fontWeight="bold"
                            className="pointer-events-none select-none drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]"
                            style={{ letterSpacing: "0.15em", textTransform: "uppercase" }}
                        >
                            {region.name}
                        </text>
                    );
                })()}
            </svg>
        </div>
    );
}
