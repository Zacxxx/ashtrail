
import React, { useState, useEffect } from 'react';
import { calculateClockState, ClockState } from '../game-engine/gameplay/clock';

interface GameClockProps {
  serverStartTime: number;
  onNightfall?: () => void;
}

export const GameClock: React.FC<GameClockProps> = ({ serverStartTime, onNightfall }) => {
  const [clock, setClock] = useState<ClockState>(calculateClockState(serverStartTime));

  useEffect(() => {
    const timer = setInterval(() => {
      const next = calculateClockState(serverStartTime);
      if (!clock.isNightfall && next.isNightfall) {
        onNightfall?.();
      }
      setClock(next);
    }, 1000);
    return () => clearInterval(timer);
  }, [serverStartTime, clock.isNightfall, onNightfall]);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-sm shadow-inner">
      <div className="flex flex-col">
        <span className="text-[8px] text-zinc-500 uppercase mono tracking-widest">Cycle Progress</span>
        <div className="flex gap-1 items-center">
           <span className="text-xs font-black text-orange-500 mono">C{clock.currentCycle.toString().padStart(3, '0')}</span>
           <span className="text-zinc-700 font-bold">/</span>
           <span className="text-xs font-bold text-zinc-300 mono">{clock.gameHour.toString().padStart(2, '0')}:00 HRS</span>
        </div>
      </div>

      <div className="w-px h-6 bg-zinc-800" />

      <div className="flex flex-col">
        <span className={`text-[8px] uppercase mono tracking-widest ${clock.isNightfall ? 'text-red-500 animate-pulse' : 'text-zinc-500'}`}>
          {clock.isNightfall ? 'Nightfall Active' : 'Until Nightfall'}
        </span>
        <span className={`text-xs font-black mono ${clock.isNightfall ? 'text-red-500' : 'text-zinc-100'}`}>
          {formatTime(clock.msUntilNightfall)}
        </span>
      </div>

      {clock.isNightfall && (
        <div className="absolute top-0 left-0 w-full h-1 overflow-hidden pointer-events-none">
          <div className="h-full bg-red-600 animate-[shimmer_2s_infinite] shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
        </div>
      )}
    </div>
  );
};
