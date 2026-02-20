
import React from 'react';
import { GameState } from '../../types';
import { Card, Badge } from '../../UI/Primitives';

export const QuestLog: React.FC<{ state: GameState }> = ({ state }) => {
  return (
    <div className="h-full max-w-4xl mx-auto space-y-4">
       <Card title="Active Directives">
          {state.quests.filter(q => q.status === 'active').length === 0 ? (
            <p className="text-center py-8 text-xs text-zinc-600 mono">No active assignments recorded.</p>
          ) : (
            <div className="space-y-3">
               {state.quests.filter(q => q.status === 'active').map(q => (
                 <div key={q.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-sm">
                    <div className="flex justify-between items-start mb-2">
                       <h4 className="font-bold text-white mono uppercase">{q.title}</h4>
                       <Badge color="orange">Priority</Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mb-3">{q.description}</p>
                    <div className="flex gap-2">
                       {q.rewards.map(r => <Badge key={r} color="zinc">Reward: {r}</Badge>)}
                    </div>
                 </div>
               ))}
            </div>
          )}
       </Card>

       <Card title="Archive (Completed)">
          <div className="opacity-40 grayscale space-y-2">
             <div className="p-3 bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                <span className="text-[10px] mono text-zinc-500">RESTORE WATER SYSTEM AT OUTPOST 7</span>
                <Badge color="green">SUCCESS</Badge>
             </div>
          </div>
       </Card>
    </div>
  );
};
