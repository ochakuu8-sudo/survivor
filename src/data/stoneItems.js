export const STONE_MATERIALS = [
  {
    key: "powerMaterial",
    name: "威力の素材",
    shortName: "威力",
    description: "石ころのダメージを目に見えて大きく上げる基礎素材。爆発・会心・強敵特効の材料になる。",
    category: "material",
    tags: ["material", "damage", "explosion", "critical", "elite"],
    statBonus: { damage: 0.14 },
    behavior: null,
    uses: ["貫き石", "爆ぜ石", "会心石", "重石", "吸命石", "狙撃石", "引力石"],
    weight: 1,
  },
  {
    key: "frequencyMaterial",
    name: "攻撃頻度の素材",
    shortName: "攻撃頻度",
    description: "投石間隔を目に見えて大きく短くする基礎素材。多投・導火・衛星・加速の材料になる。",
    category: "material",
    tags: ["material", "fireRate", "multi", "trail", "orbit"],
    statBonus: { fireRate: 0.12 },
    behavior: null,
    uses: ["導火石", "衛星石", "会心石", "多投石", "加速石"],
    weight: 1,
  },
  {
    key: "durationMaterial",
    name: "持続時間の素材",
    shortName: "持続時間",
    description: "石の寿命と届く距離を目に見えて大きく伸ばす基礎素材。設置・帰還・衛星・反響の材料になる。",
    category: "material",
    tags: ["material", "duration", "range", "deploy", "return"],
    statBonus: { life: 0.14, range: 0.1 },
    behavior: null,
    uses: ["跳ね石", "帰還石", "転がり石", "置き石", "凍て石", "導火石", "衛星石", "反響石"],
    weight: 1,
  },
  {
    key: "speedMaterial",
    name: "弾速の素材",
    shortName: "弾速",
    description: "石ころの弾速を目に見えて大きく上げる基礎素材。貫通・跳弾・帰還・加速の材料になる。",
    category: "material",
    tags: ["material", "speed", "pierce", "bounce", "return"],
    statBonus: { bulletSpeed: 0.14 },
    behavior: null,
    uses: ["跳ね石", "貫き石", "帰還石", "加速石", "反響石", "狙撃石"],
    weight: 1,
  },
  {
    key: "sizeMaterial",
    name: "サイズの素材",
    shortName: "サイズ",
    description: "石サイズと押し返しを目に見えて大きく上げる基礎素材。重さ・爆発範囲・転がりの材料になる。",
    category: "material",
    tags: ["material", "size", "knockback", "area", "rolling"],
    statBonus: { radius: 0.12, knockbackFlat: 8 },
    behavior: null,
    uses: ["爆ぜ石", "転がり石", "置き石", "引力石", "多投石", "重石", "反響石"],
    weight: 1,
  },
  {
    key: "hpMaterial",
    name: "HPの素材",
    shortName: "HP",
    description: "最大HPを目に見えて大きく上げる基礎素材。守り・回復・凍結・衛星の材料になる。",
    category: "material",
    tags: ["material", "hp", "defense", "heal", "guard"],
    statBonus: { maxHpFlat: 12 },
    behavior: null,
    uses: ["帰還石", "置き石", "凍て石", "衛星石", "吸命石", "守り石"],
    weight: 1,
  },
];

export const STONE_SPECIAL_ITEMS = [
  { key: "bounceStone", name: "跳ね石", description: "性質変化: 敵へ跳弾する。ステータス: 弾速・弾寿命大上昇。", category: "special", tags: ["ricochet", "targeting"], recipe: ["speedMaterial", "durationMaterial"], statBonus: { bulletSpeed: 0.2, life: 0.2 }, behavior: { effect: "ricochetCount", value: 1 }, weight: 0.06 },
  { key: "piercingStone", name: "貫き石", description: "性質変化: 一直線に敵列を貫通する。ステータス: ダメージ・弾速大上昇。", category: "special", tags: ["pierce", "line", "damage"], recipe: ["powerMaterial", "speedMaterial"], statBonus: { damage: 0.2, bulletSpeed: 0.2 }, behavior: { effect: "pierce", value: 1 }, weight: 0.04 },
  { key: "explosiveStone", name: "爆ぜ石", description: "性質変化: 命中時または消滅時に爆発する。ステータス: ダメージ・爆発範囲大上昇。", category: "special", tags: ["explosion", "area"], recipe: ["powerMaterial", "sizeMaterial"], statBonus: { damage: 0.2, explosionRadius: 18 }, behavior: { effect: "explosionDamage", value: 0.35 }, weight: 0.05 },
  { key: "returningStone", name: "帰還石", description: "性質変化: 最大距離付近で戻り、戻り道でも敵に当たる。ステータス: 弾速・弾寿命大上昇。", category: "special", tags: ["return", "boomerang", "pierce"], recipe: ["speedMaterial", "durationMaterial", "hpMaterial"], statBonus: { bulletSpeed: 0.2, life: 0.22 }, behavior: { effect: "returning", value: 1 }, weight: 0.03 },
  { key: "rollingStone", name: "転がり石", description: "性質変化: 低速で場に残って多段ヒットし、敵を押す。ステータス: サイズ・ノックバック大上昇。", category: "special", tags: ["rolling", "multiHit", "knockback"], recipe: ["sizeMaterial", "durationMaterial"], statBonus: { radius: 0.2, knockbackFlat: 18 }, behavior: { effect: "rolling", value: 1 }, weight: 0.03 },
  { key: "placedStone", name: "置き石", description: "性質変化: 着弾地点に短時間残り、触れた敵へダメージ。ステータス: サイズ・持続時間大上昇。", category: "special", tags: ["trap", "lane", "defense"], recipe: ["sizeMaterial", "hpMaterial", "durationMaterial"], statBonus: { radius: 0.2, life: 0.2 }, behavior: { effect: "deployHazard", value: 1 }, weight: 0.03 },
  { key: "gravityStone", name: "引力石", description: "性質変化: 命中地点に敵を軽く吸い寄せる。ステータス: ダメージ・効果範囲大上昇。", category: "special", tags: ["pull", "area", "control"], recipe: ["sizeMaterial", "durationMaterial", "powerMaterial"], statBonus: { damage: 0.2, radius: 0.2 }, behavior: { effect: "pullStrength", value: 1 }, weight: 0.03 },
  { key: "frostStone", name: "凍て石", description: "性質変化: 命中した敵や周囲を鈍足にする。ステータス: 持続時間・最大HP大上昇。", category: "special", tags: ["ice", "slow", "defense"], recipe: ["durationMaterial", "hpMaterial"], statBonus: { life: 0.2, maxHpFlat: 18 }, behavior: { effect: "slow", value: 0.12 }, weight: 0.04 },
  { key: "fuseStone", name: "導火石", description: "性質変化: 石の軌跡に短時間ダメージラインを残す。ステータス: 攻撃頻度・持続時間大上昇。", category: "special", tags: ["trail", "line", "corridor"], recipe: ["frequencyMaterial", "durationMaterial"], statBonus: { fireRate: 0.18, life: 0.2 }, behavior: { effect: "damageTrail", value: 1 }, weight: 0.03 },
  { key: "satelliteStone", name: "衛星石", description: "性質変化: 石が一定時間プレイヤー周囲を回転して守る。ステータス: 攻撃頻度・最大HP大上昇。", category: "special", tags: ["orbit", "guard", "hp"], recipe: ["frequencyMaterial", "durationMaterial", "hpMaterial"], statBonus: { fireRate: 0.18, maxHpFlat: 18 }, behavior: { effect: "satellite", value: 1 }, weight: 0.025 },
  { key: "critStone", name: "会心石", description: "性質変化: 命中時に確率で会心ダメージ。ステータス: ダメージ・攻撃頻度大上昇。", category: "special", tags: ["critical", "damage"], recipe: ["powerMaterial", "frequencyMaterial"], statBonus: { damage: 0.2, fireRate: 0.18 }, behavior: { effect: "critChance", value: 0.1 }, weight: 0.04 },
  { key: "multiThrow", name: "多投石", description: "性質変化: 同時投石数を増やす。ステータス: 攻撃頻度・サイズ大上昇。", category: "special", tags: ["multi", "projectileCount"], recipe: ["frequencyMaterial", "sizeMaterial"], statBonus: { fireRate: 0.18, radius: 0.2 }, behavior: { effect: "projectileCount", value: 1 }, weight: 0.04 },
  { key: "heavyStone", name: "重石", description: "性質変化: 強いノックバックと重いヒット感。ステータス: サイズ・ノックバック・ダメージ大上昇。", category: "special", tags: ["knockback", "heavy", "damage"], recipe: ["sizeMaterial", "powerMaterial"], statBonus: { radius: 0.2, knockbackFlat: 22, damage: 0.18 }, behavior: { effect: "heavyHit", value: 1 }, weight: 0.04 },
  { key: "drainStone", name: "吸命石", description: "性質変化: この石で敵を倒すとHPを回復する。ステータス: 最大HP・ダメージ大上昇。", category: "special", tags: ["heal", "kill", "hp"], recipe: ["hpMaterial", "powerMaterial"], statBonus: { maxHpFlat: 18, damage: 0.18 }, behavior: { effect: "healOnKill", value: 1 }, weight: 0.04 },
  { key: "acceleratingStone", name: "加速石", description: "性質変化: 飛行時間が長いほど速度と威力が上がる。ステータス: 弾速・攻撃頻度大上昇。", category: "special", tags: ["speed", "growth", "damage"], recipe: ["speedMaterial", "frequencyMaterial"], statBonus: { bulletSpeed: 0.2, fireRate: 0.18 }, behavior: { effect: "flightGrowth", value: 1 }, weight: 0.03 },
  { key: "echoStone", name: "反響石", description: "性質変化: 壁や障害物で反射する。ステータス: 弾速・持続時間大上昇。", category: "special", tags: ["wall", "bounce", "dungeon"], recipe: ["speedMaterial", "sizeMaterial", "durationMaterial"], statBonus: { bulletSpeed: 0.2, life: 0.2 }, behavior: { effect: "wallBounce", value: 1 }, weight: 0.03 },
  { key: "sniperStone", name: "狙撃石", description: "性質変化: elite / boss に強い精密ヒット。ステータス: ダメージ・弾速大上昇。", category: "special", tags: ["elite", "boss", "damage"], recipe: ["powerMaterial", "speedMaterial", "powerMaterial"], statBonus: { damage: 0.24, bulletSpeed: 0.2 }, behavior: { effect: "eliteBossDamage", value: 0.2 }, weight: 0.025 },
  { key: "shatterStone", name: "砕け石", description: "性質変化: 命中時に小さな破片を複数方向へ飛ばす。ステータス: ダメージ・攻撃頻度大上昇。", category: "special", tags: ["shard", "multi", "critical"], recipe: ["powerMaterial", "frequencyMaterial", "sizeMaterial"], statBonus: { damage: 0.18, fireRate: 0.18 }, behavior: { effect: "hitShards", value: 3 }, weight: 0.03 },
  { key: "stuckStone", name: "刺さり石", description: "性質変化: 命中した敵へ数秒後に追加ダメージ。ステータス: ダメージ・弾寿命大上昇。", category: "special", tags: ["delayed", "elite", "boss"], recipe: ["powerMaterial", "durationMaterial", "speedMaterial"], statBonus: { damage: 0.18, life: 0.2 }, behavior: { effect: "delayedDamage", value: 1 }, weight: 0.025 },
  { key: "lavaStone", name: "溶岩石", description: "性質変化: 命中後に燃焼ダメージを与える。ステータス: ダメージ・持続時間大上昇。", category: "special", tags: ["fire", "dot", "trail"], recipe: ["powerMaterial", "durationMaterial", "frequencyMaterial"], statBonus: { damage: 0.18, life: 0.2 }, behavior: { effect: "burnDamage", value: 0.2 }, weight: 0.025 },
  { key: "barrierStone", name: "守り石", description: "性質変化: 石ころ装備でバリアを増やし守りを固める。ステータス: 最大HP大上昇。", category: "special", tags: ["guard", "barrier", "hp"], recipe: ["hpMaterial", "hpMaterial", "sizeMaterial"], statBonus: { maxHpFlat: 24 }, behavior: { effect: "barrier", value: 1 }, weight: 0.025 },
];

export const STONE_ITEMS = [...STONE_MATERIALS, ...STONE_SPECIAL_ITEMS];

export function findStoneItem(key) {
  return STONE_ITEMS.find((item) => item.key === key) || null;
}

export function findStoneMaterial(key) {
  return STONE_MATERIALS.find((item) => item.key === key) || null;
}

export function findStoneSpecialItem(key) {
  return STONE_SPECIAL_ITEMS.find((item) => item.key === key) || null;
}
