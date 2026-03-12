import { type BiomeArchetype } from "./types";
import { TextInput } from "./EcologyPage";

interface BiomeArchetypeEditorProps {
    archetype: BiomeArchetype;
    onSave: (archetype: BiomeArchetype) => void;
    onDelete: (id: string) => void;
}

export function BiomeArchetypeEditor({ archetype, onSave, onDelete }: BiomeArchetypeEditorProps) {
    const handleEnvChange = (key: keyof BiomeArchetype["envConditions"], value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;
        onSave({
            ...archetype,
            envConditions: {
                ...archetype.envConditions,
                [key]: numValue,
            },
        });
    };

    const handleColorChange = (key: keyof BiomeArchetype["colorProfile"], value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;
        onSave({
            ...archetype,
            colorProfile: {
                ...archetype.colorProfile,
                [key]: numValue,
            },
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-4">
                    <div
                        className="w-12 h-12 rounded-xl ring-2 ring-white/20 shadow-lg"
                        style={{ backgroundColor: archetype.hexColor }}
                    />
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">{archetype.name}</h2>
                        <p className="text-[10px] tracking-widest text-gray-500 uppercase font-medium">{archetype.id}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onDelete(archetype.id)}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-red-400 transition-all hover:bg-red-500/20"
                >
                    DELETE ARCHETYPE
                </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">General Identification</h3>
                    <TextInput
                        label="Display Name"
                        value={archetype.name}
                        onChange={(v) => onSave({ ...archetype, name: v })}
                    />
                    <TextInput
                        label="Hex Color"
                        value={archetype.hexColor}
                        onChange={(v) => onSave({ ...archetype, hexColor: v })}
                    />
                    <TextInput
                        label="Suitability Weight (0-1)"
                        value={String(archetype.suitabilityWeight)}
                        onChange={(v) => onSave({ ...archetype, suitabilityWeight: parseFloat(v) || 0 })}
                    />
                </div>

                <div className="space-y-4">
                    <h3 className="text-xs font-bold tracking-widest text-purple-400 uppercase">Color Profile (HSV Mapping)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <TextInput
                            label="H"
                            value={String(archetype.colorProfile.h)}
                            onChange={(v) => handleColorChange("h", v)}
                        />
                        <TextInput
                            label="S"
                            value={String(archetype.colorProfile.s)}
                            onChange={(v) => handleColorChange("s", v)}
                        />
                        <TextInput
                            label="V"
                            value={String(archetype.colorProfile.v)}
                            onChange={(v) => handleColorChange("v", v)}
                        />
                    </div>
                    <p className="text-[10px] text-gray-500 italic">Matches worldgen pixels via nearest neighbor in HSV space</p>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-xs font-bold tracking-widest text-orange-400 uppercase">Environmental Envelope (Normalized 0-1)</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-2xl bg-white/5 p-6 border border-white/5 shadow-inner">
                    <RangeInput
                        label="Temperature"
                        min={archetype.envConditions.temperatureMin}
                        max={archetype.envConditions.temperatureMax}
                        onMinChange={(v) => handleEnvChange("temperatureMin", v)}
                        onMaxChange={(v) => handleEnvChange("temperatureMax", v)}
                    />
                    <RangeInput
                        label="Precipitation"
                        min={archetype.envConditions.precipitationMin}
                        max={archetype.envConditions.precipitationMax}
                        onMinChange={(v) => handleEnvChange("precipitationMin", v)}
                        onMaxChange={(v) => handleEnvChange("precipitationMax", v)}
                    />
                    <RangeInput
                        label="Elevation"
                        min={archetype.envConditions.elevationMin}
                        max={archetype.envConditions.elevationMax}
                        onMinChange={(v) => handleEnvChange("elevationMin", v)}
                        onMaxChange={(v) => handleEnvChange("elevationMax", v)}
                    />
                    <RangeInput
                        label="Slope"
                        min={archetype.envConditions.slopeMin}
                        max={archetype.envConditions.slopeMax}
                        onMinChange={(v) => handleEnvChange("slopeMin", v)}
                        onMaxChange={(v) => handleEnvChange("slopeMax", v)}
                    />
                </div>
            </div>
        </div>
    );
}

function RangeInput({
    label,
    min,
    max,
    onMinChange,
    onMaxChange
}: {
    label: string,
    min: number,
    max: number,
    onMinChange: (v: string) => void,
    onMaxChange: (v: string) => void
}) {
    return (
        <div className="space-y-2">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label} Range</span>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    step="0.01"
                    value={min}
                    onChange={(e) => onMinChange(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-gray-200"
                />
                <span className="text-gray-600">→</span>
                <input
                    type="number"
                    step="0.01"
                    value={max}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-gray-200"
                />
            </div>
        </div>
    );
}
