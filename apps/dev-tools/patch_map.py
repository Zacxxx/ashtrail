import re

filepath = "/home/moebius/dev/projects/ashtrail/apps/dev-tools/src/components/PlanetMap2D.tsx"
with open(filepath, "r") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import type { TerrainCell } from "../modules/geo/types";',
    'import type { TerrainCell, GeoPoint, GeoRegion } from "../modules/geo/types";'
)

# 2. Props
old_props = """interface PlanetMap2DProps {
  world: PlanetWorldData;
  onCellHover?: (cell: TerrainCell | null) => void;
}"""
new_props = """interface PlanetMap2DProps {
  world: PlanetWorldData;
  onCellHover?: (cell: TerrainCell | null) => void;
  isDrawingLasso?: boolean;
  regions?: GeoRegion[];
  onRegionDrawn?: (points: GeoPoint[]) => void;
}"""
content = content.replace(old_props, new_props)

# 3. Component Signature
content = content.replace(
    'export function PlanetMap2D({ world, onCellHover }: PlanetMap2DProps) {',
    'export function PlanetMap2D({ world, onCellHover, isDrawingLasso, regions = [], onRegionDrawn }: PlanetMap2DProps) {'
)

# 4. State
old_state = """  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const textureRef = useRef<HTMLCanvasElement | null>(null);"""
new_state = """  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const textureRef = useRef<HTMLCanvasElement | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<GeoPoint[]>([]);"""
content = content.replace(old_state, new_state)

# 5. Render Loop Update (Adding Regions and Lasso draw)
old_anim = """      // 3. Draw dynamic highlight if hovered"""
new_anim = """      // 2.5 Draw Regions and Lasso
      const drawContiguousPath = (points: GeoPoint[], allowFill: boolean, color: string) => {
        if (points.length < 2) return;
        const W = mapRect.w;
        const projected = points.map(p => project(p.lon, p.lat));
        for(let i=1; i<projected.length; i++) {
            let prev = projected[i-1];
            let curr = projected[i];
            while (curr.x - prev.x > W/2) curr.x -= W;
            while (prev.x - curr.x > W/2) curr.x += W;
        }
        
        const renderPath = (offsetX: number) => {
          ctx.beginPath();
          for (let i = 0; i < projected.length; i++) {
            if (i === 0) ctx.moveTo(projected[i].x + offsetX, projected[i].y);
            else ctx.lineTo(projected[i].x + offsetX, projected[i].y);
          }
          if (allowFill) {
              ctx.closePath();
              ctx.fillStyle = color.replace(')', ', 0.3)').replace('rgb', 'rgba');
              if (color.startsWith('#')) ctx.fillStyle = color + '40'; // simple hex alpha
              ctx.fill();
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        };

        renderPath(-W);
        renderPath(0);
        renderPath(W);
      };

      for (const r of regions) {
          drawContiguousPath(r.points, true, r.color);
      }
      if (drawPoints.length > 0) {
          drawContiguousPath(drawPoints, false, "#0ea5e9");
      }

      // 3. Draw dynamic highlight if hovered"""

content = content.replace(old_anim, new_anim)

# 6. Pointer Events Update
# We need to capture the canvas pointer events
old_pointer_move = """  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {"""
new_pointer_move = """  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingLasso) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * size.width;
    const cy = ((e.clientY - rect.top) / rect.height) * size.height;
    if (cx < mapRect.x || cy < mapRect.y || cx > mapRect.x + mapRect.w || cy > mapRect.y + mapRect.h) return;
    
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
{ _ble_edit_exec_gexec__save_lastarg "$@"; } 4>&1 5>&2 &>/dev/null
