// Pure run progression: shared by the game, previews and balance tests.
export const SKILLS = [
  ['rapid', '連射', 'Rapid fire', 10, null, 'rapid', false, '連射速度×1.6／射程×0.65', 'Fire rate ×1.6 / range ×0.65'],
  ['multi', '二連投', 'Double throw', 25, 'rapid', 'rapid', false, '同時発射数＋1', '+1 projectile'],
  ['barrage', '弾幕', 'Barrage', 50, 'multi', 'rapid', true, '連射速度×1.5', 'Fire rate ×1.5'],
  ['bounce', '跳弾', 'Ricochet', 10, null, 'bounce', false, '跳弾回数＋1', '+1 ricochet'],
  ['chain', '連鎖', 'Chain', 25, 'bounce', 'bounce', false, '跳弾回数＋1', '+1 ricochet'],
  ['shards', '破片連鎖', 'Shatter chain', 50, 'chain', 'bounce', true, '跳弾時に破片＋1', '+1 shard on ricochet'],
  ['heavy', '大岩', 'Boulder', 10, null, 'heavy', false, 'サイズ×1.4／押し出し＋15／弾速×0.65／持続×1.6', 'Size ×1.4 / knockback +15 / speed ×0.65 / lifetime ×1.6'],
  ['blast', '爆発', 'Explosion', 25, 'heavy', 'heavy', false, '着弾爆発：威力35%・半径66', 'Impact explosion: 35% damage / radius 66'],
  ['meteor', '隕石', 'Meteor', 50, 'blast', 'heavy', true, '爆発威力70%・半径100', 'Explosion: 70% damage / radius 100'],
  ['power', '威力強化', 'Power', 15, null, 'common', false, '威力＋25%', '+25% damage'],
  ['range', '射程強化', 'Reach', 15, null, 'common', false, '射程・持続＋30%', '+30% range and lifetime'],
  ['health', '体力強化', 'Vitality', 15, null, 'common', false, '最大HP＋12／現在HP＋12', '+12 maximum and current HP'],
].map(([id, ja, en, cost, requires, branch, final, detailJa, detailEn]) => ({id, ja, en, cost, requires, branch, final, detailJa, detailEn}));

// Prices belong to nodes: reaching a deeper floor never increases an existing price.
for(const n of SKILLS) { if(n.final)n.cost=110;else if(n.requires)n.cost=35; }
for(const branch of ['rapid','bounce','heavy']) {
  let previous={rapid:'barrage',bounce:'shards',heavy:'meteor'}[branch];
  for(let tier=4;tier<=7;tier++) {
    const id=branch+'_depth_'+tier;
    SKILLS.push({id,ja:'深層強化 '+(tier-3),en:'Depth mastery '+(tier-3),cost:Math.round(110*Math.pow(2.4,tier-3)),requires:previous,branch,final:false,detailJa:'石の威力×1.35（永続・他系統とも累積）',detailEn:'Stone damage ×1.35 (permanent, stacks across branches)'});
    previous=id;
  }
}

export function skillStatus(node, purchased, gold) {
  if (purchased[node.id]) return 'owned';

  if (node.requires && !purchased[node.requires]) return 'locked';
  return gold >= node.cost ? 'available' : 'costly';
}

export function buySkill(state, id) {
  const node = SKILLS.find(n => n.id === id);
  const purchased = state.treePurchases.weapon;
  if (!node || skillStatus(node, purchased, state.gold) !== 'available') return false;
  state.gold -= node.cost;
  purchased[id] = true;
  if(node.final)state.activeFinal=node.id;
  return true;
}

export function buildSkillStats(base, playerBase, owned, activeFinal=null) {
  const w = {...base, splitShardCount: 0, explosionRadius: 0, explosionDamage: 0};
  const p = {...playerBase};
  w.stoneVisual = {form:'normal', trail:'none', hitEffect:'normal'};
  w.stoneFlags = {};
  for (const branch of ['rapid','bounce','heavy']) {
    for(let tier=4;tier<=7;tier++) if(owned[branch+'_depth_'+tier]) w.damage*=1.35;
  }
  if (owned.power) w.damage *= 1.25;
  if (owned.range) { w.range *= 1.3; w.life *= 1.3; }
  if (owned.health) p.maxHp += 12;
  if (owned.rapid) { w.fireRate *= 1.6; w.range *= 0.65; }
  if (owned.multi) w.projectiles += 1;
  if (owned.barrage && activeFinal==='barrage') w.fireRate *= 1.5;
  if (owned.bounce) { w.ricochetCount += 1; w.stoneVisual.trail = 'yellow'; }
  if (owned.chain) w.ricochetCount += 1;
  if (owned.shards && activeFinal==='shards') w.splitShardCount = 1;
  if (owned.heavy) {
    w.radius *= 1.4; w.knockback += 15; w.bulletSpeed *= 0.65; w.life *= 1.6;
    w.stoneVisual.form = 'heavy'; w.bulletSprite = 'stoneHeavy';
  }
  if (owned.blast) { w.explosionRadius = 66; w.explosionDamage = w.damage * 0.35; }
  if (owned.meteor && activeFinal==='meteor') { w.explosionRadius = 100; w.explosionDamage = w.damage * 0.7; }
  w.fireRate = Math.min(5.5, w.fireRate);
  return {weapon:w, player:p};
}
