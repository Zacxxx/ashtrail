
import React from 'react';
import { GameState } from '../../types';
import { Card, ProgressBar, Badge, Stack } from '../../UI/Primitives';

export const CharacterSheet: React.FC<{ state: GameState }> = ({ state }) => {
  const { player } = state;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
      <Card title="Vitals & Neural Profile">
        <div className="flex gap-6 items-start mb-8">
          {player.portraitUrl ? (
            <img src={player.portraitUrl} alt="Portrait" className="w-32 h-32 border-2 border-zinc-800 grayscale rounded object-cover shadow-lg" />
          ) : (
            <div className="w-32 h-32 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-3xl opacity-50">👤</div>
          )}
          <div className="space-y-2 flex-1">
            <h2 className="text-2xl font-black italic mono uppercase text-white">{player.name}</h2>
            <div className="flex gap-2 flex-wrap">
              <Badge color="blue">Level {player.level}</Badge>
              <Badge color="zinc">{player.age} Years</Badge>
              <Badge color="zinc">{player.gender}</Badge>
            </div>
            <div className="text-[10px] mono text-zinc-500 mt-2">XP Progress: {player.xp}/1000</div>
            <ProgressBar value={player.xp} max={1000} color="bg-zinc-600" />
          </div>
        </div>

        <Stack gap={4}>
          <ProgressBar label="Integrity (Health)" value={player.hp} max={player.maxHp} color="bg-red-500" />
          
          <div className="grid grid-cols-2 gap-4 mt-6">
            {(Object.entries(player.stats) as [string, number][]).map(([stat, val]) => (
              <div key={stat} className="p-3 bg-zinc-900 border border-zinc-800 rounded-sm">
                <div className="flex justify-between text-[10px] uppercase text-zinc-500 mb-1">
                  <span>{stat}</span>
                  <span className="text-white font-black">{val}</span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                   <div className="h-full bg-orange-500" style={{ width: `${(val / 10) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Stack>

        <div className="mt-8">
           <label className="text-[10px] uppercase text-zinc-500 mono mb-3 block">Neural Traits</label>
           <div className="flex flex-wrap gap-2">
              {player.traits.map(t => (
                <div key={t.id} className="group relative">
                  <Badge color={t.type === 'positive' ? 'blue' : t.type === 'negative' ? 'red' : 'zinc'}>
                    {t.name}
                  </Badge>
                  <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-black border border-zinc-800 text-[8px] mono uppercase z-50 hidden group-hover:block pointer-events-none">
                    {t.description}
                  </div>
                </div>
              ))}
           </div>
        </div>
      </Card>

      <Stack gap={6}>
        <Card title="Background & Archives">
           <div className="max-h-48 overflow-y-auto custom-scrollbar">
              <p className="text-xs text-zinc-400 leading-relaxed italic border-l border-zinc-800 pl-4 whitespace-pre-wrap">
                "{player.history}"
              </p>
           </div>
        </Card>

        <Card title="Logistics & Gear">
          <div className="space-y-6">
             <div>
                <label className="text-[10px] uppercase text-zinc-500 mono mb-3 block">Personal Inventory</label>
                {player.inventory.length === 0 ? (
                  <div className="h-24 border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600 mono uppercase">
                    No equipment recorded
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                     {player.inventory.map(item => (
                       <div key={item.id} className="p-2 bg-zinc-900 border border-zinc-800 rounded-sm flex justify-between items-center">
                          <span className="text-xs text-zinc-300 mono">{item.name}</span>
                          <Badge>{item.type}</Badge>
                       </div>
                     ))}
                  </div>
                )}
             </div>

             <div>
                <label className="text-[10px] uppercase text-zinc-500 mono mb-3 block">Caravan Resources (Shared)</label>
                <div className="grid grid-cols-3 gap-2">
                   {Object.entries(state.resources).map(([res, val]) => (
                      <div key={res} className="p-2 bg-zinc-800/50 flex flex-col items-center text-[9px] mono">
                         <span className="text-zinc-500 uppercase">{res}</span>
                         <span className="text-white font-bold">{val}</span>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </Card>
      </Stack>
    </div>
  );
};
