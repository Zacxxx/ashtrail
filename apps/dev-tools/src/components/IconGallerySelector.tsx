import React, { useState, useEffect, useCallback } from "react";
import { Modal, Button } from "@ashtrail/ui";

interface BatchIcon {
    filename: string;
    prompt: string;
    url: string;
}

interface BatchManifest {
    batchId: string;
    batchName: string;
    icons: BatchIcon[];
}

interface BatchSummary {
    batchId: string;
    batchName: string;
    iconCount: number;
    thumbnailUrl: string | null;
}

interface IconGallerySelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (url: string) => void;
}

export function IconGallerySelector({ isOpen, onClose, onSelect }: IconGallerySelectorProps) {
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [activeBatch, setActiveBatch] = useState<BatchManifest | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchText, setSearchText] = useState("");

    const loadBatches = useCallback(async () => {
        try {
            const res = await fetch("/api/icons/batches");
            if (res.ok) {
                const data = await res.json();
                setBatches(data);
            }
        } catch (e) {
            console.error("Failed to load batches:", e);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadBatches();
        }
    }, [isOpen, loadBatches]);

    const selectBatch = async (batchId: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/icons/batches/${batchId}`);
            if (res.ok) {
                const data = await res.json();
                setActiveBatch(data);
            }
        } catch (e) {
            console.error("Failed to load batch:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredIcons = activeBatch?.icons.filter(icon =>
        icon.prompt.toLowerCase().includes(searchText.toLowerCase())
    ) || [];

    return (
        <Modal open={isOpen} onClose={onClose} title="Icon Gallery">
            <div className="flex flex-col h-[600px] w-[800px] max-w-full">
                <div className="flex flex-1 overflow-hidden">
                    {/* Batch List */}
                    <aside className="w-1/3 border-r border-white/5 overflow-y-auto p-4 space-y-2 bg-black/20">
                        <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-4">Batches</h3>
                        {batches.map(batch => (
                            <button
                                key={batch.batchId}
                                onClick={() => selectBatch(batch.batchId)}
                                className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${activeBatch?.batchId === batch.batchId ? 'bg-indigo-500/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                            >
                                {batch.thumbnailUrl ? (
                                    <img src={batch.thumbnailUrl} alt="" className="w-8 h-8 rounded-lg object-cover bg-black/40" />
                                ) : (
                                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-xs">📦</div>
                                ) || <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-xs">📦</div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-200 truncate">{batch.batchName || batch.batchId.slice(0, 8)}</p>
                                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-tighter">{batch.iconCount} icons</p>
                                </div>
                            </button>
                        ))}
                    </aside>

                    {/* Icon Grid */}
                    <main className="flex-1 flex flex-col overflow-hidden bg-black/40">
                        <div className="p-4 border-b border-white/5 shrink-0">
                            <input
                                type="text"
                                placeholder="Search in batch..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                </div>
                            ) : activeBatch ? (
                                <div className="grid grid-cols-4 gap-4">
                                    {filteredIcons.map((icon, idx) => (
                                        <button
                                            key={`${icon.filename}-${idx}`}
                                            onClick={() => onSelect(icon.url)}
                                            className="group relative aspect-square bg-black/60 rounded-xl border border-white/5 hover:border-indigo-500/50 transition-all overflow-hidden"
                                        >
                                            <img src={icon.url} alt={icon.prompt} className="w-full h-full object-cover p-1" />
                                            <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-[10px] font-black uppercase text-white tracking-widest bg-black/60 px-2 py-1 rounded">Select</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                                    <div className="text-4xl">🔎</div>
                                    <p className="text-sm font-mono uppercase tracking-widest text-center">Select a batch to browse icons</p>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
                <div className="p-4 border-t border-white/5 flex justify-end shrink-0">
                    <Button onClick={onClose} className="!w-32">Cancel</Button>
                </div>
            </div>
        </Modal>
    );
}
