// Time records performance; only defeating a boss raises difficulty.
export const DIFFICULTIES = [
  { kills: 30, hp: 1, damage: .55, speed: 1, interval: 2.6, batch: 3, cap: 65, bossHp: 180, bossReward: 45, bossName: ['草原の巨人', 'Meadow Brute'] },
  { kills: 45, hp: 1.6, damage: .65, speed: 1.08, interval: 2.4, batch: 5, cap: 90, bossHp: 360, bossReward: 60, bossName: ['疾走の巨人', 'Charging Brute'] },
  { kills: 65, hp: 2.5, damage: .75, speed: 1.16, interval: 2.2, batch: 7, cap: 120, bossHp: 650, bossReward: 80, bossName: ['弾雨の巨人', 'Volley Brute'] },
  { kills: 90, hp: 3.8, damage: .85, speed: 1.24, interval: 2, batch: 10, cap: 155, bossHp: 1050, bossReward: 105, bossName: ['荒野の巨人', 'Wildland Brute'] },
  { kills: 120, hp: 5.5, damage: 1, speed: 1.32, interval: 1.8, batch: 13, cap: 190, bossHp: 1650, bossReward: 150, bossName: ['平原の覇者', 'Lord of the Plains'] },
];
export function difficulty(tier = 1) {
  return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, Math.floor(tier) - 1))];
}
