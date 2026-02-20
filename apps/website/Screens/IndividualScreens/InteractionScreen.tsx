
import React, { useRef, useEffect } from 'react';
import { GameState } from '@ashtrail/core';
import { Button } from '../../UI/Primitives';

interface InteractionScreenProps {
  state: GameState;
  onAction: (action: string) => void;
  isLoading: boolean;
}

export const InteractionScreen: React.FC<InteractionScreenProps> = ({ state, onAction, isLoading }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.history]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* GM Intelligence Hub Overlay */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-orange-950/20 border border-orange-900/30 rounded-sm">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-orange-500 animate-ping' : 'bg-orange-900'}`} />
          <span className="text-[10px] mono uppercase font-black text-orange-500 tracking-widest">
            {isLoading ? 'DIRECTOR_AGENT: MANIFESTING_REALITY' : 'DIRECTOR_AGENT: MONITORING_SURVIVAL'}
          </span>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[7px] text-zinc-600 uppercase mono">Logic_Core</span>
            <span className="text-[9px] text-zinc-400 mono italic">Gemini 3 Flash</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[7px] text-zinc-600 uppercase mono">Visual_Core</span>
            <span className="text-[9px] text-zinc-400 mono italic">Gemini 2.5 Image</span>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2 bg-zinc-950/50 p-6 rounded-sm border border-zinc-900 shadow-inner relative custom-scrollbar"
      >
        <div className="absolute top-0 right-0 p-4 pointer-events-none opacity-5">
          <span className="text-[60px] font-black mono text-zinc-800 uppercase leading-none select-none">UPLINK</span>
        </div>

        {state.history.map((log, i) => (
          <div key={i} className={`animate-in fade-in slide-in-from-bottom-2 duration-500 leading-relaxed ${log.type === 'narrative' ? 'text-zinc-300 font-medium' :
              log.type === 'system' ? 'text-orange-400 font-bold italic border-l-2 border-orange-500/30 pl-3 py-1 bg-orange-950/5' :
                'text-zinc-600 mono text-[9px] opacity-60 uppercase border-b border-zinc-900/30 pb-1 mt-4'
            }`}>
            {log.type === 'action' && <span className="mr-2 text-orange-500 font-black">❯ EXECUTED:</span>}
            {log.content}
          </div>
        ))}

        {isLoading && (
          <div className="space-y-2 py-4">
            <div className="flex gap-2 items-center">
              <div className="h-1 w-12 bg-orange-900 animate-pulse" />
              <span className="text-[9px] text-orange-900 mono uppercase animate-pulse">Consulting Neural Shards...</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
              <div className="h-full bg-orange-600/30 animate-[shimmer_1.5s_infinite]" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-zinc-900/50 p-4 rounded-sm border border-zinc-800">
        <Button disabled={isLoading} variant="secondary" onClick={() => onAction('SCOUT')} className="text-[10px]">Scout Sector</Button>
        <Button disabled={isLoading} variant="secondary" onClick={() => onAction('TRADE')} className="text-[10px]">Trade Rumors</Button>
        <Button disabled={isLoading} variant="secondary" onClick={() => onAction('NEGOTIATE')} className="text-[10px]">Negotiate</Button>
        <Button disabled={isLoading} variant="danger" onClick={() => onAction('COMBAT')} className="text-[10px]">Combat Stance</Button>
        <Button disabled={isLoading} className="col-span-full py-4 text-xs font-black tracking-widest" variant="accent" onClick={() => onAction('END_DAY')}>
          ESTABLISH CAMP (SYNC CYCLE)
        </Button>
      </div>
    </div>
  );
};
