import { useEffect, useState } from "react";
import { Modal, Slider } from "@ashtrail/ui";
import type { BiomeEntry } from "./types";

export type EcologyBulkGeneratorKind = "flora" | "fauna";

export interface EcologyBulkGeneratorRequest {
    prompt: string;
    count: number;
    biomeIds: string[];
    includeIllustrations: boolean;
    illustrationStylePrompt: string;
}

interface EcologyBulkGeneratorModalProps {
    open: boolean;
    kind: EcologyBulkGeneratorKind;
    biomes: BiomeEntry[];
    isGenerating: boolean;
    stage: string;
    error: string | null;
    onClose: () => void;
    onGenerate: (request: EcologyBulkGeneratorRequest) => Promise<void>;
}

function toggleString(values: string[], value: string) {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function EcologyBulkGeneratorModal({
    open,
    kind,
    biomes,
    isGenerating,
    stage,
    error,
    onClose,
    onGenerate,
}: EcologyBulkGeneratorModalProps) {
    const [prompt, setPrompt] = useState("");
    const [count, setCount] = useState(3);
    const [selectedBiomeIds, setSelectedBiomeIds] = useState<string[]>([]);
    const [includeIllustrations, setIncludeIllustrations] = useState(true);
    const [illustrationStylePrompt, setIllustrationStylePrompt] = useState("");

    useEffect(() => {
        if (!open) return;
        setPrompt("");
        setCount(3);
        setSelectedBiomeIds([]);
        setIncludeIllustrations(true);
        setIllustrationStylePrompt("");
    }, [open, kind]);

    const noun = kind === "flora" ? "flora" : "fauna";

    return (
        <Modal
            open={open}
            onClose={() => {
                if (!isGenerating) onClose();
            }}
            title={`AI ${noun.toUpperCase()} GENERATOR`}
            maxWidth="max-w-5xl"
        >
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-[1fr_320px] gap-6">
                    <div className="space-y-5">
                        <div>
                            <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">
                                Creative Direction & Prompt
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                rows={5}
                                placeholder={
                                    kind === "flora"
                                        ? "e.g. 'Hardy dune plants, edible marsh crops, and luminous fungal shelf growth for a monsoon coastline.'"
                                        : "e.g. 'River predators, burden beasts, and migratory wetland birds adapted to a hot savanna frontier.'"
                                }
                                className="w-full bg-[#080d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none font-mono leading-relaxed"
                            />
                        </div>

                        <div>
                            <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">
                                Illustration Style Modifier
                            </label>
                            <input
                                type="text"
                                value={illustrationStylePrompt}
                                onChange={(e) => setIllustrationStylePrompt(e.target.value)}
                                placeholder="e.g. field-journal naturalism, painterly zoological plate, dry scientific cutaway"
                                className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 font-mono"
                            />
                            <p className="mt-1 text-[10px] text-gray-500">
                                Reused as the shared style prompt when illustration batches are generated.
                            </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Biome Anchors</h3>
                                <span className="text-[10px] text-gray-500 font-mono">{selectedBiomeIds.length} selected</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {biomes.map((biome) => {
                                    const selected = selectedBiomeIds.includes(biome.id);
                                    return (
                                        <button
                                            key={biome.id}
                                            type="button"
                                            onClick={() => setSelectedBiomeIds((current) => toggleString(current, biome.id))}
                                            className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-widest transition-all ${
                                                selected
                                                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                                                    : "border-white/10 bg-[#0a0f14] text-gray-400 hover:border-white/20"
                                            }`}
                                        >
                                            {biome.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                    </div>

                    <div className="space-y-5">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-3">
                                Batch Count - <span className="text-indigo-400">{count}</span>
                            </p>
                            <Slider label="Count" min={1} max={12} step={1} value={count} onChange={setCount} />
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">Companion Illustrations</p>
                                    <p className="mt-1 text-[10px] text-gray-400">
                                        Generate and attach a linked illustration batch for the new {noun} entries.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIncludeIllustrations((prev) => !prev)}
                                    className={`relative h-6 w-11 rounded-full transition-all ${includeIllustrations ? "bg-emerald-500/40" : "bg-white/10"}`}
                                >
                                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${includeIllustrations ? "left-5.5" : "left-0.5"}`} />
                                </button>
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">Output Notes</p>
                            <ul className="mt-2 space-y-2 text-[10px] text-gray-400">
                                <li>Generated entries are saved as drafts in the ecology bundle.</li>
                                <li>Biome anchors are optional but improve consistency.</li>
                                <li>Illustrations use the existing asset batch system, so they appear through the same ecology asset links as manual generation.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {stage && (
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                        <p className="text-[10px] font-mono text-cyan-300">{stage}</p>
                    </div>
                )}

                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                        <p className="text-[10px] font-mono text-red-400">{error}</p>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() =>
                        void onGenerate({
                            prompt: prompt.trim(),
                            count,
                            biomeIds: selectedBiomeIds,
                            includeIllustrations,
                            illustrationStylePrompt: illustrationStylePrompt.trim(),
                        })
                    }
                    disabled={isGenerating || !prompt.trim()}
                    className={`w-full py-4 rounded-xl text-[12px] font-black tracking-[0.2em] border transition-all ${
                        isGenerating
                            ? "border-white/5 bg-white/5 text-gray-500 cursor-wait"
                            : !prompt.trim()
                                ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                : "border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:brightness-125"
                    }`}
                >
                    {isGenerating ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                            GENERATING BATCH...
                        </span>
                    ) : (
                        `GENERATE ${count} ${kind === "flora" ? "FLORA" : "FAUNA"}`
                    )}
                </button>
            </div>
        </Modal>
    );
}
