import { useEffect, useMemo, useState } from "react";
import { Button } from "@ashtrail/ui";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { type HistoryTab } from "./HistoryPage";
import { type Faction } from "./FactionsTab";
import type { LoreSnippet } from "../types/lore";
import {
    LOCATION_CATEGORY_OPTIONS,
    LOCATION_SCALE_OPTIONS,
    LOCATION_STATUS_OPTIONS,
    defaultLocationHistoryHooks,
    normalizeLocation,
    titleCaseLocation,
    type Area,
    type WorldLocation,
} from "./locationTypes";

export type { Area, WorldLocation } from "./locationTypes";

interface LocationsTabProps {
    selectedWorld: GenerationHistoryItem | null;
    setActiveTab: (tab: HistoryTab) => void;
}

interface ProvinceInfo {
    id: string;
    rawId: number;
    name: string;
    duchyId?: number;
    kingdomId?: number;
    continentId?: number;
}

function splitListField(value: string) {
    return value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function joinListField(values: string[]) {
    return values.join(", ");
}

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function parseNumber(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function applyProvince(location: WorldLocation, province: ProvinceInfo | null): WorldLocation {
    if (!province) return location;
    return {
        ...location,
        provinceId: province.rawId,
        provinceRegionId: province.id,
        provinceName: province.name,
        duchyId: province.duchyId,
        kingdomId: province.kingdomId,
        continentId: province.continentId,
    };
}

function createLocationTemplate(province: ProvinceInfo | null) {
    return applyProvince(
        normalizeLocation({
            name: province ? `${province.name} Site` : "New Location",
            category: province ? "settlement" : "wild",
            subtype: province ? "market_town" : "landmark",
            type: province ? "Market Town" : "Landmark",
            scale: province ? "small" : "minor",
            status: "stable",
            importance: province ? 48 : 35,
            habitabilityScore: province ? 52 : 30,
            economicScore: province ? 44 : 22,
            strategicScore: province ? 38 : 26,
            hazardScore: province ? 24 : 45,
            populationEstimate: province ? 2800 : null,
            x: 0.5,
            y: 0.5,
            rulingFaction: "None",
            tags: [],
            placementDrivers: [],
            historyHooks: defaultLocationHistoryHooks(),
        }),
        province,
    );
}

export function LocationsTab({ selectedWorld, setActiveTab }: LocationsTabProps) {
    const [locations, setLocations] = useState<WorldLocation[]>([]);
    const [factions, setFactions] = useState<Faction[]>([]);
    const [loreSnippets, setLoreSnippets] = useState<LoreSnippet[]>([]);
    const [provinces, setProvinces] = useState<ProvinceInfo[]>([]);
    const [editingLocation, setEditingLocation] = useState<WorldLocation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [provinceFilter, setProvinceFilter] = useState<string>("all");
    const [subtypeFilter, setSubtypeFilter] = useState("");

    useEffect(() => {
        if (!selectedWorld) {
            setLocations([]);
            setFactions([]);
            setLoreSnippets([]);
            setProvinces([]);
            setEditingLocation(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        async function load() {
            try {
                const [locationsRes, factionsRes, loreRes, worldgenRegionsRes] = await Promise.all([
                    fetch(`http://127.0.0.1:8787/api/planet/locations/${selectedWorld.id}`),
                    fetch(`http://127.0.0.1:8787/api/planet/factions/${selectedWorld.id}`),
                    fetch(`http://127.0.0.1:8787/api/planet/lore-snippets/${selectedWorld.id}`),
                    fetch(`http://127.0.0.1:8787/api/planet/worldgen-regions/${selectedWorld.id}`),
                ]);

                const [locationsData, factionsData, loreData, worldgenRegionsData] = await Promise.all([
                    locationsRes.ok ? locationsRes.json() : [],
                    factionsRes.ok ? factionsRes.json() : [],
                    loreRes.ok ? loreRes.json() : [],
                    worldgenRegionsRes.ok ? worldgenRegionsRes.json() : [],
                ]);

                if (cancelled) return;

                const nextLocations = Array.isArray(locationsData)
                    ? locationsData.map((entry) => normalizeLocation(entry))
                    : [];
                const nextProvinces = (Array.isArray(worldgenRegionsData) ? worldgenRegionsData : [])
                    .filter((region: any) => region?.type === "Province")
                    .map((region: any) => ({
                        id: String(region.id || `wgen_provinces_${region.rawId ?? 0}`),
                        rawId: Number(region.rawId ?? 0),
                        name: String(region.name || "Unknown Province"),
                        duchyId: typeof region.duchyId === "number" ? region.duchyId : Number(region.duchyId ?? 0) || undefined,
                        kingdomId: typeof region.kingdomId === "number" ? region.kingdomId : Number(region.kingdomId ?? 0) || undefined,
                        continentId: typeof region.continentId === "number" ? region.continentId : Number(region.continentId ?? 0) || undefined,
                    }))
                    .sort((a: ProvinceInfo, b: ProvinceInfo) => a.name.localeCompare(b.name));

                setLocations(nextLocations);
                setFactions(Array.isArray(factionsData) ? factionsData : []);
                setLoreSnippets(Array.isArray(loreData) ? loreData : []);
                setProvinces(nextProvinces);
                setEditingLocation((prev) => {
                    if (prev && nextLocations.some((entry) => entry.id === prev.id)) {
                        return nextLocations.find((entry) => entry.id === prev.id) || null;
                    }
                    return nextLocations[0] || null;
                });
            } catch (error) {
                console.error("Failed to load locations", error);
                if (!cancelled) {
                    setLocations([]);
                    setFactions([]);
                    setLoreSnippets([]);
                    setProvinces([]);
                    setEditingLocation(null);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [selectedWorld]);

    const handleSave = async (updated: WorldLocation[]) => {
        if (!selectedWorld) return;
        setIsSaving(true);
        try {
            const response = await fetch(`http://127.0.0.1:8787/api/planet/locations/${selectedWorld.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updated),
            });
            if (!response.ok) {
                throw new Error(`Failed to save locations: ${response.status}`);
            }
            const savedData = await response.json();
            const normalized = Array.isArray(savedData)
                ? savedData.map((entry) => normalizeLocation(entry))
                : updated.map((entry) => normalizeLocation(entry));
            setLocations(normalized);
            setEditingLocation((prev) => {
                if (!prev) return normalized[0] || null;
                return normalized.find((entry) => entry.id === prev.id) || normalized[0] || null;
            });
        } catch (error) {
            console.error("Failed to save locations", error);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredLocations = useMemo(() => {
        const query = subtypeFilter.trim().toLowerCase();
        return [...locations]
            .filter((location) => categoryFilter === "all" || location.category === categoryFilter)
            .filter((location) => statusFilter === "all" || location.status === statusFilter)
            .filter((location) => provinceFilter === "all" || location.provinceRegionId === provinceFilter)
            .filter((location) => {
                if (!query) return true;
                const haystack = [location.name, location.subtype, location.type, location.provinceName].join(" ").toLowerCase();
                return haystack.includes(query);
            })
            .sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
    }, [locations, categoryFilter, statusFilter, provinceFilter, subtypeFilter]);

    const subtypeOptions = useMemo(() => {
        return Array.from(new Set(locations.map((location) => location.subtype).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }, [locations]);

    const selectedProvince = editingLocation
        ? provinces.find((province) => province.rawId === editingLocation.provinceId || province.id === editingLocation.provinceRegionId) || null
        : null;

    const highestImportance = useMemo(() => {
        return [...locations].sort((a, b) => b.importance - a.importance).slice(0, 5);
    }, [locations]);

    const settlementCount = locations.filter((location) => location.category === "settlement").length;
    const loreById = useMemo(
        () => Object.fromEntries(loreSnippets.map((snippet) => [snippet.id, snippet])),
        [loreSnippets],
    );

    const handleAdd = () => {
        const next = createLocationTemplate(provinces[0] || null);
        setEditingLocation(next);
    };

    const handleSelect = (location: WorldLocation) => {
        setEditingLocation(normalizeLocation(location));
    };

    const handleSaveLocation = async () => {
        if (!editingLocation) return;
        const updatedLocation = normalizeLocation(editingLocation);
        const index = locations.findIndex((entry) => entry.id === updatedLocation.id);
        const nextLocations = [...locations];
        if (index >= 0) {
            nextLocations[index] = updatedLocation;
        } else {
            nextLocations.push(updatedLocation);
        }
        await handleSave(nextLocations);
    };

    const handleDelete = async (id: string) => {
        const nextLocations = locations.filter((location) => location.id !== id);
        await handleSave(nextLocations);
        setEditingLocation((prev) => (prev?.id === id ? nextLocations[0] || null : prev));
    };

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80">
                <div className="text-5xl mb-4">📍</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Select a planet before editing canonical locations.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
            <div className="w-[360px] shrink-0 flex flex-col gap-4 bg-[#121820] border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-emerald-400 uppercase">Locations</h2>
                        <p className="text-[10px] tracking-[0.18em] text-gray-500 uppercase">
                            {locations.length} nodes • {settlementCount} settlements
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setActiveTab("factions")} className="bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 px-3 py-1 text-xs font-bold">
                            FACTIONS
                        </Button>
                        <Button onClick={handleAdd} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1 text-xs font-bold">
                            + ADD
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <SummaryTile label="Province Coverage" value={String(new Set(locations.map((location) => location.provinceRegionId)).size)} />
                    <SummaryTile label="Highest Importance" value={String(highestImportance[0]?.importance ?? 0)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">Category</label>
                        <select
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            className="bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-sm text-gray-200"
                        >
                            <option value="all">All Categories</option>
                            {LOCATION_CATEGORY_OPTIONS.map((option) => (
                                <option key={option} value={option}>{titleCaseLocation(option)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">Status</label>
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-sm text-gray-200"
                        >
                            <option value="all">All Statuses</option>
                            {LOCATION_STATUS_OPTIONS.map((option) => (
                                <option key={option} value={option}>{titleCaseLocation(option)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-2 flex flex-col gap-2">
                        <label className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">Province</label>
                        <select
                            value={provinceFilter}
                            onChange={(event) => setProvinceFilter(event.target.value)}
                            className="bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-sm text-gray-200"
                        >
                            <option value="all">All Provinces</option>
                            {provinces.map((province) => (
                                <option key={province.id} value={province.id}>{province.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-2 flex flex-col gap-2">
                        <label className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">Search</label>
                        <input
                            type="text"
                            list="location-subtypes"
                            value={subtypeFilter}
                            onChange={(event) => setSubtypeFilter(event.target.value)}
                            placeholder="Name, subtype, type, province..."
                            className="bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-sm text-gray-200"
                        />
                        <datalist id="location-subtypes">
                            {subtypeOptions.map((option) => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Loading locations...</div>
                ) : filteredLocations.length === 0 ? (
                    <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-white/10 rounded-lg">
                        No locations match the current filters.
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {filteredLocations.map((location) => (
                            <button
                                key={location.id}
                                type="button"
                                onClick={() => handleSelect(location)}
                                className={`rounded-xl border p-3 text-left transition-all ${
                                    editingLocation?.id === location.id
                                        ? "border-emerald-500/40 bg-emerald-500/10"
                                        : "border-white/5 bg-black/20 hover:border-white/20"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-gray-100">{location.name}</p>
                                        <p className="truncate text-[10px] uppercase tracking-[0.18em] text-gray-500">
                                            {location.type} • {location.provinceName}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-sm font-black text-orange-300">{location.importance}</div>
                                        <div className="text-[9px] uppercase tracking-widest text-gray-500">{titleCaseLocation(location.scale)}</div>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.18em] text-gray-400">
                                    <span>{titleCaseLocation(location.category)}</span>
                                    <span>{titleCaseLocation(location.status)}</span>
                                    <span>{titleCaseLocation(location.subtype)}</span>
                                    <span className={location.source === "humanity_generated" ? "text-orange-300" : "text-cyan-300"}>
                                        {location.source === "humanity_generated" ? "Humanity" : "Manual"}
                                    </span>
                                    {location.isCustomized && <span className="text-emerald-300">Customized</span>}
                                    {location.populationEstimate !== null && <span>Pop {location.populationEstimate.toLocaleString()}</span>}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col overflow-hidden">
                {editingLocation ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
                            <div>
                                <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">Canonical Location</h2>
                                <p className="text-[10px] tracking-[0.18em] text-gray-500 uppercase">
                                    {editingLocation.provinceName} • {titleCaseLocation(editingLocation.category)}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em]">
                                    <span className={`rounded-full px-2 py-1 ${editingLocation.source === "humanity_generated" ? "bg-orange-500/10 text-orange-200" : "bg-cyan-500/10 text-cyan-200"}`}>
                                        {editingLocation.source === "humanity_generated" ? "Humanity Generated" : "Manual"}
                                    </span>
                                    {editingLocation.isCustomized && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">Customized</span>}
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => handleDelete(editingLocation.id)}
                                    className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest"
                                >
                                    DELETE
                                </Button>
                                <Button
                                    onClick={handleSaveLocation}
                                    disabled={isSaving}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400 px-6 py-1.5 font-bold tracking-widest text-xs"
                                >
                                    {isSaving ? "SAVING..." : "SAVE CHANGES"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <Field label="Name">
                                <input
                                    type="text"
                                    value={editingLocation.name}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, name: event.target.value })}
                                    className="input-shell"
                                />
                            </Field>
                            <Field label="Legacy Type Label">
                                <input
                                    type="text"
                                    value={editingLocation.type}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, type: event.target.value })}
                                    className="input-shell"
                                />
                            </Field>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <Field label="Province">
                                <select
                                    value={editingLocation.provinceRegionId}
                                    onChange={(event) => {
                                        const province = provinces.find((entry) => entry.id === event.target.value) || null;
                                        setEditingLocation(applyProvince(editingLocation, province));
                                    }}
                                    className="input-shell"
                                >
                                    <option value="">Select Province</option>
                                    {provinces.map((province) => (
                                        <option key={province.id} value={province.id}>{province.name}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Ruling Faction">
                                <select
                                    value={editingLocation.rulingFaction}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, rulingFaction: event.target.value })}
                                    className="input-shell"
                                >
                                    <option value="None">None</option>
                                    {factions.map((faction) => (
                                        <option key={faction.id} value={faction.name}>{faction.name}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <Field label="Category">
                                <select
                                    value={editingLocation.category}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, category: event.target.value as WorldLocation["category"] })}
                                    className="input-shell"
                                >
                                    {LOCATION_CATEGORY_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{titleCaseLocation(option)}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Subtype">
                                <input
                                    type="text"
                                    value={editingLocation.subtype}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, subtype: event.target.value })}
                                    className="input-shell"
                                />
                            </Field>
                            <Field label="Status">
                                <select
                                    value={editingLocation.status}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, status: event.target.value as WorldLocation["status"] })}
                                    className="input-shell"
                                >
                                    {LOCATION_STATUS_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{titleCaseLocation(option)}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Scale">
                                <select
                                    value={editingLocation.scale}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, scale: event.target.value as WorldLocation["scale"] })}
                                    className="input-shell"
                                >
                                    {LOCATION_SCALE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{titleCaseLocation(option)}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <Field label="X">
                                <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    value={editingLocation.x}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, x: clamp01(parseNumber(event.target.value, editingLocation.x)) })}
                                    className="input-shell"
                                />
                            </Field>
                            <Field label="Y">
                                <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    value={editingLocation.y}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, y: clamp01(parseNumber(event.target.value, editingLocation.y)) })}
                                    className="input-shell"
                                />
                            </Field>
                            <Field label="Population">
                                <input
                                    type="number"
                                    min={0}
                                    value={editingLocation.populationEstimate ?? ""}
                                    onChange={(event) => setEditingLocation({
                                        ...editingLocation,
                                        populationEstimate: event.target.value === "" ? null : Math.max(0, Math.round(parseNumber(event.target.value, 0))),
                                    })}
                                    className="input-shell"
                                    placeholder="None"
                                />
                            </Field>
                            <Field label="Importance">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={editingLocation.importance}
                                    onChange={(event) => setEditingLocation({ ...editingLocation, importance: Math.max(0, Math.min(100, Math.round(parseNumber(event.target.value, editingLocation.importance)))) })}
                                    className="input-shell"
                                />
                            </Field>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <MetricInput
                                label="Habitability"
                                value={editingLocation.habitabilityScore}
                                onChange={(value) => setEditingLocation({ ...editingLocation, habitabilityScore: value })}
                            />
                            <MetricInput
                                label="Economic"
                                value={editingLocation.economicScore}
                                onChange={(value) => setEditingLocation({ ...editingLocation, economicScore: value })}
                            />
                            <MetricInput
                                label="Strategic"
                                value={editingLocation.strategicScore}
                                onChange={(value) => setEditingLocation({ ...editingLocation, strategicScore: value })}
                            />
                            <MetricInput
                                label="Hazard"
                                value={editingLocation.hazardScore}
                                onChange={(value) => setEditingLocation({ ...editingLocation, hazardScore: value })}
                            />
                        </div>

                        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-6 mb-6">
                            <div className="space-y-6">
                                <Field label="Lore">
                                    <textarea
                                        value={editingLocation.lore}
                                        onChange={(event) => setEditingLocation({ ...editingLocation, lore: event.target.value })}
                                        className="input-shell min-h-[180px]"
                                        placeholder="Describe the site, its role, and the logic behind its existence."
                                    />
                                </Field>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label="Tags">
                                        <textarea
                                            value={joinListField(editingLocation.tags)}
                                            onChange={(event) => setEditingLocation({ ...editingLocation, tags: splitListField(event.target.value) })}
                                            className="input-shell min-h-[110px]"
                                            placeholder="trade, river, pilgrimage"
                                        />
                                    </Field>
                                    <Field label="Placement Drivers">
                                        <textarea
                                            value={joinListField(editingLocation.placementDrivers)}
                                            onChange={(event) => setEditingLocation({ ...editingLocation, placementDrivers: splitListField(event.target.value) })}
                                            className="input-shell min-h-[110px]"
                                            placeholder="fresh water, sheltered bay, duchy seat"
                                        />
                                    </Field>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-[#0a0f14] p-4 space-y-4">
                                <div>
                                    <p className="text-[10px] font-bold tracking-[0.18em] text-cyan-400 uppercase mb-2">Map Focus</p>
                                    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 aspect-[2/1]">
                                        {selectedWorld.textureUrl ? (
                                            <>
                                                <img src={selectedWorld.textureUrl} alt={selectedWorld.prompt} className="absolute inset-0 w-full h-full object-cover opacity-85" />
                                                <div
                                                    className="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_18px_rgba(249,115,22,0.8)] bg-orange-500"
                                                    style={{
                                                        left: `${editingLocation.x * 100}%`,
                                                        top: `${editingLocation.y * 100}%`,
                                                        transform: "translate(-50%, -50%)",
                                                    }}
                                                />
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                                                No world texture available.
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
                                    <MetaPill label="Province" value={editingLocation.provinceName} />
                                    <MetaPill label="Region Id" value={editingLocation.provinceRegionId} />
                                    <MetaPill label="Duchy" value={selectedProvince?.duchyId ? String(selectedProvince.duchyId) : "None"} />
                                    <MetaPill label="Kingdom" value={selectedProvince?.kingdomId ? String(selectedProvince.kingdomId) : "None"} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <Field label="Founding Reason">
                                <textarea
                                    value={editingLocation.historyHooks.foundingReason}
                                    onChange={(event) => setEditingLocation({
                                        ...editingLocation,
                                        historyHooks: { ...editingLocation.historyHooks, foundingReason: event.target.value },
                                    })}
                                    className="input-shell min-h-[120px]"
                                />
                            </Field>
                            <Field label="Current Tension">
                                <textarea
                                    value={editingLocation.historyHooks.currentTension}
                                    onChange={(event) => setEditingLocation({
                                        ...editingLocation,
                                        historyHooks: { ...editingLocation.historyHooks, currentTension: event.target.value },
                                    })}
                                    className="input-shell min-h-[120px]"
                                />
                            </Field>
                            <Field label="Story Seeds">
                                <textarea
                                    value={joinListField(editingLocation.historyHooks.storySeeds)}
                                    onChange={(event) => setEditingLocation({
                                        ...editingLocation,
                                        historyHooks: { ...editingLocation.historyHooks, storySeeds: splitListField(event.target.value) },
                                    })}
                                    className="input-shell min-h-[110px]"
                                    placeholder="bandit tax revolt, lost shrine below the hill"
                                />
                            </Field>
                            <Field label="Linked Lore Snippet Ids">
                                <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-h-[110px] space-y-2">
                                    {editingLocation.historyHooks.linkedLoreSnippetIds.length === 0 ? (
                                        <p className="text-xs text-gray-500">No linked lore snippets.</p>
                                    ) : editingLocation.historyHooks.linkedLoreSnippetIds.map((snippetId) => {
                                        const snippet = loreById[snippetId];
                                        return (
                                            <div key={snippetId} className="rounded-lg border border-white/5 bg-[#05080c] px-3 py-2">
                                                <div className="text-xs font-semibold text-gray-200">{snippet?.title || snippet?.location || snippetId}</div>
                                                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
                                                    {snippet?.source === "humanity_generated" ? "Humanity Generated" : "Manual"}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Field>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-40">
                        <div className="text-5xl mb-4">📍</div>
                        <p className="font-bold tracking-widest uppercase text-gray-400">Select or Create a Location</p>
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.2); }
                .input-shell {
                    width: 100%;
                    border-radius: 0.75rem;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    background: rgba(5, 8, 12, 0.9);
                    padding: 0.8rem 0.95rem;
                    color: rgb(229 231 235);
                    outline: none;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .input-shell:focus {
                    border-color: rgba(16, 185, 129, 0.45);
                    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.12);
                }
            `}</style>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">{label}</label>
            {children}
        </div>
    );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500">{label}</div>
            <div className="mt-1 text-lg font-black text-white">{value}</div>
        </div>
    );
}

function MetaPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500">{label}</div>
            <div className="mt-1 text-sm font-semibold text-gray-200 truncate">{value}</div>
        </div>
    );
}

function MetricInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <Field label={label}>
            <input
                type="number"
                min={0}
                max={100}
                value={value}
                onChange={(event) => onChange(Math.max(0, Math.min(100, Math.round(parseNumber(event.target.value, value)))))}
                className="input-shell"
            />
        </Field>
    );
}
