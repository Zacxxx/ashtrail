import { useState, useEffect, useRef } from "react";
import { Button, Card } from "@ashtrail/ui";
import { type GenerationHistoryItem, type TemporalityConfig } from "../hooks/useGenerationHistory";

interface TemporalityTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

const DEFAULT_TEMPORALITY: TemporalityConfig = {
    eras: {
        before: "BC",
        after: "AC",
        splitEvent: "The Ashfall Cataclysm"
    },
    months: [
        { name: "Auria", days: 21 },
        { name: "Borealis", days: 22 },
        { name: "Cinder", days: 21 },
        { name: "Duskbreeze", days: 22 },
        { name: "Emberfall", days: 21 },
        { name: "Frostweaver", days: 22 },
        { name: "Gloomtide", days: 21 },
        { name: "Hearthfire", days: 22 },
        { name: "Ironcast", days: 21 },
        { name: "Jadesun", days: 22 },
        { name: "Krakenwake", days: 21 },
        { name: "Luminos", days: 22 },
        { name: "Maelstrom", days: 23 } // Total: 281
    ],
    currentDate: {
        year: 31,
        era: "AC",
        month: 1,
        day: 1
    }
};

function cloneTemporalityConfig(config: TemporalityConfig): TemporalityConfig {
    return JSON.parse(JSON.stringify(config)) as TemporalityConfig;
}

function serializeTemporalityConfig(config: TemporalityConfig): string {
    return JSON.stringify(config);
}

export function TemporalityTab({ selectedWorld }: TemporalityTabProps) {
    const [config, setConfig] = useState<TemporalityConfig | null>(null);
    const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
    const lastSavedConfigRef = useRef<string | null>(null);

    useEffect(() => {
        if (!selectedWorld) {
            setConfig(null);
            setSaveState("idle");
            lastSavedConfigRef.current = null;
            return;
        }

        fetch(`/api/planet/temporality/${selectedWorld.id}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.eras) {
                    setConfig(data);
                    lastSavedConfigRef.current = serializeTemporalityConfig(data);
                    setSaveState("saved");
                } else {
                    setConfig(null);
                    setSaveState("idle");
                    lastSavedConfigRef.current = null;
                }
            })
            .catch(() => {
                setConfig(null);
                setSaveState("error");
                lastSavedConfigRef.current = null;
            });
    }, [selectedWorld]);

    useEffect(() => {
        if (!selectedWorld || !config || saveState === "saving") {
            return;
        }

        const serializedConfig = serializeTemporalityConfig(config);
        const nextState = serializedConfig === lastSavedConfigRef.current ? "saved" : "dirty";
        if (saveState !== nextState) {
            setSaveState(nextState);
        }
    }, [config, saveState, selectedWorld]);

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 bg-[#121820] rounded-xl border border-white/5">
                <div className="text-4xl mb-4">🌍</div>
                <h3 className="text-lg font-bold tracking-widest text-gray-400 mb-2 uppercase">Select a World</h3>
                <p className="text-sm text-gray-500 max-w-sm">
                    Pick a planet to define its custom calendar and timeline configuration.
                </p>
            </div>
        );
    }

    const handleInitialize = async () => {
        if (!selectedWorld) return;
        const initialConfig = cloneTemporalityConfig(DEFAULT_TEMPORALITY);
        setConfig(initialConfig);
        setSaveState("saving");

        try {
            const response = await fetch(`/api/planet/temporality/${selectedWorld.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(initialConfig)
            });

            if (!response.ok) {
                throw new Error("Failed to initialize temporality");
            }

            lastSavedConfigRef.current = serializeTemporalityConfig(initialConfig);
            setSaveState("saved");
        } catch {
            setSaveState("error");
        }
    };

    const handleSave = async () => {
        if (!selectedWorld || !config) return;
        setSaveState("saving");

        try {
            const response = await fetch(`/api/planet/temporality/${selectedWorld.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                throw new Error("Failed to save temporality");
            }

            lastSavedConfigRef.current = serializeTemporalityConfig(config);
            setSaveState("saved");
        } catch {
            setSaveState("error");
        }
    };

    const totalDays = config?.months.reduce((acc, m) => acc + m.days, 0) || 0;
    const saveLabel =
        saveState === "saving"
            ? "SAVING..."
            : saveState === "saved"
                ? "SAVED!"
                : saveState === "error"
                    ? "RETRY SAVE"
                    : "SAVE CHANGES";
    const isSaveDisabled = saveState === "saving" || saveState === "saved";
    const saveButtonClassName = saveState === "saved"
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-default"
        : saveState === "error"
            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/30"
            : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/30";

    return (
        <div className="flex-1 min-h-0 overflow-hidden relative flex justify-center px-6 pb-6">
            {!config ? (
                <div className="m-auto flex flex-col items-center gap-6">
                    <div className="text-6xl">⏱️</div>
                    <div className="text-center">
                        <h2 className="text-xl font-bold tracking-widest text-gray-100 uppercase mb-2">No Temporality Defined</h2>
                        <p className="text-gray-500 text-sm max-w-md">
                            This world does not have a defined calendar or time system. Initialize the default Ashtrail 13-month calendar to get started.
                        </p>
                    </div>
                    <Button onClick={handleInitialize} className="bg-amber-600 hover:bg-amber-500 text-white font-bold tracking-[0.2em] px-8 py-3 rounded-xl uppercase">
                        Initialize Calendar
                    </Button>
                </div>
            ) : (
                <Card className="relative flex h-full min-h-0 w-full max-w-4xl flex-col gap-8 overflow-y-auto overscroll-contain bg-[#0a0f14] border-white/10 p-8 shadow-lg custom-scrollbar">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500/50 to-amber-500/0"></div>

                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <h2 className="text-lg font-black tracking-[0.2em] text-amber-500 uppercase drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                            TEMPORALITY EDITOR
                        </h2>
                        <Button
                            onClick={handleSave}
                            disabled={isSaveDisabled}
                            className={`px-6 py-2 border text-xs font-bold tracking-widest ${saveButtonClassName}`}
                        >
                            {saveLabel}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-6">
                        {/* Current Date */}
                        <div className="bg-[#121820] border border-white/5 p-6 rounded-xl">
                            <h3 className="text-sm font-bold tracking-widest text-gray-300 uppercase mb-4">Current Date</h3>
                            <div className="flex gap-4 items-end">
                                <div className="flex flex-col gap-2 flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Year</label>
                                    <input
                                        type="number"
                                        value={config.currentDate.year}
                                        onChange={e => setConfig({ ...config, currentDate: { ...config.currentDate, year: parseInt(e.target.value) || 1 } })}
                                        className="bg-[#05080c] border border-white/10 rounded-lg p-3 text-sm text-gray-200 outline-none focus:border-amber-500/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-2 flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Era</label>
                                    <select
                                        value={config.currentDate.era}
                                        onChange={e => setConfig({ ...config, currentDate: { ...config.currentDate, era: e.target.value } })}
                                        className="bg-[#05080c] border border-white/10 rounded-lg p-3 text-sm text-gray-200 outline-none focus:border-amber-500/50 appearance-none"
                                    >
                                        <option value={config.eras.before}>{config.eras.before}</option>
                                        <option value={config.eras.after}>{config.eras.after}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Eras */}
                        <div className="bg-[#121820] border border-white/5 p-6 rounded-xl">
                            <h3 className="text-sm font-bold tracking-widest text-gray-300 uppercase mb-4">Eras & Epochs</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Before Era Acronym</label>
                                    <input
                                        type="text"
                                        value={config.eras.before}
                                        onChange={e => setConfig({ ...config, eras: { ...config.eras, before: e.target.value } })}
                                        className="bg-[#05080c] border border-white/10 rounded-lg p-3 text-sm text-gray-200 outline-none focus:border-amber-500/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">After Era Acronym</label>
                                    <input
                                        type="text"
                                        value={config.eras.after}
                                        onChange={e => setConfig({ ...config, eras: { ...config.eras, after: e.target.value } })}
                                        className="bg-[#05080c] border border-white/10 rounded-lg p-3 text-sm text-gray-200 outline-none focus:border-amber-500/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-2 col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">The Splitting Event</label>
                                    <input
                                        type="text"
                                        value={config.eras.splitEvent}
                                        onChange={e => setConfig({ ...config, eras: { ...config.eras, splitEvent: e.target.value } })}
                                        className="bg-[#05080c] border border-white/10 rounded-lg p-3 text-sm text-gray-200 outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Months */}
                        <div className="bg-[#121820] border border-white/5 p-6 rounded-xl flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold tracking-widest text-gray-300 uppercase">Calendar Months</h3>
                                <span className="text-[10px] px-2 py-1 bg-amber-500/10 text-amber-500 rounded font-bold">{totalDays} Days / Year</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {config.months.map((m, idx) => (
                                    <div key={idx} className="flex gap-2 items-center bg-[#05080c] p-2 border border-white/5 rounded-lg">
                                        <div className="flex items-center justify-center w-6 h-6 rounded bg-white/5 text-[10px] font-bold text-gray-400 shrink-0">
                                            {idx + 1}
                                        </div>
                                        <input
                                            type="text"
                                            value={m.name}
                                            onChange={(e) => {
                                                const newMonths = [...config.months];
                                                newMonths[idx].name = e.target.value;
                                                setConfig({ ...config, months: newMonths });
                                            }}
                                            className="bg-transparent text-sm w-full outline-none text-gray-300 font-bold"
                                        />
                                        <input
                                            type="number"
                                            value={m.days}
                                            onChange={(e) => {
                                                const newMonths = [...config.months];
                                                newMonths[idx].days = parseInt(e.target.value) || 1;
                                                setConfig({ ...config, months: newMonths });
                                            }}
                                            className="bg-[#121820] text-amber-500 w-16 text-center text-sm outline-none rounded p-1 border border-white/5"
                                        />
                                        <span className="text-[10px] text-gray-500">Days</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>
            )}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.2); }
            `}</style>
        </div>
    );
}
