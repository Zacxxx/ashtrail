
import React, { useState, useEffect } from 'react';
import { Button } from '../../UI/Primitives';
import { WORLD_LORE } from '@ashtrail/core';

interface LoreIntroScreenProps {
  architectedContent?: string | null;
  onContinue: () => void;
}

export const LoreIntroScreen: React.FC<LoreIntroScreenProps> = ({ architectedContent, onContinue }) => {
  const [displayedText, setDisplayedText] = useState('');
  const baseLore = architectedContent || (WORLD_LORE.intro + "\n\n" + WORLD_LORE.mission);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(baseLore.slice(0, i));
      i++;
      if (i > baseLore.length) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, [baseLore]);

  return (
    <div className="relative h-screen w-full flex flex-col items-center justify-center bg-zinc-950 px-8">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-900/10 to-transparent" />
      </div>

      <div className="z-10 max-w-2xl w-full space-y-12">
        <div className="space-y-4">
          <div className="h-px w-12 bg-orange-600" />
          <h2 className="text-xs font-black mono text-orange-500 uppercase tracking-[0.5em]">Transmitting World Genesis...</h2>
        </div>

        <div className="min-h-[300px] max-h-[500px] overflow-y-auto pr-4">
          <p className="text-zinc-300 mono text-lg leading-relaxed whitespace-pre-wrap">
            {displayedText}
            <span className="animate-pulse inline-block w-2 h-5 bg-orange-500 ml-1" />
          </p>
        </div>

        <div className="flex justify-end pt-8">
          <Button variant="accent" size="lg" onClick={onContinue} className="animate-in fade-in slide-in-from-right-4 duration-1000 delay-1000">
            Acknowledge Directives
          </Button>
        </div>
      </div>
    </div>
  );
};
