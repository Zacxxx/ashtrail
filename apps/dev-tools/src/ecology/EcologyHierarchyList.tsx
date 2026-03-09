import type { EcologyBundle, WorldgenRegion } from "./types";

interface EcologyHierarchyListProps {
    regions: WorldgenRegion[];
    bundle: EcologyBundle;
    selectedProvinceId: number | null;
    onSelectProvince: (provinceId: number) => void;
    onGenerateProvince?: (provinceId: number) => void;
    disableActions?: boolean;
    canGenerateProvince?: (province: WorldgenRegion) => boolean;
}

function provinceStatus(bundle: EcologyBundle, provinceId: number) {
    return bundle.provinces.find((entry) => entry.provinceId === provinceId)?.status ?? "missing";
}

function statusClasses(status: string) {
    switch (status) {
        case "approved":
            return "text-green-300 bg-green-500/10 border-green-500/30";
        case "draft":
            return "text-amber-300 bg-amber-500/10 border-amber-500/30";
        default:
            return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
}

export function EcologyHierarchyList({
    regions,
    bundle,
    selectedProvinceId,
    onSelectProvince,
    onGenerateProvince,
    disableActions = false,
    canGenerateProvince,
}: EcologyHierarchyListProps) {
    const kingdoms = regions.filter((entry) => entry.type === "Kingdom").sort((a, b) => a.name.localeCompare(b.name));
    const duchies = regions.filter((entry) => entry.type === "Duchy");
    const provinces = regions.filter((entry) => entry.type === "Province");

    return (
        <div className="flex flex-col gap-3">
            {kingdoms.map((kingdom) => {
                const kingdomDuchies = duchies
                    .filter((entry) => entry.kingdomId === kingdom.rawId)
                    .sort((a, b) => a.name.localeCompare(b.name));

                return (
                    <div key={kingdom.id} className="rounded-xl border border-amber-500/20 bg-[#121820]/90 p-3 shadow-lg">
                        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                            <div>
                                <h3 className="text-sm font-bold tracking-widest text-amber-300 uppercase">{kingdom.name}</h3>
                                <p className="text-[10px] tracking-widest text-gray-500 uppercase">
                                    {kingdomDuchies.length} duchies
                                </p>
                            </div>
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-amber-300">
                                KINGDOM
                            </span>
                        </div>

                        <div className="space-y-3">
                            {kingdomDuchies.map((duchy) => {
                                const duchyProvinces = provinces
                                    .filter((entry) => entry.duchyId === duchy.rawId)
                                    .sort((a, b) => a.name.localeCompare(b.name));

                                return (
                                    <div key={duchy.id} className="rounded-lg border border-purple-500/15 bg-black/20 p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold tracking-widest text-purple-300 uppercase">{duchy.name}</h4>
                                                <p className="text-[10px] tracking-widest text-gray-500 uppercase">
                                                    {duchyProvinces.length} provinces
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-purple-300">
                                                DUCHY
                                            </span>
                                        </div>

                                        <div className="space-y-1.5">
                                            {duchyProvinces.map((province) => {
                                                const status = provinceStatus(bundle, province.rawId ?? -1);
                                                const isSelected = selectedProvinceId === province.rawId;
                                                return (
                                                    <div
                                                        key={province.id}
                                                        className={`flex items-center gap-3 rounded-lg border p-2 transition-all ${
                                                            isSelected
                                                                ? "border-cyan-500/40 bg-cyan-500/10"
                                                                : "border-white/10 bg-[#0a0f14]/80 hover:border-white/20"
                                                        }`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => province.rawId !== undefined && onSelectProvince(province.rawId)}
                                                            className="flex-1 text-left"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div>
                                                                    <p className="text-sm font-bold text-gray-100">{province.name}</p>
                                                                    <p className="text-[10px] tracking-widest text-gray-500 uppercase">
                                                                        Province #{province.rawId} {province.area ? `• area ${province.area}` : ""}
                                                                    </p>
                                                                </div>
                                                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase ${statusClasses(status)}`}>
                                                                    {status}
                                                                </span>
                                                            </div>
                                                        </button>
                                                        {onGenerateProvince && province.rawId !== undefined && (
                                                            <button
                                                                type="button"
                                                                onClick={() => onGenerateProvince(province.rawId!)}
                                                                disabled={disableActions || (canGenerateProvince ? !canGenerateProvince(province) : false)}
                                                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                                                            >
                                                                GENERATE
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
