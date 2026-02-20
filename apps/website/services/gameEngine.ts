
import { GameState, ResourceType, Resources, Node, CrewMember } from '../types';

export const consumeResources = (resources: Resources, crewCount: number): Resources => {
  const newResources = { ...resources };
  // Daily consumption per crew member
  newResources[ResourceType.FOOD] = Math.max(0, resources[ResourceType.FOOD] - crewCount * 1);
  newResources[ResourceType.WATER] = Math.max(0, resources[ResourceType.WATER] - crewCount * 1);
  return newResources;
};

export const calculateTravelCost = (from: Node, to: Node): Partial<Resources> => {
  // Simple calculation for fuel
  const distance = Math.abs(parseInt(from.id.split('-')[1]) - parseInt(to.id.split('-')[1])) || 2;
  return {
    [ResourceType.FUEL]: distance * 5
  };
};

export const updateCrewTension = (crew: CrewMember[], resources: Resources): CrewMember[] => {
  return crew.map(c => {
    let moraleDelta = 0;
    let trustDelta = 0;

    // Lack of basic resources hits morale and trust
    if (resources[ResourceType.FOOD] <= 0) moraleDelta -= 10;
    if (resources[ResourceType.WATER] <= 0) moraleDelta -= 15;
    
    // High morale builds trust, low morale increases Self-Preservation Index
    const spDelta = moraleDelta < 0 ? 5 : -1;

    return {
      ...c,
      morale: Math.min(100, Math.max(0, c.morale + moraleDelta)),
      trust: Math.min(100, Math.max(0, c.trust + trustDelta)),
      spIndex: Math.min(100, Math.max(0, c.spIndex + spDelta))
    };
  });
};

// Fix: Removed 'attachment' property which was not in the CrewMember type definition
export const generateInitialCrew = (): CrewMember[] => [
  { id: 'c1', name: 'Jaxon', role: 'driver', traits: ['Skilled', 'Paranoid'], morale: 80, trust: 70, spIndex: 20 },
  { id: 'c2', name: 'Miri', role: 'mechanic', traits: ['Efficient', 'Addicted'], morale: 65, trust: 60, spIndex: 30 },
  { id: 'c3', name: 'Kael', role: 'muscle', traits: ['Loyal', 'Traumatized'], morale: 75, trust: 85, spIndex: 10 },
];
