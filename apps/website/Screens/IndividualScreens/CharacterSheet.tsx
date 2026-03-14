import React from 'react';
import { GameState } from '@ashtrail/core';
import { Card, ProgressBar, Badge, Stack } from '@ashtrail/ui';

export const CharacterSheet: React.FC<{ state: GameState }> = ({ state }) => {
  const { player } = state;
  const occupations = player.resolvedProgression?.occupations?.length
    ? player.resolvedProgression.occupations
    : (player.occupations ?? []);
  const primaryOccupation = occupations.find((occupation) => occupation.isPrimary) ?? occupations[0];
  const [selectedOccupationId, setSelectedOccupationId] = React.useState(primaryOccupation?.occupationId ?? occupations[0]?.occupationId ?? '');

  React.useEffect(() => {
    setSelectedOccupationId(primaryOccupation?.occupationId ?? occupations[0]?.occupationId ?? '');
  }, [occupations, primaryOccupation?.occupationId]);

  const visibleOccupation = occupations.find((occupation) => occupation.occupationId === selectedOccupationId) ?? primaryOccupation;
  const xpMax = player.resolvedProgression?.nextLevelXp ?? Math.max(player.resolvedProgression?.xpIntoLevel ?? player.xp, 1);
  const xpValue = player.resolvedProgression?.xpIntoLevel ?? player.xp;
  const occupationOptions = occupations.map((occupation) => ({
    value: occupation.occupationId,
    label: `${occupation.occupation?.name || occupation.occupationId} Lv. ${occupation.level}`,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 h-full overflow-y-auto pr-2 custom-scrollbar md:grid-cols-2">
      <Card title="Vitals & Neural Profile">
        <div className="mb-8 flex items-start gap-6">
          {player.portraitUrl ? (
            <img src={player.portraitUrl} alt="Portrait" className="h-32 w-32 rounded border-2 border-zinc-800 object-cover grayscale shadow-lg" />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center border border-zinc-800 bg-zinc-900 text-3xl opacity-50">👤</div>
          )}
          <div className="flex-1 space-y-2">
            <h2 className="mono text-2xl font-black italic uppercase text-white">{player.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge color="blue">Level {player.level}</Badge>
              <Badge color="blue">Pioneer {player.resolvedProgression?.pioneerLevel ?? 0}</Badge>
              {visibleOccupation && (
                <Badge color="orange">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 flex-shrink-0" />
                    {visibleOccupation.occupation?.name || visibleOccupation.occupationId} Lv. {visibleOccupation.level}
                  </div>
                </Badge>
              )}
              <Badge color="zinc">{player.age} Years</Badge>
              <Badge color="zinc">{player.gender}</Badge>
            </div>
            {occupationOptions.length > 1 && (
              <select
                value={selectedOccupationId}
                onChange={(event) => setSelectedOccupationId(event.target.value)}
                className="mono mt-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-400"
              >
                {occupationOptions.map((occupation) => (
                  <option key={occupation.value} value={occupation.value}>{occupation.label}</option>
                ))}
              </select>
            )}
            <div className="mono mt-2 text-[10px] text-zinc-500">
              XP Progress: {player.resolvedProgression ? `${player.resolvedProgression.xpIntoLevel}/${player.resolvedProgression.nextLevelXp ?? 0}` : `${player.xp}/${xpMax}`}
            </div>
            <ProgressBar value={xpValue} max={xpMax} color="bg-zinc-600" />
            {player.resolvedProgression && (
              <div className="mono text-[9px] text-zinc-600">
                Total XP {player.resolvedProgression.totalXp.toLocaleString()} · Next level in {player.resolvedProgression.xpToNextLevel.toLocaleString()} · Available occupation points {player.resolvedProgression.availableTalentPoints}
              </div>
            )}
          </div>
        </div>

        <Stack gap={4}>
          <ProgressBar label="Integrity (Health)" value={player.hp} max={player.maxHp} color="bg-red-500" />

          <div className="mt-6 grid grid-cols-2 gap-4">
            {(Object.entries(player.stats) as [string, number][]).map(([stat, val]) => (
              <div key={stat} className="rounded-sm border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-1 flex justify-between text-[10px] uppercase text-zinc-500">
                  <span>{stat}</span>
                  <span className="font-black text-white">{val}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-orange-500" style={{ width: `${(val / 10) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Stack>

        <div className="mt-8">
          <label className="mono mb-3 block text-[10px] uppercase text-zinc-500">Neural Traits</label>
          <div className="flex flex-wrap gap-2">
            {player.traits.map((trait) => (
              <div key={trait.id} className="group relative">
                <Badge color={trait.type === 'positive' ? 'blue' : trait.type === 'negative' ? 'red' : 'zinc'}>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 flex-shrink-0" />
                    {trait.name}
                  </div>
                </Badge>
                <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-48 border border-zinc-800 bg-black p-2 text-[8px] uppercase mono group-hover:block">
                  {trait.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Stack gap={6}>
        <Card title="Background & Archives">
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            <p className="whitespace-pre-wrap border-l border-zinc-800 pl-4 text-xs italic leading-relaxed text-zinc-400">
              "{player.history}"
            </p>
          </div>
        </Card>

        <Card title="Logistics & Gear">
          <div className="space-y-6">
            <div>
              <label className="mono mb-3 block text-[10px] uppercase text-zinc-500">Personal Inventory</label>
              {player.inventory.length === 0 ? (
                <div className="flex h-24 items-center justify-center border border-dashed border-zinc-800 text-[10px] uppercase text-zinc-600 mono">
                  No equipment recorded
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {player.inventory.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-sm border border-zinc-800 bg-zinc-900 p-2">
                      <span className="mono text-xs text-zinc-300">{item.name}</span>
                      <Badge>{item.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mono mb-3 block text-[10px] uppercase text-zinc-500">Caravan Resources (Shared)</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(state.resources).map(([resource, value]) => (
                  <div key={resource} className="flex flex-col items-center bg-zinc-800/50 p-2 text-[9px] mono">
                    <span className="uppercase text-zinc-500">{resource}</span>
                    <span className="font-bold text-white">{value}</span>
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
