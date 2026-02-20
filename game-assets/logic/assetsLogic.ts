
import { Player, Item } from '../../types';

export function useItem(player: Player, item: Item): Player {
  const newPlayer = { ...player, inventory: player.inventory.filter(i => i.id !== item.id) };
  
  if (item.type === 'consumable') {
    // Logic for healing or buffs
    if (item.name.toLowerCase().includes('med')) {
      newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp + 20);
    }
  }
  
  return newPlayer;
}

export function calculateCombatModifier(player: Player): number {
  let modifier = player.stats.strength;
  player.inventory.forEach(item => {
    if (item.type === 'weapon') modifier += 2;
  });
  return modifier;
}
