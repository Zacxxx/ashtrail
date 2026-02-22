import type { SimulationConfig } from "../modules/geo/types";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";
import type { PlanetWorld } from "./types";

interface HistoryGalleryProps {
    history: GenerationHistoryItem[];
    deleteFromHistory: (id: string) => void;
    onSelect: (item: GenerationHistoryItem) => void;
}

export function HistoryGallery({
    history,
    deleteFromHistory,
    onSelect,
}: HistoryGalleryProps) {
    return (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 scrollbar-thin">
            {history.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center h-40 text-center space-y-3 opacity-50">
                    <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                    <p className="text-[9px] font-bold tracking-widest text-gray-500">NO ARCHIVES FOUND</p>
                </div>
            ) : (
                history.map(item => (
                    <div key={item.id} className="relative aspect-[2/1] group border border-white/10 bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-[#E6E6FA]/40 transition-all shadow-lg"
                        onClick={() => onSelect(item)}
                    >
                        <img src={item.textureUrl} alt="History thumbnail" className="absolute inset-0 w-full h-full object-cover object-center opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                        <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent">
                            <p className="text-[10px] text-gray-200 line-clamp-2 font-medium leading-relaxed drop-shadow-md">{item.prompt}</p>
                            <p className="text-[8px] font-bold tracking-widest text-[#E6E6FA] mt-2">{new Date(item.timestamp).toLocaleDateString()}</p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id); }}
                            className="absolute bottom-3 right-3 text-[9px] font-bold tracking-widest bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-red-500/30"
                        >
                            DELETE
                        </button>
                    </div>
                ))
            )}
        </div>
    );
}
