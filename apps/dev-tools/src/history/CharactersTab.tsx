import { useState, useEffect } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button } from "@ashtrail/ui";

interface CharactersTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

export interface Character {
    id: string;
    name: string;
    role: "Leader" | "Civilian" | "Scavenger" | "Soldier" | "Scholar" | "Merchant" | "Other";
    status: "Alive" | "Deceased" | "Missing" | "Imprisoned";
    location: string;
    affiliation: string; // Faction ID or Name
    lore: string;
    relationships: string;
}

export function CharactersTab({ selectedWorld }: CharactersTabProps) {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);

    useEffect(() => {
        if (!selectedWorld) {
            setCharacters([]);
            setEditingCharacter(null);
            return;
        }

        setIsLoading(true);
        fetch(`http://localhost:8787/api/planet/characters/${selectedWorld.id}`)
            .then(res => res.json())
            .then(data => {
                setCharacters(Array.isArray(data) ? data : []);
            })
            .catch(err => console.error("Failed to load characters", err))
            .finally(() => setIsLoading(false));
    }, [selectedWorld]);

    const handleSave = async (updatedCharacters: Character[]) => {
        if (!selectedWorld) return;
        setIsSaving(true);
        try {
            const res = await fetch(`http://localhost:8787/api/planet/characters/${selectedWorld.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedCharacters)
            });
            if (res.ok) {
                setCharacters(updatedCharacters);
            }
        } catch (err) {
            console.error("Failed to save characters", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddCharacter = () => {
        const newCharacter: Character = {
            id: crypto.randomUUID(),
            name: "New Character",
            role: "Civilian",
            status: "Alive",
            location: "Unknown",
            affiliation: "None",
            lore: "",
            relationships: "",
        };
        setEditingCharacter(newCharacter);
    };

    const handleSaveCharacter = () => {
        if (!editingCharacter) return;
        let newCharacters = [...characters];
        const existingIndex = newCharacters.findIndex(c => c.id === editingCharacter.id);
        if (existingIndex >= 0) {
            newCharacters[existingIndex] = editingCharacter;
        } else {
            newCharacters.push(editingCharacter);
        }
        handleSave(newCharacters);
        setEditingCharacter(null);
    };

    const handleDeleteCharacter = (id: string) => {
        const newCharacters = characters.filter(c => c.id !== id);
        handleSave(newCharacters);
        if (editingCharacter?.id === id) setEditingCharacter(null);
    };

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80">
                <div className="text-5xl mb-4">👤</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Please select a world from the World tab to begin creating its characters and their relationships.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
            {/* List Panel */}
            <div className="w-[350px] flex flex-col gap-4 bg-[#121820] border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-purple-500 uppercase">Characters</h2>
                        <p className="text-[10px] tracking-widest text-gray-500 uppercase">{characters.length} created</p>
                    </div>
                    <Button onClick={handleAddCharacter} className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 px-3 py-1 font-bold text-xs">
                        + ADD
                    </Button>
                </div>

                {isLoading ? (
                    <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Loading characters...</div>
                ) : characters.length === 0 ? (
                    <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-white/10 rounded-lg">No characters created yet.</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {characters.map(character => (
                            <div
                                key={character.id}
                                onClick={() => setEditingCharacter(character)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${editingCharacter?.id === character.id ? 'bg-purple-500/10 border-purple-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-sm font-bold text-gray-200">{character.name}</h3>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-purple-400">{character.role}</span>
                                </div>
                                <div className="flex gap-2 text-[10px] tracking-widest text-gray-500 uppercase">
                                    <span>{character.status}</span>
                                    <span>•</span>
                                    <span className="truncate max-w-[120px]">{character.affiliation}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Editor Panel */}
            <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col relative overflow-hidden">
                {editingCharacter ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                            <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">Edit Character</h2>
                            <div className="flex gap-3">
                                <Button onClick={() => handleDeleteCharacter(editingCharacter.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                    DELETE
                                </Button>
                                <Button onClick={handleSaveCharacter} disabled={isSaving} className="bg-purple-500 hover:bg-purple-400 text-white border border-purple-400 px-6 py-1.5 font-bold tracking-widest text-xs">
                                    {isSaving ? "SAVING..." : "SAVE CHANGES"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Name</label>
                                <input
                                    type="text"
                                    value={editingCharacter.name}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, name: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-purple-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Affiliation (Faction)</label>
                                <input
                                    type="text"
                                    value={editingCharacter.affiliation}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, affiliation: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-purple-500/50 focus:outline-none text-gray-200 w-full"
                                    placeholder="e.g. Iron Vanguard"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6 mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Role</label>
                                <select
                                    value={editingCharacter.role}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, role: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-purple-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Leader", "Civilian", "Scavenger", "Soldier", "Scholar", "Merchant", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Status</label>
                                <select
                                    value={editingCharacter.status}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, status: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-purple-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Alive", "Deceased", "Missing", "Imprisoned"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Notable Location</label>
                                <input
                                    type="text"
                                    value={editingCharacter.location}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, location: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-purple-500/50 focus:outline-none text-gray-200 w-full"
                                    placeholder="e.g. The Spire"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Lore & Backstory</label>
                                <textarea
                                    value={editingCharacter.lore}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, lore: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-4 text-sm focus:border-purple-500/50 focus:outline-none text-gray-300 w-full flex-1 min-h-[150px] custom-scrollbar"
                                    placeholder="Describe their past, motivations, and impact on the world..."
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Relationships</label>
                                <textarea
                                    value={editingCharacter.relationships}
                                    onChange={e => setEditingCharacter({ ...editingCharacter, relationships: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-4 text-sm focus:border-purple-500/50 focus:outline-none text-gray-300 w-full flex-1 min-h-[150px] custom-scrollbar"
                                    placeholder="Note their allies, enemies, and key interactions..."
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
                        <div className="text-5xl mb-4">👤</div>
                        <p className="font-bold tracking-widest uppercase text-gray-400">Select a Character to Edit</p>
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.2); }
            `}</style>
        </div>
    );
}
