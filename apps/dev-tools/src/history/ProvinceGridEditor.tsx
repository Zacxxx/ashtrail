import { useState, useCallback, useRef } from "react";
import { Button } from "@ashtrail/ui";

// ── Types ──

export interface SubArea {
    id: string;
    name: string;
    type: "Urban" | "Rural" | "Wilderness" | "Ruins";
    wealth: number;
    development: number;
    population: number;
    lore: string;
}

export interface ProvinceGridData {
    grid: number[][]; // 8×8 grid, each cell is an index into subAreas (-1 = unassigned)
    subAreas: SubArea[];
}

interface ProvinceGridEditorProps {
    data: ProvinceGridData;
    onChange: (data: ProvinceGridData) => void;
}

const GRID_SIZE = 8;
const AREA_COLORS: Record<string, string> = {
    Urban: "#f59e0b",
    Rural: "#22c55e",
    Wilderness: "#06b6d4",
    Ruins: "#ef4444",
};

const DEFAULT_GRID = (): number[][] =>
    Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));

export function emptyProvinceGrid(): ProvinceGridData {
    return { grid: DEFAULT_GRID(), subAreas: [] };
}

export function ProvinceGridEditor({ data, onChange }: ProvinceGridEditorProps) {
    const [activeSubAreaIdx, setActiveSubAreaIdx] = useState<number>(-1);
    const [isPainting, setIsPainting] = useState(false);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const paintCell = useCallback(
        (row: number, col: number) => {
            if (activeSubAreaIdx < 0) return;
            const newGrid = data.grid.map((r) => [...r]);
            newGrid[row][col] = activeSubAreaIdx;
            onChange({ ...data, grid: newGrid });
        },
        [data, activeSubAreaIdx, onChange],
    );

    const clearCell = useCallback(
        (row: number, col: number) => {
            const newGrid = data.grid.map((r) => [...r]);
            newGrid[row][col] = -1;
            onChange({ ...data, grid: newGrid });
        },
        [data, onChange],
    );

    const addSubArea = () => {
        const newSub: SubArea = {
            id: crypto.randomUUID(),
            name: `Area ${data.subAreas.length + 1}`,
            type: "Rural",
            wealth: 0,
            development: 0,
            population: 100,
            lore: "",
        };
        const updated = { ...data, subAreas: [...data.subAreas, newSub] };
        onChange(updated);
        setActiveSubAreaIdx(updated.subAreas.length - 1);
    };

    const removeSubArea = (idx: number) => {
        const newSubAreas = data.subAreas.filter((_, i) => i !== idx);
        // Remap grid: clear cells that pointed to idx, decrement indices above idx
        const newGrid = data.grid.map((row) =>
            row.map((cell) => {
                if (cell === idx) return -1;
                if (cell > idx) return cell - 1;
                return cell;
            }),
        );
        onChange({ grid: newGrid, subAreas: newSubAreas });
        if (activeSubAreaIdx === idx) setActiveSubAreaIdx(-1);
        else if (activeSubAreaIdx > idx) setActiveSubAreaIdx(activeSubAreaIdx - 1);
        if (editIdx === idx) setEditIdx(null);
    };

    const updateSubArea = (idx: number, patch: Partial<SubArea>) => {
        const newSubAreas = data.subAreas.map((s, i) => (i === idx ? { ...s, ...patch } : s));
        onChange({ ...data, subAreas: newSubAreas });
    };

    const getCellColor = (cellVal: number): string => {
        if (cellVal < 0 || cellVal >= data.subAreas.length) return "transparent";
        return AREA_COLORS[data.subAreas[cellVal].type] || "#666";
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Grid */}
            <div className="flex gap-4">
                <div
                    ref={gridRef}
                    className="grid gap-px bg-white/5 rounded-lg overflow-hidden border border-white/10 shrink-0"
                    style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, width: 240, height: 240 }}
                    onPointerLeave={() => setIsPainting(false)}
                >
                    {data.grid.map((row, ri) =>
                        row.map((cell, ci) => (
                            <div
                                key={`${ri}-${ci}`}
                                className="cursor-pointer transition-colors hover:brightness-125"
                                style={{
                                    backgroundColor: getCellColor(cell),
                                    opacity: cell >= 0 ? 0.7 : 0.15,
                                }}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    setIsPainting(true);
                                    if (e.button === 2 || e.ctrlKey) clearCell(ri, ci);
                                    else paintCell(ri, ci);
                                }}
                                onPointerEnter={() => {
                                    if (isPainting) paintCell(ri, ci);
                                }}
                                onPointerUp={() => setIsPainting(false)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    clearCell(ri, ci);
                                }}
                            />
                        )),
                    )}
                </div>

                {/* Sub-Area List */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">Sub-Areas</p>
                        <Button onClick={addSubArea} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
                            + ADD
                        </Button>
                    </div>
                    {data.subAreas.length === 0 ? (
                        <p className="text-[10px] text-gray-600 italic">No sub-areas yet. Add one to start painting.</p>
                    ) : (
                        data.subAreas.map((sub, idx) => (
                            <div
                                key={sub.id}
                                onClick={() => setActiveSubAreaIdx(idx)}
                                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-[11px] ${activeSubAreaIdx === idx ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/5 bg-black/20 hover:border-white/20"}`}
                            >
                                <div
                                    className="w-4 h-4 rounded shrink-0"
                                    style={{ backgroundColor: AREA_COLORS[sub.type] || "#666", opacity: 0.7 }}
                                />
                                <span className="flex-1 truncate text-gray-200 font-bold">{sub.name}</span>
                                <span className="text-[9px] text-gray-500 uppercase tracking-wider">{sub.type}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setEditIdx(editIdx === idx ? null : idx); }}
                                    className="text-gray-500 hover:text-white text-[10px] px-1"
                                    title="Edit"
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeSubArea(idx); }}
                                    className="text-red-500/50 hover:text-red-400 text-[10px] px-1"
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit inline panel */}
            {editIdx !== null && editIdx < data.subAreas.length && (() => {
                const sub = data.subAreas[editIdx];
                return (
                    <div className="border border-white/10 rounded-lg bg-black/30 p-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Name</label>
                                <input
                                    type="text" value={sub.name}
                                    onChange={e => updateSubArea(editIdx, { name: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-[11px] focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Type</label>
                                <select
                                    value={sub.type}
                                    onChange={e => updateSubArea(editIdx, { type: e.target.value as SubArea["type"] })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-[11px] focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Urban", "Rural", "Wilderness", "Ruins"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Wealth</label>
                                <input
                                    type="number" min={-100} max={100} value={sub.wealth}
                                    onChange={e => updateSubArea(editIdx, { wealth: parseInt(e.target.value) || 0 })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-[11px] focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Development</label>
                                <input
                                    type="number" min={-100} max={100} value={sub.development}
                                    onChange={e => updateSubArea(editIdx, { development: parseInt(e.target.value) || 0 })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-[11px] focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Population</label>
                                <input
                                    type="number" min={0} value={sub.population}
                                    onChange={e => updateSubArea(editIdx, { population: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-[11px] focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Lore</label>
                            <textarea
                                value={sub.lore}
                                onChange={e => updateSubArea(editIdx, { lore: e.target.value })}
                                rows={3}
                                className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-[11px] focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full custom-scrollbar"
                                placeholder="Describe this sub-area..."
                            />
                        </div>
                    </div>
                );
            })()}

            <p className="text-[9px] text-gray-600 italic">
                Click a sub-area in the list to select it, then paint cells on the grid. Right-click to clear a cell.
            </p>
        </div>
    );
}
