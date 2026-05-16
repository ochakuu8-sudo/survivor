export const STONE_ITEMS = [
  { key: "sharpEdge", name: "鋭い角", description: "ダメージ上昇", effect: "damage", value: 0.15 },
  { key: "quickThrow", name: "速投げ", description: "投石間隔短縮", effect: "fireRate", value: 0.08 },
  { key: "longThrow", name: "遠投フォーム", description: "射程上昇", effect: "range", value: 0.12 },
  { key: "strongArm", name: "強肩", description: "弾速上昇", effect: "bulletSpeed", value: 0.12 },
  { key: "bigStone", name: "大きな石", description: "石サイズ上昇", effect: "projectileSize", value: 0.1 },
  { key: "heavyStone", name: "重石", description: "ノックバック上昇", effect: "knockback", value: 8 },
  { key: "multiThrow", name: "多投石", description: "同時投石数上昇", effect: "projectileCount", value: 1, weight: 0.55 },
  { key: "bounceStone", name: "跳ね石", description: "跳弾回数上昇", effect: "ricochetCount", value: 1, weight: 0.55 },
  { key: "pierceStone", name: "貫き石", description: "貫通数上昇", effect: "pierceCount", value: 1, weight: 0.55 },
  { key: "explosiveStone", name: "爆ぜ石", description: "爆発ダメージ追加", effect: "explosionDamage", value: 0.35, weight: 0.55 },
  { key: "lavaStone", name: "溶岩石", description: "燃焼ダメージ追加", effect: "burnDamage", value: 0.2 },
  { key: "frostStone", name: "凍て石", description: "鈍足効果追加", effect: "slow", value: 0.12 },
  { key: "critStone", name: "会心石", description: "会心率上昇", effect: "critChance", value: 0.1 },
  { key: "sniperStone", name: "狙撃石", description: "強敵へのダメージ上昇", effect: "eliteBossDamage", value: 0.2 },
  { key: "gravityStone", name: "引力石", description: "命中時の吸引力上昇", effect: "pullStrength", value: 1, weight: 0.55 },
  { key: "lifeStone", name: "生命石", description: "最大HP上昇", effect: "maxHp", value: 10, weight: 0.7 },
  { key: "barrierStone", name: "守り石", description: "バリア数上昇", effect: "barrier", value: 1, weight: 0.7 },
  { key: "magnetPowder", name: "磁石粉", description: "回収範囲上昇", effect: "pickupRange", value: 35, weight: 0.7 },
  { key: "lightPowder", name: "軽石粉", description: "移動速度上昇", effect: "moveSpeed", value: 20, weight: 0.7 },
  { key: "drainStone", name: "吸命石", description: "撃破時回復量上昇", effect: "healOnKill", value: 1, weight: 0.55 },
];

export function findStoneItem(key) {
  return STONE_ITEMS.find((item) => item.key === key) || null;
}
