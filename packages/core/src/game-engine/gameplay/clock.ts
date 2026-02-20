
/**
 * ASH CARAVAN TEMPORAL ENGINE
 * Scaling: 1 Real Hour = 8 Game Hours
 * Full Cycle: 3 Real Hours = 24 Game Hours (1 Game Day)
 * Action Cost Modifier: 1/6th of real-world equivalent
 */

export const REAL_MS_PER_GAME_DAY = 3 * 60 * 60 * 1000; // 3 Hours
export const GAME_HOURS_PER_DAY = 24;

export interface ClockState {
  currentCycle: number;
  gameHour: number;
  msUntilNightfall: number;
  isNightfall: boolean;
}

export function calculateClockState(serverStartTime: number): ClockState {
  const now = Date.now();
  const elapsedMs = now - serverStartTime;
  
  const currentCycle = Math.floor(elapsedMs / REAL_MS_PER_GAME_DAY) + 1;
  const msIntoCycle = elapsedMs % REAL_MS_PER_GAME_DAY;
  
  // Game hour (0-23)
  const gameHour = Math.floor((msIntoCycle / REAL_MS_PER_GAME_DAY) * GAME_HOURS_PER_DAY);
  
  const msUntilNightfall = REAL_MS_PER_GAME_DAY - msIntoCycle;
  
  // Nightfall happens in the last 15 minutes of the 3h cycle (standard Hordes-style tension)
  const isNightfall = msIntoCycle > (REAL_MS_PER_GAME_DAY - (15 * 60 * 1000));

  return {
    currentCycle,
    gameHour,
    msUntilNightfall,
    isNightfall
  };
}

/**
 * Calculates how much "World Time" an action consumes.
 * If a task would take 6 hours in a standard RPG, it takes 1 game hour here.
 */
export function getActionTimeCost(baseHours: number): number {
  return baseHours / 6;
}
