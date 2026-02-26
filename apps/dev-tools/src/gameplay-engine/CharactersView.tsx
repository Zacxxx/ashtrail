import React from "react";
import { Character } from "@ashtrail/core";

interface CharactersViewProps {
    character: Character | null;
}

export function CharactersView({ character }: CharactersViewProps) {
    if (!character) {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-500 font-mono text-sm">
                Select a character to view details.
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col gap-6 p-8 bg-black/40 border border-white/5 rounded-2xl relative">
            <div className="flex justify-between items-start border-b border-white/10 pb-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                        <h2 className="text-3xl font-black uppercase tracking-widest text-indigo-500">
                            {character.name}
                        </h2>
                        {character.isNPC && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-500 text-[10px] font-black tracking-widest uppercase rounded border border-red-500/20">
                                NPC/Archetype
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-sm font-mono text-gray-400">
                        <span>Level {character.level}</span>
                        <span>•</span>
                        <span>{character.occupation?.name || "No Occupation"}</span>
                        <span>•</span>
                        <span>Age: {character.age}</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-8">
                {/* Stats */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-1">Core Stats</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Object.entries(character.stats).map(([statName, value]) => (
                            <div key={statName} className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                                <span className="text-xs uppercase text-gray-400 tracking-wider font-bold">{statName}</span>
                                <span className="text-indigo-400 font-mono font-bold">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Traits */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-1">Active Traits</h3>
                    {character.traits.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {character.traits.map(t => (
                                <div key={t.id} className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col gap-1">
                                    <span className={`text-xs font-bold uppercase tracking-wide ${t.type === 'positive' ? 'text-blue-400' : t.type === 'negative' ? 'text-red-400' : 'text-gray-400'}`}>{t.name}</span>
                                    <span className="text-[10px] text-gray-500 line-clamp-2">{t.description}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500 italic">No traits assigned.</p>
                    )}
                </div>

                {/* Lore Background */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1">Background History</h3>
                    <p className="text-sm text-gray-400 leading-relaxed italic border-l-2 border-indigo-500/30 pl-4 py-2">
                        {character.history || "No history provided."}
                    </p>
                </div>
            </div>
        </div>
    );
}
