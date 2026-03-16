import React, { useState, useEffect } from 'react';
import { Button, Card, Badge } from '@ashtrail/ui';

interface QuestIntroScreenProps {
  onContinue: () => void;
}

export const QuestIntroScreen: React.FC<QuestIntroScreenProps> = ({ onContinue }) => {
  const [displayedText, setDisplayedText] = useState('');
  const introText = "To tell a story, you must have a quest.\n\nEvery journey needs purpose. Every wanderer needs direction. In the wasteland, survival is not enough—you need a reason to push forward through the dust and ash.\n\nYour directive awaits.";

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(introText.slice(0, i));
      i++;
      if (i > introText.length) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-screen w-full flex items-center justify-center bg-zinc-950">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-900/10 to-transparent" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]" />
      </div>

      {/* Planet display - same as other steps */}
      <div className="absolute right-12 top-1/2 -translate-y-1/2 w-96 h-96 opacity-20 pointer-events-none">
        <div className="relative w-full h-full">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-600/30 via-zinc-800/50 to-zinc-950 blur-2xl animate-pulse" />
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-orange-500/20 via-zinc-700/30 to-zinc-900 shadow-[0_0_80px_rgba(249,115,22,0.3)]" />
        </div>
      </div>

      {/* Main content */}
      <div className="z-10 max-w-4xl w-full px-8 grid grid-cols-[1.2fr_0.8fr] gap-12 items-start">
        {/* Left: Intro text */}
        <div className="space-y-12">
          <div className="space-y-4">
            <div className="h-px w-12 bg-orange-600" />
            <h2 className="text-xs font-black mono text-orange-500 uppercase tracking-[0.5em]">Quest Directive</h2>
          </div>

          <div className="min-h-[200px]">
            <p className="text-zinc-300 mono text-lg leading-relaxed whitespace-pre-wrap">
              {displayedText}
              <span className="animate-pulse inline-block w-2 h-5 bg-orange-500 ml-1" />
            </p>
          </div>

          <div className="flex justify-start pt-8">
            <Button 
              variant="accent" 
              size="lg" 
              onClick={onContinue}
              className="animate-in fade-in slide-in-from-left-4 duration-1000 delay-1000"
            >
              Accept Directive
            </Button>
          </div>
        </div>

        {/* Right: Quest preview card */}
        <div className="animate-in fade-in slide-in-from-right-4 duration-1000 delay-500">
          <Card className="bg-zinc-900/60 backdrop-blur-md border-zinc-800/50">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge color="orange">Active</Badge>
                    <span className="text-[8px] text-zinc-600 uppercase mono tracking-wider">Priority Directive</span>
                  </div>
                  <h3 className="font-black mono uppercase text-white text-sm">Find the Coast</h3>
                </div>
              </div>

              <p className="text-xs text-zinc-400 mono leading-relaxed">
                Reach salt water to cleanse the lungs. The wasteland air grows thicker each day. Only the ocean winds can offer respite.
              </p>

              <div className="pt-3 border-t border-zinc-800/50 space-y-2">
                <div className="text-[9px] text-zinc-600 uppercase mono tracking-wider">Rewards</div>
                <div className="flex flex-wrap gap-2">
                  <Badge color="zinc">500 XP</Badge>
                  <Badge color="zinc">Coastal Access</Badge>
                </div>
              </div>

              <div className="pt-3 space-y-2">
                <div className="text-[9px] text-zinc-600 uppercase mono tracking-wider">Objectives</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 mono">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>Navigate through the dust plains</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 mono">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>Survive the journey west</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 mono">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>Reach the coastline</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
