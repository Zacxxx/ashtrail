import { INITIAL_CREW, calculateTravelCost, consumeResources, updateCrewTension } from '@ashtrail/core';

export { calculateTravelCost, consumeResources, updateCrewTension };

export function generateInitialCrew() {
  return INITIAL_CREW.map((member) => ({ ...member, traits: [...member.traits] }));
}
