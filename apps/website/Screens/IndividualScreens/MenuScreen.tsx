
import React, { useState, useEffect } from 'react';
import { Button, ScreenShell, Stack, Container } from '../../UI/Primitives';
import { calculateClockState, ClockState } from '../../game-engine/gameplay/clock';

interface MenuScreenProps {
  onStart: () => void;
  onManageCharacters?: () => void;
  onSettings?: () => void;
  hasCharacter?: boolean;
  serverStartTime: number;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({ 
  onStart, 
  onManageCharacters, 
  onSettings, 
  hasCharacter,
  serverStartTime
}) => {
  const [clock, setClock] = useState<ClockState>(calculateClockState(serverStartTime));

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(calculateClockState(serverStartTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [serverStartTime]);

  // Game starts on Oct 12, 2031.
  // Each cycle represents one full game day passing.
  const baseDate = new Date(2031, 9, 12); // October is month 9 (0-indexed)
  const gameDate = new Date(baseDate.getTime() + (clock.currentCycle - 1) * 24 * 60 * 60 * 1000);
  
  const formattedDate = gameDate.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
  
  const formattedTime = `${clock.gameHour.toString().padStart(2, '0')}:00`;

  return (
    <ScreenShell>
      <Container centered className="flex flex-col items-center gap-16 text-center">
        <Stack gap={4} className="animate-in fade-in slide-in-from-top-4 duration-1000">
          <h1 className="text-9xl font-black italic tracking-tighter text-white mono uppercase scale-y-110 leading-none">
            ASHTRAIL
          </h1>
        </Stack>

        <Stack gap={4} className="w-72 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
          <Button 
            size="lg" 
            variant="accent" 
            onClick={onStart} 
            className="py-6 text-base tracking-[0.2em] font-black group relative overflow-hidden"
          >
            <span className="relative z-10">Create Character</span>
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
          </Button>

          {hasCharacter && (
            <Button 
              size="md" 
              variant="secondary" 
              onClick={onManageCharacters} 
              className="py-4 text-xs tracking-[0.1em] font-bold"
            >
              Manage Characters
            </Button>
          )}

          <Button 
            size="md" 
            variant="ghost" 
            onClick={onSettings} 
            className="py-3 text-[10px] tracking-[0.1em] font-bold border border-zinc-800/50"
          >
            Settings
          </Button>
        </Stack>

        <Stack direction="row" gap={8} className="mt-8 items-center justify-center opacity-40">
           <div className="text-[10px] mono uppercase text-zinc-400">Player Active</div>
           <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
           <div className="text-[10px] mono uppercase text-zinc-400 tracking-widest">
              {formattedDate} // {formattedTime} HRS
           </div>
        </Stack>
      </Container>
    </ScreenShell>
  );
};
