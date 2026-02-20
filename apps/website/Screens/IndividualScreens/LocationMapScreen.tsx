
import React from 'react';
import { GameState } from '../../types';
import { Card, Badge, Button } from '../../UI/Primitives';
import { MOCK_NEARBY_PLAYERS, MOCK_ACTIVITY_FEED } from '../../mockData';

interface LocationMapScreenProps {
  state: GameState;
  onSelectPOI: (poiName: string) => void;
}

export const LocationMapScreen: React.FC<LocationMapScreenProps> = ({ state, onSelectPOI }) => {
  const { location } = state;

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Left: Location Details & POIs */}
      <div className="md:col-span-3 flex flex-col gap-6">
        <Card title={`Local Area: ${location.name}`} className="flex-1 relative overflow-hidden bg-zinc-950">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/carbon-fibre.png')` }} />
          
          <div className="relative z-10 p-8 space-y-8">
            <div className="max-w-xl">
              <h2 className="text-3xl font-black italic mono uppercase text-white mb-2">{location.name}</h2>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">{location.description}</p>
              <div className="flex gap-2">
                <Badge color="blue">{location.faction}</Badge>
                <Badge color="zinc">{location.type}</Badge>
                <Badge color={location.danger > 5 ? 'red' : 'green'}>Danger: {location.danger}/10</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <h3 className="col-span-full text-[10px] mono uppercase text-zinc-500 tracking-[0.3em] mb-2">Points of Interest</h3>
              {location.pois?.map(poi => (
                <button 
                  key={poi.id}
                  onClick={() => onSelectPOI(poi.name)}
                  className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-sm text-left hover:border-orange-500 group transition-all"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-xs text-white mono uppercase group-hover:text-orange-400">{poi.name}</span>
                    <Badge color="zinc">{poi.type}</Badge>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">{poi.description}</p>
                </button>
              )) || <p className="text-xs text-zinc-600 italic">No detailed POIs identified in this sector.</p>}
            </div>
          </div>
        </Card>
      </div>

      {/* Right: Multiplayer Simulation */}
      <div className="flex flex-col gap-6">
        <Card title="Nearby Wastelanders" className="flex-1">
          <div className="space-y-3">
            {MOCK_NEARBY_PLAYERS.map((p, i) => (
              <div key={i} className="flex flex-col border-b border-zinc-800/50 pb-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-300 mono">{p.name}</span>
                  <span className="text-[9px] text-zinc-500">LVL {p.level}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[9px] uppercase tracking-tighter text-orange-600">{p.status}</span>
                  <button className="text-[8px] mono uppercase text-blue-500 hover:text-blue-400">Trade</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="System Broadcasts" className="h-48">
          <div className="space-y-2 overflow-y-auto h-full pr-1">
            {MOCK_ACTIVITY_FEED.map((msg, i) => (
              <div key={i} className="text-[9px] mono text-zinc-500 leading-tight border-l border-zinc-800 pl-2 py-1">
                {msg}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
