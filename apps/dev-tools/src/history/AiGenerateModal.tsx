import { useState, useCallback } from "react";
import { Modal, Button, Slider } from "@ashtrail/ui";
import type { Faction } from "./FactionsTab";
import type { Area } from "./locationTypes";
import type { Character } from "./CharactersTab";
import { useJobs } from "../jobs/useJobs";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";

// ── Types ──

type EntityType = "faction" | "area" | "character" | "lore";
type GeneratedEntity = Faction | Area | Character | any; // Use any for lore to avoid circular dependency, we'll cast it in LoreTab

interface AiGenerateModalProps {
    open: boolean;
    onClose: () => void;
    entityType: EntityType;
    onConfirm: (items: GeneratedEntity[]) => void;
    existingItems?: GeneratedEntity[];
    additionalContext?: string;
}

interface GeneratedPreview {
    entity: GeneratedEntity;
    selected: boolean;
}

// ── Prompt Templates ──

const SCHEMA_HINTS: Record<EntityType, string> = {
    faction: `Each object MUST have exactly these fields:
  id: string (UUID format),
  name: string,
  type: one of "Militaristic" | "Religious" | "Merchant" | "Political" | "Criminal" | "Scientific" | "Other",
  status: one of "Active" | "Secret" | "Destroyed" | "Emerging",
  structure: one of "Hierarchical" | "Democratic" | "Tribal" | "Corporate" | "Cult" | "Other",
  powerLevel: number 1-100,
  lore: string (2-4 sentences of rich worldbuilding lore),
  location: string`,
    area: `Each object MUST have exactly these fields:
  id: string (UUID format),
  name: string,
  type: one of "Continent" | "Kingdom" | "Duchy" | "Province" | "Urban" | "Rural" | "Wilderness" | "Ruins",
  status: one of "Thriving" | "Stable" | "Struggling" | "Abandoned" | "Rebuilding",
  population: number (0+),
  wealth: number (-100 to 100),
  development: number (-100 to 100),
  lore: string (2-4 sentences of rich worldbuilding lore),
  rulingFaction: string`,
    character: `Each object MUST have exactly these fields:
  id: string (UUID format),
  name: string,
  role: one of "Leader" | "Civilian" | "Scavenger" | "Soldier" | "Scholar" | "Merchant" | "Other",
  status: one of "Alive" | "Deceased" | "Missing" | "Imprisoned",
  location: string,
  affiliation: string,
  lore: string (2-4 sentences of rich character backstory),
  relationships: string`,
    lore: `Each object MUST have exactly these fields:
  id: string (UUID format),
  date: { year: number, era: string, month: number, day: number },
  location: string,
  content: string (2-4 sentences describing a historical event or lore snippet),
  involvedFactions: string[] (array of faction names involved),
  involvedCharacters: string[] (array of character names involved)`,
};

const ENTITY_LABELS: Record<EntityType, string> = {
    faction: "Factions",
    area: "Areas",
    character: "Characters",
    lore: "Lore Snippets",
};

function buildPrompt(
    entityType: EntityType,
    userPrompt: string | string[],
    count: number,
    mode: "shared" | "individual",
    existingItems: GeneratedEntity[],
    additionalContext?: string
): string {
    const existingContext = existingItems.length > 0
        ? `\nExisting ${ENTITY_LABELS[entityType]} in this world (avoid duplicating these):\n${existingItems.map(e => `- ${(e as any).name}`).join("\n")}\n`
        : "";

    const modeInstruction = mode === "shared"
        ? `Use this creative direction for ALL items: "${userPrompt}"`
        : `Generate exactly ${count} items. Each item must uniquely follow its corresponding creative direction from the list below:
${(userPrompt as string[]).map((p, i) => `Item ${i + 1}: "${p || 'Use your own creativity'}"`).join("\n")}`;

    const additionalCtx = additionalContext ? `\nWorld Context:\n${additionalContext}\n` : "";

    return `You are a fantasy worldbuilding assistant. Generate exactly ${count} unique ${ENTITY_LABELS[entityType].toLowerCase()} for a dark fantasy world.

${modeInstruction}
${existingContext}
${additionalCtx}
${SCHEMA_HINTS[entityType]}

CRITICAL: Respond ONLY with a valid JSON array. No markdown fences, no explanation, no comments. Just the raw JSON array.
Each id must be a valid UUID v4 like "550e8400-e29b-41d4-a716-446655440000".
Make each entry unique, diverse, and richly detailed.`;
}

// ── Component ──

export function AiGenerateModal({
    open,
    onClose,
    entityType,
    onConfirm,
    existingItems = [],
    additionalContext,
}: AiGenerateModalProps) {
    const { waitForJob } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();
    const [prompt, setPrompt] = useState("");
    const [individualPrompts, setIndividualPrompts] = useState<string[]>(Array(10).fill(""));
    const [count, setCount] = useState(3);
    const [mode, setMode] = useState<"shared" | "individual">("shared");
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previews, setPreviews] = useState<GeneratedPreview[]>([]);
    const [step, setStep] = useState<"config" | "preview">("config");

    const handleGenerate = useCallback(async () => {
        const activePrompt = mode === "shared" ? prompt : individualPrompts.slice(0, count);
        const hasPrompt = mode === "shared" ? prompt.trim() : (activePrompt as string[]).some(p => p.trim());
        if (!hasPrompt) return;

        setIsGenerating(true);
        setError(null);

        try {
            const fullPrompt = buildPrompt(entityType, activePrompt, count, mode, existingItems, additionalContext);
            const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                url: "/api/text/generate",
                request: { prompt: fullPrompt },
                optimisticJob: {
                    kind: "history.ai-generate",
                    title: `Generate ${ENTITY_LABELS[entityType]}`,
                    tool: "history",
                    status: "queued",
                    currentStage: "Queued",
                },
                restore: {
                    route: "/history",
                    payload: {
                        entityType,
                        count,
                        mode,
                        prompt,
                        individualPrompts: individualPrompts.slice(0, count),
                    },
                },
            });
            const detail = await waitForJob(accepted.jobId);
            if (detail.status !== "completed") {
                throw new Error(detail.error || "Generation failed");
            }
            let text: string = String((detail.result as { text?: string } | undefined)?.text || "");

            // Strip markdown fences if Gemini added them
            text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

            const parsed: GeneratedEntity[] = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error("Expected JSON array");

            setPreviews(parsed.map(entity => ({ entity, selected: true })));
            setStep("preview");
        } catch (e: any) {
            setError(e.message || "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, individualPrompts, count, mode, entityType, existingItems, additionalContext, launchTrackedJob, waitForJob]);

    const toggleSelection = (idx: number) => {
        setPreviews(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
    };

    const toggleAll = () => {
        const allSelected = previews.every(p => p.selected);
        setPreviews(prev => prev.map(p => ({ ...p, selected: !allSelected })));
    };

    const handleConfirm = () => {
        const selected = previews.filter(p => p.selected).map(p => p.entity);
        if (selected.length > 0) {
            onConfirm(selected);
        }
        handleReset();
        onClose();
    };

    const handleReset = () => {
        setStep("config");
        setPreviews([]);
        setError(null);
    };

    const handleClose = () => {
        handleReset();
        setPrompt("");
        setIndividualPrompts(Array(10).fill(""));
        onClose();
    };

    const selectedCount = previews.filter(p => p.selected).length;

    const getEntitySummary = (entity: GeneratedEntity): { name: string; subtitle: string; stats: string } => {
        const e = entity as any;
        switch (entityType) {
            case "faction":
                return {
                    name: e.name,
                    subtitle: `${e.type} · ${e.structure}`,
                    stats: `PWR ${e.powerLevel} · ${e.status}`,
                };
            case "area":
                return {
                    name: e.name,
                    subtitle: `${e.type} · Pop. ${(e.population || 0).toLocaleString()}`,
                    stats: `W${e.wealth ?? 0} D${e.development ?? 0} · ${e.status}`,
                };
            case "character":
                return {
                    name: e.name,
                    subtitle: `${e.role} · ${e.status}`,
                    stats: e.affiliation || "Unaffiliated",
                };
            case "lore":
                const d = e.date || { year: 0, era: '?', month: 1, day: 1 };
                return {
                    name: e.location || "Unknown Location",
                    subtitle: `${d.day}/${d.month}/${d.year} ${d.era}`,
                    stats: e.involvedFactions?.length ? e.involvedFactions.join(", ") : "No factions",
                };
        }
    };

    const accentColor = {
        faction: { bg: "bg-purple-500", text: "text-purple-400", border: "border-purple-500/30", glow: "bg-purple-500/10" },
        area: { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30", glow: "bg-emerald-500/10" },
        character: { bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/30", glow: "bg-amber-500/10" },
        lore: { bg: "bg-cyan-500", text: "text-cyan-400", border: "border-cyan-500/30", glow: "bg-cyan-500/10" },
    }[entityType];

    return (
        <Modal open={open} onClose={handleClose} title={`✨ GENERATE ${ENTITY_LABELS[entityType].toUpperCase()}`} maxWidth="max-w-3xl">
            <div className="p-6 space-y-6">
                {step === "config" && (
                    <>
                        {/* Prompt */}
                        <div>
                            <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">
                                Creative Direction
                            </label>
                            {mode === "shared" ? (
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    rows={4}
                                    placeholder={entityType === "faction"
                                        ? "e.g. 'Ancient desert cults that worship forgotten gods, dark and mysterious...'"
                                        : entityType === "area"
                                            ? "e.g. 'Frozen northern wastelands with ancient ruins buried under glaciers...'"
                                            : "e.g. 'Battle-hardened veterans from a recent civil war, morally grey characters...'"}
                                    className="w-full bg-[#080d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none font-mono leading-relaxed"
                                />
                            ) : (
                                <div className="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                                    {Array.from({ length: count }).map((_, i) => (
                                        <textarea
                                            key={i}
                                            value={individualPrompts[i]}
                                            onChange={e => {
                                                const newPrompts = [...individualPrompts];
                                                newPrompts[i] = e.target.value;
                                                setIndividualPrompts(newPrompts);
                                            }}
                                            rows={2}
                                            placeholder={`Item ${i + 1} creative direction...`}
                                            className="w-full bg-[#080d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none font-mono leading-relaxed"
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Count & Mode */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-3">
                                    COUNT — <span className={accentColor.text}>{count}</span>
                                </label>
                                <Slider
                                    label="Count"
                                    min={1} max={10} step={1} value={count}
                                    onChange={setCount}
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-3">
                                    PROMPT MODE
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMode("shared")}
                                        className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider border transition-all ${mode === "shared"
                                            ? `${accentColor.glow} ${accentColor.border} ${accentColor.text}`
                                            : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20"
                                            }`}
                                    >
                                        SHARED
                                    </button>
                                    <button
                                        onClick={() => setMode("individual")}
                                        className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider border transition-all ${mode === "individual"
                                            ? `${accentColor.glow} ${accentColor.border} ${accentColor.text}`
                                            : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20"
                                            }`}
                                    >
                                        PER ITEM
                                    </button>
                                </div>
                                <p className="text-[8px] text-gray-600 mt-2 uppercase tracking-wider">
                                    {mode === "shared"
                                        ? "One prompt shapes all generated items"
                                        : "Each item gets unique creative interpretation"}
                                </p>
                            </div>
                        </div>

                        {/* Generate Button */}
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || (mode === "shared" ? !prompt.trim() : !individualPrompts.slice(0, count).some(p => p.trim()))}
                            className={`w-full py-3.5 rounded-xl text-[11px] font-black tracking-[0.15em] border transition-all ${isGenerating
                                ? "border-white/5 bg-white/5 text-gray-500 cursor-wait"
                                : (mode === "shared" ? !prompt.trim() : !individualPrompts.slice(0, count).some(p => p.trim()))
                                    ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                    : `${accentColor.border} ${accentColor.glow} ${accentColor.text} hover:brightness-125`
                                }`}
                        >
                            {isGenerating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className={`inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin`} />
                                    GENERATING {count} {ENTITY_LABELS[entityType].toUpperCase()}...
                                </span>
                            ) : (
                                `✨ GENERATE ${count} ${ENTITY_LABELS[entityType].toUpperCase()}`
                            )}
                        </button>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                <p className="text-[10px] text-red-400 font-mono">{error}</p>
                            </div>
                        )}
                    </>
                )}

                {step === "preview" && (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white">Review Generated {ENTITY_LABELS[entityType]}</h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    {selectedCount} of {previews.length} selected
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={toggleAll}
                                    className="px-3 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
                                >
                                    {previews.every(p => p.selected) ? "DESELECT ALL" : "SELECT ALL"}
                                </button>
                                <button
                                    onClick={handleReset}
                                    className="px-3 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
                                >
                                    ← BACK
                                </button>
                            </div>
                        </div>

                        {/* Preview Cards */}
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                            {previews.map((preview, idx) => {
                                const summary = getEntitySummary(preview.entity);
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleSelection(idx)}
                                        className={`flex gap-4 p-4 rounded-xl border cursor-pointer transition-all ${preview.selected
                                            ? `${accentColor.glow} ${accentColor.border}`
                                            : "bg-black/20 border-white/5 opacity-50"
                                            }`}
                                    >
                                        {/* Checkbox */}
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${preview.selected
                                            ? `${accentColor.border} ${accentColor.bg}`
                                            : "border-white/20"
                                            }`}>
                                            {preview.selected && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="text-sm font-bold text-white truncate">{summary.name}</h4>
                                                <span className="text-[9px] text-gray-500 font-mono tracking-wider shrink-0">{summary.subtitle}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                                                {entityType === "lore" ? (preview.entity as any).content : (preview.entity as any).lore}
                                            </p>
                                            <p className="text-[9px] text-gray-600 font-mono mt-1">{summary.stats}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Confirm */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="flex-1 py-3 rounded-xl text-[10px] font-bold tracking-widest border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
                            >
                                {isGenerating ? "REGENERATING..." : "🔄 REGENERATE"}
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={selectedCount === 0}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black tracking-[0.12em] border transition-all ${selectedCount === 0
                                    ? "border-white/5 text-gray-600 cursor-not-allowed"
                                    : `${accentColor.border} ${accentColor.glow} ${accentColor.text} hover:brightness-125`
                                    }`}
                            >
                                ✓ CONFIRM {selectedCount} {ENTITY_LABELS[entityType].toUpperCase()}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
