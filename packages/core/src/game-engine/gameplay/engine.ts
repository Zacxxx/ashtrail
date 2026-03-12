
import { resolveCharacterEffects, resolveCrewMemberTraits, resolveMetricScalar } from '../effects';
import { Character, ResourceType, Resources, Node, CrewMember } from '../../types';

export const consumeResources = (resources: Resources, crewCount: number, character?: Character): Resources => {
  const newResources = { ...resources };
  const resolved = character
    ? resolveCharacterEffects(character, { scope: 'camp', locationKind: 'settlement', resources })
    : null;
  const consumptionScalar = resolved ? resolveMetricScalar(resolved, 'resourceConsumption', 1) : 1;
  // Daily consumption per crew member
  newResources[ResourceType.FOOD] = Math.max(0, resources[ResourceType.FOOD] - Math.ceil(crewCount * consumptionScalar));
  newResources[ResourceType.WATER] = Math.max(0, resources[ResourceType.WATER] - Math.ceil(crewCount * consumptionScalar));
  return newResources;
};

export const calculateTravelCost = (from: Node, to: Node, character?: Character): Partial<Resources> => {
  // Simple calculation for fuel based on distance approximation
  const distance = Math.abs(parseInt(from.id.split('-')[1]) - parseInt(to.id.split('-')[1])) || 2;
  const resolved = character
    ? resolveCharacterEffects(character, { scope: 'travel', locationKind: 'road' })
    : null;
  const fuelScalar = resolved ? resolveMetricScalar(resolved, 'travelFuelCost', 1) : 1;
  return {
    [ResourceType.FUEL]: Math.max(1, Math.round((distance * 5) * fuelScalar))
  };
};

export const updateCrewTension = (crew: CrewMember[], resources: Resources): CrewMember[] => {
  return crew.map(c => {
    let moraleDelta = 0;
    let trustDelta = resources[ResourceType.FOOD] > 0 && resources[ResourceType.WATER] > 0 ? 1 : -1;

    // Lack of basic resources hits morale and trust hard
    if (resources[ResourceType.FOOD] <= 0) moraleDelta -= 10;
    if (resources[ResourceType.WATER] <= 0) moraleDelta -= 15;
    if (resources[ResourceType.MEDS] <= 0) moraleDelta -= 3;

    const resolved = resolveCharacterEffects(
      { traits: resolveCrewMemberTraits(c.traits) },
      {
        scope: 'camp',
        locationKind: 'settlement',
        resources,
        currentHpPct: 100,
        isAlone: false,
      },
    );

    moraleDelta = Math.round(resolveMetricScalar(resolved, 'moraleLoss', 1) * moraleDelta);
    if (moraleDelta >= 0) {
      moraleDelta = Math.round(resolveMetricScalar(resolved, 'moraleRecovery', 1) * moraleDelta);
    }
    trustDelta = Math.round(resolveMetricScalar(resolved, 'trustGain', 1) * trustDelta);
    if (trustDelta < 0) {
      trustDelta = Math.round(resolveMetricScalar(resolved, 'trustDecay', 1) * trustDelta);
    }

    const moraleFloor = Math.round(resolveMetricScalar(resolved, 'moraleFloor', 0));
    const conflictPenalty = Math.round(resolveMetricScalar(resolved, 'conflictChance', 0) - 1);

    // Low morale increases Self-Preservation (Betrayal Index)
    const spDelta = moraleDelta < 0 ? 5 + Math.max(0, conflictPenalty) : -1;

    return {
      ...c,
      morale: Math.min(100, Math.max(moraleFloor, c.morale + moraleDelta)),
      trust: Math.min(100, Math.max(0, c.trust + trustDelta)),
      spIndex: Math.min(100, Math.max(0, c.spIndex + spDelta))
    };
  });
};
