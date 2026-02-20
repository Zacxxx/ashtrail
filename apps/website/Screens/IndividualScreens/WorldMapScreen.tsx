
import React from 'react';
import { Node, GameState } from '../../types';
// Fix: Import MAP_NODES from mockData instead of deprecated constants file
import { MAP_NODES } from '../../mockData';
import { Card, Button, Badge } from '../../UI/Primitives';

interface WorldMapScreenProps {
  state: GameState;
  onNavigate: (node: Node) => void;
  onSetDestination: (node: Node) => void;
}

export const WorldMapScreen: React.FC<WorldMapScreenProps> = ({ state, onNavigate, onSetDestination }) => {
  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card title="Sector Topography" className="md:col-span-2 relative min-h-[500px] overflow-hidden bg-zinc-950">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/grid-me.png')` }} />
        
        <div className="relative z-10 grid grid-cols-3 gap-6 p-8">
          {MAP_NODES.map((node, i) => {
            const isCurrent = state.location.id === node.id;
            const isDest = state.destination?.id === node.id;
            
            return (
              <button 
                key={node.id}
                onClick={() => onSetDestination(node)}
                className={`relative group p-4 border rounded-sm transition-all text-left flex flex-col gap-2 ${
                  isCurrent ? 'bg-blue-600/20 border-blue-500' : 
                  isDest ? 'bg-orange-600/20 border-orange-500 animate-pulse' : 
                  'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {isCurrent && <div className="absolute -top-2 -right-2 bg-blue-500 text-[8px] px-1 rounded-full font-bold text-white uppercase">Current</div>}
                <div className="text-[10px] mono text-zinc-500 uppercase">{node.type}</div>
                <div className={`font-black italic mono uppercase ${isCurrent ? 'text-blue-400' : 'text-white'}`}>{node.name}</div>
                <div className="flex gap-1 mt-auto">
                   <div className={`h-1 flex-1 rounded-full ${node.danger > 5 ? 'bg-red-900' : 'bg-green-900'}`} />
                   <div className={`h-1 flex-1 rounded-full ${node.danger > 8 ? 'bg-red-900' : 'bg-zinc-800'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Navigation Computer">
          {state.destination ? (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-sm">
                <h4 className="text-white font-bold mono uppercase mb-1">{state.destination.name}</h4>
                <p className="text-[10px] text-zinc-500 leading-relaxed mb-3">
                  Estimated travel time: 4 hours. High density of {state.destination.faction} activity reported in the area.
                </p>
                <div className="flex gap-2">
                   <Badge color="zinc">Danger: {state.destination.danger}/10</Badge>
                   <Badge color="zinc">{state.destination.type}</Badge>
                </div>
              </div>
              <Button 
                variant="accent" 
                className="w-full" 
                onClick={() => onNavigate(state.destination!)}
                disabled={state.destination.id === state.location.id}
              >
                Initiate Travel sequence
              </Button>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-center">
               <p className="text-[10px] mono text-zinc-600 uppercase">Select coordinates on the map to calculate route</p>
            </div>
          )}
        </Card>

        <Card title="Sector Intel">
           <div className="space-y-3">
             <div className="flex justify-between items-center text-[10px] mono">
                <span className="text-zinc-500">CONTROL</span>
                <span className="text-white">{state.location.faction}</span>
             </div>
             <div className="flex justify-between items-center text-[10px] mono">
                <span className="text-zinc-500">LOCAL SCARCITY</span>
                <span className="text-red-400">{state.location.scarcity.join(', ')}</span>
             </div>
           </div>
        </Card>
      </div>
    </div>
  );
};
