
import React from 'react';
import { GameState } from '@ashtrail/core';
import { Card, ProgressBar, Button, Badge } from '../../UI/Primitives';

interface CombatScreenProps {
  state: GameState;
  onAttack: () => void;
  onFlee: () => void;
}

export const CombatScreen: React.FC<CombatScreenProps> = ({ state, onAttack, onFlee }) => {
  const { combat, player } = state;
  if (!combat) return null;

  return (
    <div className="flex flex-col h-full gap-8 items-center justify-center p-8 animate-in zoom-in duration-300">
      <div className="w-full max-w-4xl flex gap-8 items-center justify-between">
        {/* Player Side */}
        <div className="flex-1 space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black italic text-white mono uppercase">{player.name}</h3>
            {/* Fix: Replaced player.role with player.level as role does not exist on Player type */}
            <Badge color="blue">Level {player.level}</Badge>
          </div>
          <Card className="border-blue-900/50 bg-blue-950/10">
            <ProgressBar label="Integrity (HP)" value={player.hp} max={player.maxHp} color="bg-blue-500" />
          </Card>
        </div>

        <div className="text-4xl font-black text-zinc-800 italic mono">VS</div>

        {/* Enemy Side */}
        <div className="flex-1 space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black italic text-red-500 mono uppercase">{combat.enemyName}</h3>
            <Badge color="red">Hostile</Badge>
          </div>
          <Card className="border-red-900/50 bg-red-950/10">
            <ProgressBar label="Enemy Strength" value={combat.enemyHp} max={combat.enemyMaxHp} color="bg-red-500" />
          </Card>
        </div>
      </div>

      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 p-4 rounded-sm h-48 overflow-y-auto space-y-2 shadow-inner">
        {combat.log.map((entry, i) => (
          <div key={i} className="text-xs mono text-zinc-400 border-l border-zinc-800 pl-2">
            {entry}
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <Button size="lg" variant="danger" onClick={onAttack}>Brutal Attack</Button>
        <Button size="lg" variant="secondary" onClick={onFlee}>Tactical Retreat</Button>
      </div>
    </div>
  );
};
