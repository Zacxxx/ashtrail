import React from "react";
import { Occupation } from "@ashtrail/core";

interface OccupationsViewProps {
    occupation: Occupation | null;
}

export function OccupationsView({ occupation }: OccupationsViewProps) {
    if (!occupation) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">⚙️</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select an Occupation to view details</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full max-w-[800px] flex flex-col gap-8 p-8 border border-white/5 rounded-2xl bg-black/40 backdrop-blur-sm shadow-2xl overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-start border-b border-white/10 pb-6">
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-black tracking-[0.3em] text-orange-500">Occupation Data</span>
                    <h2 className="text-4xl font-black uppercase tracking-wider text-orange-400">
                        {occupation.name}
                    </h2>
                    <span className="text-xs text-gray-500 font-mono">{occupation.id}</span>
                </div>

                <div className="flex flex-col items-end">
                    <div className="px-4 py-1 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-400 text-[10px] font-bold uppercase tracking-widest">
                        {occupation.category}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="flex flex-col gap-2 p-6 bg-white/5 rounded-xl border border-white/5">
                    <h3 className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Short Description</h3>
                    <p className="text-sm text-gray-300 leading-relaxed font-mono font-bold italic">
                        "{occupation.shortDescription}"
                    </p>
                </div>

                <div className="flex flex-col gap-2 p-6 bg-white/5 rounded-xl border border-white/5">
                    <h3 className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Full Description</h3>
                    <p className="text-sm text-gray-300 leading-relaxed font-mono">
                        {occupation.description}
                    </p>
                </div>

                <div className="flex flex-col gap-3 p-6 bg-orange-500/5 rounded-xl border border-orange-500/20">
                    <h3 className="text-[10px] uppercase font-bold text-orange-500/70 tracking-widest">Starting Perks</h3>
                    <ul className="flex flex-col gap-2">
                        {occupation.perks.map((perk, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-orange-200 font-mono">
                                <span className="text-orange-500 mt-1">◆</span>
                                <span>{perk}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
