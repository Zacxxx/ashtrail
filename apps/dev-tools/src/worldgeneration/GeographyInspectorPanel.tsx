import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8787";

export type InspectorLayer = "provinces" | "duchies" | "kingdoms";

interface GeographyInspectorPanelProps {
    planetId: string | null;
    selectedId: number | null;
    hoveredId: number | null;
    bulkSelectedIds?: number[];
    bulkMode?: boolean;
    onBulkModeChange?: (enabled: boolean) => void;
    onBulkToggleId?: (id: number | null) => void;
    onClearBulkSelection?: () => void;
    activeLayer: InspectorLayer;
    onHierarchyChanged?: () => void;
}

interface RegionRecord {
    id: number;
    name: string;
    area?: number;
    seed_x?: number;
    seed_y?: number;
    biome_primary?: number;
    duchy_id?: number;
    kingdom_id?: number;
    province_ids?: number[];
    duchy_ids?: number[];
}

type EntityType = "province" | "duchy" | "kingdom";

interface ReassignHistoryOp {
    kind: "reassign";
    entityType: "province" | "duchy";
    entityId: number;
    fromParentId: number;
    toParentId: number;
}

interface RenameHistoryOp {
    kind: "rename";
    entityType: EntityType;
    entityId: number;
    fromName: string;
    toName: string;
}

type HistoryOp = ReassignHistoryOp | RenameHistoryOp;

interface HistoryEntry {
    label: string;
    ops: HistoryOp[];
}

export function GeographyInspectorPanel({
    planetId,
    selectedId,
    hoveredId,
    bulkSelectedIds = [],
    bulkMode = false,
    onBulkModeChange,
    onBulkToggleId,
    onClearBulkSelection,
    activeLayer,
    onHierarchyChanged,
}: GeographyInspectorPanelProps) {
    const [provinces, setProvinces] = useState<Record<number, RegionRecord>>({});
    const [duchies, setDuchies] = useState<Record<number, RegionRecord>>({});
    const [kingdoms, setKingdoms] = useState<Record<number, RegionRecord>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [targetParentId, setTargetParentId] = useState<number | null>(null);
    const [bulkPickerId, setBulkPickerId] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [renameState, setRenameState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [renameError, setRenameError] = useState<string | null>(null);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
    const [historyState, setHistoryState] = useState<"idle" | "applying" | "error" | "done">("idle");
    const [historyError, setHistoryError] = useState<string | null>(null);

    const loadHierarchy = () => {
        if (!planetId) {
            return Promise.resolve();
        }
        setLoading(true);
        setError(null);

        return Promise.all([
            fetch(`${API_BASE}/api/planets/${planetId}/worldgen/provinces.json`).then(r => r.json()),
            fetch(`${API_BASE}/api/planets/${planetId}/worldgen/duchies.json`).then(r => r.json()),
            fetch(`${API_BASE}/api/planets/${planetId}/worldgen/kingdoms.json`).then(r => r.json())
        ])
            .then(([pList, dList, kList]) => {
                const pMap: Record<number, RegionRecord> = {};
                const dMap: Record<number, RegionRecord> = {};
                const kMap: Record<number, RegionRecord> = {};

                (pList as RegionRecord[]).forEach(x => pMap[x.id] = x);
                (dList as RegionRecord[]).forEach(x => dMap[x.id] = x);
                (kList as RegionRecord[]).forEach(x => kMap[x.id] = x);

                setProvinces(pMap);
                setDuchies(dMap);
                setKingdoms(kMap);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load geography data", err);
                setError("Failed to load geography data. Make sure pipeline has run successfully.");
                setLoading(false);
            });
    };

    useEffect(() => {
        if (!planetId) return;
        loadHierarchy();
    }, [planetId]);

    const targetId = bulkMode
        ? selectedId
        : (selectedId !== null ? selectedId : hoveredId);

    let activeData = null;
    if (targetId !== null) {
        if (activeLayer === "provinces") activeData = provinces[targetId];
        else if (activeLayer === "duchies") activeData = duchies[targetId];
        else if (activeLayer === "kingdoms") activeData = kingdoms[targetId];
    }

    useEffect(() => {
        if (!activeData) {
            setTargetParentId(null);
            return;
        }
        if (activeLayer === "provinces") {
            setTargetParentId(activeData.duchy_id ?? null);
            return;
        }
        if (activeLayer === "duchies") {
            setTargetParentId(activeData.kingdom_id ?? null);
            return;
        }
        setTargetParentId(null);
    }, [activeData, activeLayer]);

    useEffect(() => {
        setSaveState("idle");
        setSaveError(null);
        setRenameState("idle");
        setRenameError(null);
        setRenameValue(activeData?.name ?? "");
    }, [targetId, activeLayer, planetId]);

    if (!planetId) {
        return <div className="p-4 text-xs text-center text-gray-500 font-mono">NO PLANET ACTIVE</div>;
    }

    if (loading) {
        return <div className="p-4 text-xs text-center text-gray-500 font-mono animate-pulse">LOADING ARCHIVES...</div>;
    }

    if (error) {
        return <div className="p-4 text-xs text-center text-red-500/70 font-mono bg-red-500/10 rounded-xl mx-4">{error}</div>;
    }

    const isReassignable = activeLayer === "provinces" || activeLayer === "duchies";
    const availableEntities = activeLayer === "provinces"
        ? Object.values(provinces).sort((a, b) => a.name.localeCompare(b.name))
        : activeLayer === "duchies"
            ? Object.values(duchies).sort((a, b) => a.name.localeCompare(b.name))
            : [];
    const validBulkIds = isReassignable
        ? bulkSelectedIds.filter((id) => activeLayer === "provinces" ? Boolean(provinces[id]) : Boolean(duchies[id]))
        : [];
    const selectedBulkRecords = validBulkIds
        .map((id) => activeLayer === "provinces" ? provinces[id] : duchies[id])
        .filter(Boolean) as RegionRecord[];
    const selectedEntityIds = (bulkMode && validBulkIds.length > 0)
        ? validBulkIds
        : (activeData ? [activeData.id] : []);

    const postReassign = async (entityType: "province" | "duchy", entityId: number, targetId: number) => {
        const response = await fetch(`${API_BASE}/api/worldgen/${planetId}/hierarchy/reassign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entityType,
                entityId,
                targetId,
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Reassign failed with ${response.status}`);
        }
    };

    const postRename = async (entityType: EntityType, entityId: number, name: string) => {
        const response = await fetch(`${API_BASE}/api/worldgen/${planetId}/hierarchy/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entityType,
                entityId,
                name,
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Rename failed with ${response.status}`);
        }
    };

    const diffPreview = (() => {
        if (!isReassignable || targetParentId === null) {
            return [];
        }
        const isProvince = activeLayer === "provinces";
        const toName = isProvince
            ? duchies[targetParentId]?.name ?? `Duchy #${targetParentId}`
            : kingdoms[targetParentId]?.name ?? `Kingdom #${targetParentId}`;
        return selectedEntityIds
            .map((id) => {
                const entity = isProvince ? provinces[id] : duchies[id];
                if (!entity) return null;
                const fromId = isProvince ? entity.duchy_id : entity.kingdom_id;
                if (fromId === undefined || fromId === targetParentId) return null;
                const fromName = isProvince
                    ? duchies[fromId]?.name ?? `Duchy #${fromId}`
                    : kingdoms[fromId]?.name ?? `Kingdom #${fromId}`;
                return {
                    id: entity.id,
                    name: entity.name,
                    fromId,
                    fromName,
                    toId: targetParentId,
                    toName,
                };
            })
            .filter(Boolean) as Array<{ id: number; name: string; fromId: number; fromName: string; toId: number; toName: string }>;
    })();

    const handleReassign = async () => {
        if (!planetId || targetParentId === null || !isReassignable || selectedEntityIds.length === 0) return;
        const isProvince = activeLayer === "provinces";

        setSaveState("saving");
        setSaveError(null);

        try {
            const appliedOps: ReassignHistoryOp[] = [];
            for (const entityId of selectedEntityIds) {
                const source = isProvince ? provinces[entityId] : duchies[entityId];
                if (!source) {
                    continue;
                }
                const currentParent = isProvince ? source.duchy_id : source.kingdom_id;
                if (currentParent === targetParentId) {
                    continue;
                }
                if (currentParent === undefined) {
                    continue;
                }
                await postReassign(isProvince ? "province" : "duchy", entityId, targetParentId);
                appliedOps.push({
                    kind: "reassign",
                    entityType: isProvince ? "province" : "duchy",
                    entityId,
                    fromParentId: currentParent,
                    toParentId: targetParentId,
                });
            }

            await loadHierarchy();
            onHierarchyChanged?.();
            if (bulkMode) {
                onClearBulkSelection?.();
            }
            if (appliedOps.length > 0) {
                setUndoStack((prev) => [...prev, {
                    label: `${isProvince ? "Province" : "Duchy"} reassignment (${appliedOps.length})`,
                    ops: appliedOps,
                }]);
                setRedoStack([]);
            }
            setSaveState("saved");
        } catch (err: any) {
            setSaveState("error");
            setSaveError(err?.message || "Failed to save reassignment");
        }
    };

    const handleRename = async () => {
        if (!planetId || !activeData) return;
        const cleanName = renameValue.trim();
        if (!cleanName) {
            setRenameState("error");
            setRenameError("Name cannot be empty.");
            return;
        }
        setRenameState("saving");
        setRenameError(null);

        const entityType = activeLayer === "provinces" ? "province" : activeLayer === "duchies" ? "duchy" : "kingdom";

        try {
            if (activeData.name.trim() === cleanName) {
                setRenameState("saved");
                return;
            }
            await postRename(entityType, activeData.id, cleanName);
            await loadHierarchy();
            onHierarchyChanged?.();
            setUndoStack((prev) => [...prev, {
                label: `Rename ${entityType} #${activeData.id}`,
                ops: [{
                    kind: "rename",
                    entityType,
                    entityId: activeData.id,
                    fromName: activeData.name,
                    toName: cleanName,
                }],
            }]);
            setRedoStack([]);
            setRenameState("saved");
        } catch (err: any) {
            setRenameState("error");
            setRenameError(err?.message || "Failed to rename entity.");
        }
    };

    const applyHistoryEntry = async (entry: HistoryEntry, direction: "undo" | "redo") => {
        if (!planetId) return;
        setHistoryState("applying");
        setHistoryError(null);
        try {
            const ops = direction === "undo" ? [...entry.ops].reverse() : entry.ops;
            for (const op of ops) {
                if (op.kind === "reassign") {
                    await postReassign(
                        op.entityType,
                        op.entityId,
                        direction === "undo" ? op.fromParentId : op.toParentId,
                    );
                } else {
                    await postRename(
                        op.entityType,
                        op.entityId,
                        direction === "undo" ? op.fromName : op.toName,
                    );
                }
            }
            await loadHierarchy();
            onHierarchyChanged?.();
            setHistoryState("done");
        } catch (err: any) {
            setHistoryState("error");
            setHistoryError(err?.message || "Failed to apply history action.");
            throw err;
        }
    };

    const handleUndo = async () => {
        if (undoStack.length === 0) return;
        const entry = undoStack[undoStack.length - 1];
        try {
            await applyHistoryEntry(entry, "undo");
            setUndoStack((prev) => prev.slice(0, -1));
            setRedoStack((prev) => [...prev, entry]);
        } catch {
            return;
        }
    };

    const handleRedo = async () => {
        if (redoStack.length === 0) return;
        const entry = redoStack[redoStack.length - 1];
        try {
            await applyHistoryEntry(entry, "redo");
            setRedoStack((prev) => prev.slice(0, -1));
            setUndoStack((prev) => [...prev, entry]);
        } catch {
            return;
        }
    };

    return (
        <div className="flex flex-col gap-4 p-4 h-full">
            <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-black tracking-[0.2em] text-cyan-400 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    PROVINCE INSPECTOR
                </h2>

                <p className="text-[11px] text-gray-400 leading-relaxed font-mono">
                    Hover over regions on the map to inspect properties. Click on a region to lock selection.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                        onClick={() => onBulkModeChange?.(false)}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-black tracking-[0.12em] border transition-all ${!bulkMode
                            ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                            : "border-white/15 text-gray-300 bg-white/5 hover:bg-white/10"
                            }`}
                    >
                        INSPECT MODE
                    </button>
                    <button
                        onClick={() => onBulkModeChange?.(true)}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-black tracking-[0.12em] border transition-all ${bulkMode
                            ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                            : "border-white/15 text-gray-300 bg-white/5 hover:bg-white/10"
                            }`}
                    >
                        SELECT MODE
                    </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <button
                        onClick={handleUndo}
                        disabled={undoStack.length === 0 || historyState === "applying"}
                        className="px-2 py-1.5 rounded-lg text-[10px] font-black tracking-[0.12em] border border-white/15 text-gray-300 bg-white/5 hover:bg-white/10 disabled:opacity-40"
                    >
                        UNDO ({undoStack.length})
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={redoStack.length === 0 || historyState === "applying"}
                        className="px-2 py-1.5 rounded-lg text-[10px] font-black tracking-[0.12em] border border-white/15 text-gray-300 bg-white/5 hover:bg-white/10 disabled:opacity-40"
                    >
                        REDO ({redoStack.length})
                    </button>
                </div>
                {historyState === "error" && (
                    <p className="mt-2 text-[10px] text-red-400 font-mono">{historyError || "History operation failed."}</p>
                )}
            </div>

            {isReassignable && (
                <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md space-y-3">
                    <p className="text-[9px] text-gray-500 font-mono tracking-widest">BULK SELECTION</p>
                    <p className="text-[10px] text-gray-500 font-mono">In SELECT MODE, map click toggles bulk selection.</p>
                    <div className="flex items-center gap-2">
                        <select
                            value={bulkPickerId ?? ""}
                            onChange={(e) => setBulkPickerId(e.target.value === "" ? null : Number(e.target.value))}
                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-cyan-500/50"
                        >
                            <option value="">Choose {activeLayer === "provinces" ? "province" : "duchy"}…</option>
                            {availableEntities.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} (#{item.id})
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => {
                                if (bulkPickerId !== null) onBulkToggleId?.(bulkPickerId);
                            }}
                            className="px-2 py-2 rounded-lg text-[10px] font-black tracking-[0.12em] border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all"
                        >
                            TOGGLE
                        </button>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-2 max-h-40 overflow-y-auto">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-gray-400">SELECTED</span>
                            <span className="text-cyan-300">{selectedBulkRecords.length}</span>
                        </div>
                        {selectedBulkRecords.length === 0 ? (
                            <p className="text-[10px] text-gray-500 font-mono">No bulk selection yet.</p>
                        ) : (
                            selectedBulkRecords.slice(0, 40).map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-gray-300 truncate">{item.name} (#{item.id})</span>
                                    <button
                                        onClick={() => onBulkToggleId?.(item.id)}
                                        className="ml-2 px-1.5 py-0.5 rounded border border-white/15 text-gray-400 hover:text-white hover:bg-white/10"
                                    >
                                        X
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                    <button
                        onClick={() => onClearBulkSelection?.()}
                        className="w-full px-2 py-1.5 rounded-lg text-[10px] font-black tracking-[0.12em] border border-white/15 text-gray-300 bg-white/5 hover:bg-white/10 transition-all"
                    >
                        CLEAR MULTI-SELECTION
                    </button>
                    {bulkMode && (
                        <>
                            <select
                                value={targetParentId ?? ""}
                                onChange={(e) => setTargetParentId(e.target.value === "" ? null : Number(e.target.value))}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-cyan-500/50"
                            >
                                <option value="">Select bulk destination…</option>
                                {activeLayer === "provinces"
                                    ? Object.values(duchies)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))
                                    : Object.values(kingdoms)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((k) => (
                                            <option key={k.id} value={k.id}>
                                                {k.name}
                                            </option>
                                        ))}
                            </select>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-2">
                                <p className="text-[9px] text-gray-500 font-mono tracking-widest">BULK DIFF PREVIEW</p>
                                <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-gray-400">WILL CHANGE</span>
                                    <span className="text-cyan-300">{diffPreview.length}</span>
                                </div>
                                {diffPreview.length === 0 ? (
                                    <p className="text-[10px] text-gray-500 font-mono">No effective change for current selection/target.</p>
                                ) : (
                                    diffPreview.slice(0, 8).map((row) => (
                                        <div key={row.id} className="text-[10px] font-mono text-gray-300 leading-relaxed">
                                            {row.name} (#{row.id}): {row.fromName} {"->"} {row.toName}
                                        </div>
                                    ))
                                )}
                                {diffPreview.length > 8 && (
                                    <p className="text-[10px] text-gray-500 font-mono">...and {diffPreview.length - 8} more</p>
                                )}
                            </div>
                            <button
                                onClick={handleReassign}
                                disabled={saveState === "saving" || targetParentId === null || selectedEntityIds.length === 0}
                                className="w-full px-3 py-2 rounded-lg text-[10px] font-black tracking-[0.15em] border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {saveState === "saving" ? "UPDATING..." : `APPLY TO ${selectedEntityIds.length} SELECTED`}
                            </button>
                            {saveState === "saved" && (
                                <p className="text-[10px] text-green-400 font-mono">Hierarchy updated.</p>
                            )}
                            {saveState === "error" && (
                                <p className="text-[10px] text-red-400 font-mono">{saveError || "Failed to update hierarchy."}</p>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeData ? (
                <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md space-y-4">
                    <div className="border-b border-white/10 pb-3">
                        <h3 className="text-sm font-bold text-white tracking-widest">{activeData.name.toUpperCase()}</h3>
                        <p className="text-[10px] text-gray-500 font-mono tracking-wider mt-1">ID: {activeData.id}</p>
                    </div>

                    <div className="space-y-2">
                        {activeData.area !== undefined && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">AREA</span>
                                <span className="text-cyan-300">{activeData.area} px²</span>
                            </div>
                        )}
                        {activeData.biome_primary !== undefined && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">PRIMARY BIOME</span>
                                <span className="text-green-400 text-right">#{activeData.biome_primary}</span>
                            </div>
                        )}
                        {activeData.duchy_id !== undefined && duchies[activeData.duchy_id] && activeLayer === "provinces" && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">DE JURE DUCHY</span>
                                <span className="text-yellow-500 text-right">{duchies[activeData.duchy_id].name}</span>
                            </div>
                        )}
                        {activeData.kingdom_id !== undefined && kingdoms[activeData.kingdom_id] && (activeLayer === "provinces" || activeLayer === "duchies") && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">DE JURE KINGDOM</span>
                                <span className="text-purple-400 text-right">{kingdoms[activeData.kingdom_id].name}</span>
                            </div>
                        )}
                        {activeData.province_ids && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">COUNTIES</span>
                                <span className="text-white text-right">{activeData.province_ids.length}</span>
                            </div>
                        )}
                        {activeData.duchy_ids && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">DUCHIES</span>
                                <span className="text-white text-right">{activeData.duchy_ids.length}</span>
                            </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-white/10 space-y-2">
                        <p className="text-[9px] text-gray-500 font-mono tracking-widest">RENAME</p>
                        <div className="flex items-center gap-2">
                            <input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-cyan-500/50"
                                placeholder="New name"
                            />
                            <button
                                onClick={handleRename}
                                disabled={renameState === "saving"}
                                className="px-3 py-2 rounded-lg text-[10px] font-black tracking-[0.12em] border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40 transition-all"
                            >
                                {renameState === "saving" ? "SAVING..." : "SAVE"}
                            </button>
                        </div>
                        {renameState === "saved" && <p className="text-[10px] text-green-400 font-mono">Name updated.</p>}
                        {renameState === "error" && <p className="text-[10px] text-red-400 font-mono">{renameError || "Rename failed."}</p>}
                    </div>

                    {!bulkMode && isReassignable && (
                        <div className="pt-3 border-t border-white/10 space-y-3">
                            <p className="text-[9px] text-gray-500 font-mono tracking-widest">
                                {activeLayer === "provinces" ? "REASSIGN COUNTY TO DUCHY" : "REASSIGN DUCHY TO KINGDOM"}
                            </p>
                            <select
                                value={targetParentId ?? ""}
                                onChange={(e) => setTargetParentId(e.target.value === "" ? null : Number(e.target.value))}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-cyan-500/50"
                            >
                                <option value="">Select target…</option>
                                {activeLayer === "provinces"
                                    ? Object.values(duchies)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))
                                    : Object.values(kingdoms)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((k) => (
                                            <option key={k.id} value={k.id}>
                                                {k.name}
                                            </option>
                                        ))}
                            </select>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-2">
                                <p className="text-[9px] text-gray-500 font-mono tracking-widest">DIFF PREVIEW</p>
                                <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-gray-400">WILL CHANGE</span>
                                    <span className="text-cyan-300">{diffPreview.length}</span>
                                </div>
                                {diffPreview.length === 0 ? (
                                    <p className="text-[10px] text-gray-500 font-mono">No effective change for current selection/target.</p>
                                ) : (
                                    diffPreview.slice(0, 10).map((row) => (
                                        <div key={row.id} className="text-[10px] font-mono text-gray-300 leading-relaxed">
                                            {row.name} (#{row.id}): {row.fromName} {"->"} {row.toName}
                                        </div>
                                    ))
                                )}
                                {diffPreview.length > 10 && (
                                    <p className="text-[10px] text-gray-500 font-mono">...and {diffPreview.length - 10} more</p>
                                )}
                            </div>
                            <button
                                onClick={handleReassign}
                                disabled={saveState === "saving" || targetParentId === null || selectedEntityIds.length === 0}
                                className="w-full px-3 py-2 rounded-lg text-[10px] font-black tracking-[0.15em] border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {saveState === "saving"
                                    ? "UPDATING..."
                                    : bulkMode
                                        ? `APPLY TO ${selectedEntityIds.length} SELECTED`
                                        : "APPLY REASSIGNMENT"}
                            </button>
                            {saveState === "saved" && (
                                <p className="text-[10px] text-green-400 font-mono">Hierarchy updated.</p>
                            )}
                            {saveState === "error" && (
                                <p className="text-[10px] text-red-400 font-mono">{saveError || "Failed to update hierarchy."}</p>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 border border-dashed border-white/10 rounded-2xl flex items-center justify-center p-6 text-center text-gray-600 text-[10px] tracking-widest leading-relaxed">
                    AWAITING REGION SELECTION
                </div>
            )}
        </div>
    );
}
