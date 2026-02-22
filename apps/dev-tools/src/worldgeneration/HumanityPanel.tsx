import { useState } from "react";
import { Slider, Button } from "@ashtrail/ui";
import type { GenerationProgress, PlanetWorld, GeoRegion } from "./types";

interface HumanityPanelProps {
    humPrompt: string;
    setHumPrompt: (value: string) => void;
    humSettlements: number;
    setHumSettlements: (value: number) => void;
    humTech: number;
    setHumTech: (value: number) => void;
    generateHumanity: (targetRegionId?: string) => void;
    genProgress: GenerationProgress;
    globeWorld: PlanetWorld | null;
    regions: GeoRegion[];
}

export function HumanityPanel({
    humPrompt,
    setHumPrompt,
    humSettlements,
    setHumSettlements,
    humTech,
    setHumTech,
    generateHumanity,
    genProgress,
    globeWorld,
    regions,
}: HumanityPanelProps) {
    const [targetRegionId, setTargetRegionId] = useState<string>("global");

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
            <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-orange-400 flex items-center gap-2 mb-6">
                    <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                    HUMANITY ENGINE
                </h3>
                <div className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-2">TARGET REGION</label>
                        <select
                            value={targetRegionId}
                            onChange={(e) => setTargetRegionId(e.target.value)}
                            className="w-full bg-black/40 text-[10px] font-bold tracking-widest text-orange-300 border border-white/10 p-2.5 rounded-lg focus:outline-none focus:border-orange-500/50 appearance-none truncate"
                        >
                            <option value="global">[Global Base]</option>
                            {regions.map(r => (
                                <option key={r.id} value={r.id}>{r.name} ({r.type.replace('_', ' ')})</option>
                            ))}
                        </select>
                        {regions.length === 0 && <p className="text-[8px] text-gray-500 mt-1">Define regions in Geography step to apply localized factions.</p>}
                    </div>

                    <div>
                        <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-3">
                            CIVILIZATION SEED
                        </label>
                        <textarea
                            value={humPrompt}
                            onChange={e => setHumPrompt(e.target.value)}
                            className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-orange-500/50 resize-none shadow-inner placeholder:text-gray-700 transition-colors"
                            placeholder="Architectural style, cities vs nomads, mega-structures..."
                        />
                    </div>
                    <Slider label="SETTLEMENT DENSITY" value={humSettlements} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setHumSettlements} />
                    <Slider label="TECHNOLOGICAL ERA" value={humTech} min={0} max={1} step={0.05} format={v => v < 0.3 ? "PRIMITIVE" : v < 0.6 ? "MEDIEVAL" : v < 0.8 ? "INDUSTRIAL" : "SCI-FI"} onChange={setHumTech} />
                </div>
                <div className="pt-6 mt-4 border-t border-white/5">
                    <Button
                        variant="primary"
                        onClick={() => generateHumanity(targetRegionId === "global" ? undefined : targetRegionId)}
                        disabled={genProgress.isActive || !globeWorld?.textureUrl}
                        className="w-full text-[10px] tracking-[0.2em] font-black py-4 bg-orange-600/80 hover:bg-orange-500 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)] disabled:opacity-50 disabled:shadow-none transition-all rounded-xl"
                    >
                        {genProgress.isActive ? "GENERATING..." : `APPLY CIVILIZATION TO ${targetRegionId === 'global' ? 'GLOBE' : 'REGION'}`}
                    </Button>
                </div>
            </div>
        </div>
    );
}
