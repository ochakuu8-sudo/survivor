import { game } from "./state.js";
import { hud } from "./dom.js";
import { MAX_WEAPONS, getWeaponMaxAttachments, getWeaponMaxLevel } from "./constants.js";
import { clampActiveWeaponIndex, createWeapon, setActiveWeaponIndex, weaponAmmoLabel, weaponMetaLabel } from "./weapons.js";
import {
  addAttachmentToWeapon,
  attachmentRarityChanceText,
  attachmentCategoryLabel,
  canAttachToWeapon,
  findAttachmentDefinition,
  pickAttachmentChoicesForWeapon,
  recomputeAllAttachments,
  starsLabel,
} from "./attachments.js";
import { updateHud } from "./hud.js";

export const WEAPON_POOL = [
  {
    name: "石ころ",
    rarity: "normal",
    text: "威力が少し高い、扱いやすい投げ石。",
    weapon: {
      baseName: "石",
      rarity: "normal",
      variantSummary: "弾薬6。威力が少し高い",
      damage: 42,
      fireRate: 0.9,
      ammoCapacity: 6,
      reloadTime: 1.35,
      bulletSpeed: 360,
      life: 1.15,
      radius: 12,
      kick: 1.9,
      bulletGlow: "glowAmber",
      bulletSprite: "stoneReadable",
    },
  },
  {
    name: "軽石",
    rarity: "rare",
    text: "弾速はとても遅いが、軽くて連射しやすい石。",
    weapon: {
      baseName: "石",
      rarity: "rare",
      variantSummary: "弾薬15。弾速がとても遅いが攻撃頻度が高い",
      damage: 23,
      fireRate: 3.3,
      ammoCapacity: 15,
      reloadTime: 1.25,
      bulletSpeed: 165,
      life: 1.55,
      range: 255,
      radius: 11,
      kick: 1.1,
      bulletGlow: "glowAmber",
      bulletSprite: "stoneReadable",
    },
  },
  {
    name: "パチンコ玉",
    rarity: "rare",
    text: "小さい弾だが、急所に当たりやすい金属球。",
    weapon: {
      baseName: "石",
      rarity: "rare",
      variantSummary: "弾薬10。サイズが小さいがクリティカル率+50%",
      damage: 28,
      fireRate: 1.45,
      ammoCapacity: 10,
      reloadTime: 1.25,
      bulletSpeed: 620,
      life: 0.62,
      range: 360,
      radius: 6,
      critChance: 0.5,
      critMultiplier: 2,
      kick: 1.2,
      bulletTint: [0.86, 0.9, 0.96],
      bulletGlow: "glowCyan",
    },
  },
  {
    name: "ゴムボール",
    rarity: "legend",
    text: "跳ねるたびに弾が増える、伝説の弾むボール。",
    weapon: {
      baseName: "石",
      rarity: "legend",
      variantSummary: "弾薬8。跳弾+1。跳弾するたびに弾が2個に増える",
      damage: 32,
      fireRate: 1.15,
      ammoCapacity: 8,
      reloadTime: 1.45,
      bulletSpeed: 520,
      life: 0.95,
      range: 430,
      radius: 11,
      ricochetCount: 1,
      ricochetSplitCount: 2,
      kick: 1.6,
      bulletTint: [1, 0.92, 0.42],
      bulletGlow: "glowAmber",
    },
  },
  {
    name: "豆鉄砲",
    rarity: "normal",
    text: "攻撃速度が早い、短射程のマシンガン。",
    weapon: {
      baseName: "豆鉄砲",
      rarity: "normal",
      variantSummary: "弾薬30。攻撃速度が早い",
      damage: 5,
      fireRate: 8.4,
      ammoCapacity: 30,
      reloadTime: 1.35,
      bulletSpeed: 620,
      life: 0.34,
      range: 220,
      radius: 7,
      jitter: 0.2,
      kick: 0.8,
      bulletTint: [1, 0.92, 0.55],
      bulletGlow: "glowAmber",
    },
  },
  {
    name: "SMG",
    rarity: "rare",
    text: "弾が大きくばらけるが、弾薬が多い連射武器。",
    weapon: {
      baseName: "豆鉄砲",
      rarity: "rare",
      variantSummary: "弾薬60。90度にばらけやすいが弾薬が多い",
      damage: 3.8,
      fireRate: 10.8,
      ammoCapacity: 60,
      reloadTime: 1.75,
      bulletSpeed: 650,
      life: 0.34,
      range: 220,
      radius: 6,
      jitter: 1.57,
      kick: 0.65,
      bulletTint: [1, 0.9, 0.48],
      bulletGlow: "glowAmber",
    },
  },
  {
    name: "鋼鉄弾",
    rarity: "rare",
    text: "射程と命中精度が高く、敵を貫通する硬い弾。",
    weapon: {
      baseName: "豆鉄砲",
      rarity: "rare",
      variantSummary: "弾薬24。射程と命中精度が高い。貫通+1",
      damage: 6.2,
      fireRate: 6.2,
      ammoCapacity: 24,
      reloadTime: 1.45,
      bulletSpeed: 780,
      life: 0.5,
      range: 390,
      radius: 6,
      jitter: 0.02,
      pierce: 1,
      kick: 0.9,
      bulletTint: [0.84, 0.9, 0.98],
      bulletGlow: "glowCyan",
    },
  },
  {
    name: "流星群",
    rarity: "legend",
    text: "着弾時に小さな爆発を起こす連射弾。",
    weapon: {
      baseName: "豆鉄砲",
      rarity: "legend",
      variantSummary: "弾薬30。着弾時爆発",
      damage: 6.5,
      fireRate: 5.4,
      ammoCapacity: 30,
      reloadTime: 1.7,
      bulletSpeed: 560,
      life: 0.55,
      range: 300,
      radius: 7,
      explosionRadius: 46,
      explosionDamage: 10,
      kick: 1.15,
      bulletTint: [1, 0.65, 0.32],
      bulletGlow: "glowRed",
      effectTint: [1, 0.46, 0.16],
      effectGlow: "glowRed",
    },
  },
  {
    name: "火炎放射器",
    rarity: "normal",
    text: "前方に炎を吹きつける標準的な火炎放射器。",
    weapon: {
      baseName: "火炎放射器",
      rarity: "normal",
      variantSummary: "燃料8秒。標準性能",
      kind: "flame",
      fuelMode: true,
      damage: 6,
      fireRate: 5.8,
      ammoCapacity: 8,
      reloadTime: 1.7,
      bulletSpeed: 1,
      range: 195,
      cone: 0.62,
      kick: 1.2,
      effectTint: [1, 0.42, 0.12],
      effectGlow: "glowRed",
    },
  },
  {
    name: "バーナー",
    rarity: "rare",
    text: "炎の角度は狭いが、高火力で焼き切る。",
    weapon: {
      baseName: "火炎放射器",
      rarity: "rare",
      variantSummary: "燃料6秒。炎の角度が狭い代わりに威力が高い",
      kind: "flame",
      fuelMode: true,
      damage: 10,
      fireRate: 5.2,
      ammoCapacity: 6,
      reloadTime: 1.65,
      bulletSpeed: 1,
      range: 180,
      cone: 0.34,
      kick: 1.4,
      effectTint: [1, 0.34, 0.08],
      effectGlow: "glowRed",
    },
  },
  {
    name: "ふぶき",
    rarity: "rare",
    text: "威力は低めだが広範囲に冷気を撒き、敵を遅くする。",
    weapon: {
      baseName: "火炎放射器",
      rarity: "rare",
      variantSummary: "燃料10秒。威力は少し低いが範囲が広く、移動速度30%低下",
      kind: "flame",
      fuelMode: true,
      damage: 4.5,
      fireRate: 5.5,
      ammoCapacity: 10,
      reloadTime: 1.85,
      bulletSpeed: 1,
      range: 210,
      cone: 0.86,
      freezeChance: 1,
      freezeSlow: 0.7,
      freezeDuration: 1.3,
      kick: 1,
      effectTint: [0.5, 0.85, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "フレア",
    rarity: "legend",
    text: "全方位に炎を放ち、周囲の敵をまとめて焼く。",
    weapon: {
      baseName: "火炎放射器",
      rarity: "legend",
      variantSummary: "燃料8秒。全方位に炎を放つ",
      kind: "flame",
      fuelMode: true,
      radialFlame: true,
      damage: 6.8,
      fireRate: 4.6,
      ammoCapacity: 8,
      reloadTime: 2.0,
      bulletSpeed: 1,
      range: 170,
      cone: 0.46,
      kick: 1.7,
      effectTint: [1, 0.55, 0.16],
      effectGlow: "glowRed",
    },
  },
  {
    name: "モーニングスター",
    rarity: "normal",
    text: "自分の周囲を回る鉄球で、近くの敵を巻き込む。",
    weapon: {
      baseName: "モーニングスター",
      rarity: "normal",
      variantSummary: "標準性能",
      kind: "orbit",
      usesAmmo: false,
      damage: 20,
      fireRate: 2.6,
      bulletSpeed: 1,
      range: 145,
      areaRadius: 38,
      orbitRadius: 118,
      orbitSpeed: 3.0,
      kick: 1.5,
      effectTint: [0.84, 0.88, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "砲丸",
    rarity: "rare",
    text: "短い半径で重く回り、近くの敵を叩き潰す。",
    weapon: {
      baseName: "モーニングスター",
      rarity: "rare",
      variantSummary: "回転半径が狭い",
      kind: "orbit",
      usesAmmo: false,
      damage: 26,
      fireRate: 2.8,
      bulletSpeed: 1,
      range: 105,
      areaRadius: 42,
      orbitRadius: 78,
      orbitSpeed: 3.2,
      kick: 1.7,
      effectTint: [0.76, 0.78, 0.86],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "ウィンドボール",
    rarity: "rare",
    text: "回転は遅いが、当たった敵を外側へ押し出す。",
    weapon: {
      baseName: "モーニングスター",
      rarity: "rare",
      variantSummary: "回転速度が遅いが、当たった敵を外側にノックバック",
      kind: "orbit",
      usesAmmo: false,
      damage: 17,
      fireRate: 2.2,
      bulletSpeed: 1,
      range: 150,
      areaRadius: 36,
      orbitRadius: 126,
      orbitSpeed: 1.85,
      orbitPushOut: 36,
      kick: 1.4,
      effectTint: [0.55, 0.95, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "3つ星",
    rarity: "legend",
    text: "3つの星が高速回転し、広い範囲を守る。",
    weapon: {
      baseName: "モーニングスター",
      rarity: "legend",
      variantSummary: "個数+2。回転が速い",
      kind: "orbit",
      usesAmmo: false,
      orbitCount: 3,
      damage: 18,
      fireRate: 3.0,
      bulletSpeed: 1,
      range: 155,
      areaRadius: 34,
      orbitRadius: 124,
      orbitSpeed: 4.4,
      kick: 1.6,
      effectTint: [1, 0.95, 0.55],
      effectGlow: "glowAmber",
    },
  },
];

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function syncWeaponLevel(weapon) {
  if (!weapon) return 1;
  const levelFromAttachments = (weapon.attachments?.length || 0) + 1;
  weapon.level = Math.min(getWeaponMaxLevel(weapon), Math.max(1, weapon.level || 1, levelFromAttachments));
  return weapon.level;
}

function weaponLevelUpPrice(weapon) {
  const level = syncWeaponLevel(weapon);
  const nextLevel = level + 1;
  const basePrices = { 2: 18, 3: 30, 4: 46, 5: 66, 6: 92, 7: 124, 8: 162, 9: 210 };
  return (basePrices[nextLevel] || 999) + Math.max(1, game.wave) * (nextLevel + 2);
}

export function shopRerollPrice() {
  return 0;
}

export function generateOffers() {
  game.offers = [];
  game.pendingAttachmentChoice = null;
}

export function rerollShopOffers() {
  renderShop();
  updateHud();
}

export function setShopTab(tab) {
  if (game.pendingAttachmentChoice) return;
  game.shopTab = tab === "storage" ? "storage" : "shop";
  renderShop();
}

export function isShopTabStorage() {
  return !game.pendingAttachmentChoice && game.shopTab === "storage";
}

function ensureGearStorage() {
  const gear = game.player?.gear;
  if (!gear) return null;
  if (!Array.isArray(gear.storageWeapons)) gear.storageWeapons = [];
  if (!Array.isArray(gear.storageAttachments)) gear.storageAttachments = [];
  if (!Number.isInteger(gear.activeWeaponIndex)) gear.activeWeaponIndex = 0;
  clampActiveWeaponIndex(gear);
  return gear;
}

function normalizeAttachment(definition, stars) {
  return {
    key: definition.key,
    name: definition.name,
    stars: stars || definition.stars || 1,
    category: definition.category || "stat",
  };
}

export function beginWeaponLevelUp(weaponId) {
  const gear = ensureGearStorage();
  if (!gear) return;
  const weapon = findWeapon(weaponId);
  if (!weapon || game.pendingAttachmentChoice) return;
  const level = syncWeaponLevel(weapon);
  if (level >= getWeaponMaxLevel(weapon) || weapon.attachments.length >= getWeaponMaxAttachments(weapon)) return;
  const price = weaponLevelUpPrice(weapon);
  if (game.gold < price) return;
  const nextLevel = level + 1;
  const choices = pickAttachmentChoicesForWeapon(weapon, nextLevel, 3);
  if (choices.length === 0) return;
  game.gold -= price;
  game.shopTab = "shop";
  game.pendingAttachmentChoice = {
    weaponId,
    nextLevel,
    choices: choices.map((choice) => normalizeAttachmentChoice(choice)),
  };
  renderShop();
  updateHud();
}

function normalizeAttachmentChoice(choice) {
  const definition = choice.definition;
  return {
    key: definition.key,
    name: definition.name,
    text: definition.text,
    stars: choice.stars || definition.stars || 1,
    category: definition.category || "stat",
  };
}

export function chooseLevelAttachment(index) {
  const pending = game.pendingAttachmentChoice;
  if (!pending) return;
  const weapon = findWeapon(pending.weaponId);
  const choice = pending.choices[index];
  if (!weapon || !choice) return;
  const definition = findAttachmentDefinition(choice.key);
  if (!definition || !canAttachToWeapon(definition, weapon)) return;
  if (!addAttachmentToWeapon(weapon, { ...choice, definition })) return;
  weapon.level = Math.min(getWeaponMaxLevel(weapon), pending.nextLevel);
  game.pendingAttachmentChoice = null;
  renderShop();
  updateHud();
}

export function detachAttachment() {
  return false;
}

export function equipStoredAttachment(storageIndex, weaponId) {
  const gear = ensureGearStorage();
  const weapon = findWeapon(weaponId);
  if (!gear || !weapon) return;
  const attachment = gear.storageAttachments[storageIndex];
  if (!attachment || weapon.attachments.length >= getWeaponMaxAttachments(weapon)) return;
  const definition = findAttachmentDefinition(attachment.key) || attachment;
  if (!canAttachToWeapon(definition, weapon)) return;
  if (!addAttachmentToWeapon(weapon, { ...attachment, definition })) return;
  gear.storageAttachments.splice(storageIndex, 1);
  renderShop();
  updateHud();
}

export function unequipWeapon(weaponIdOrSlotIndex) {
  const gear = ensureGearStorage();
  if (!gear || gear.weapons.length <= 1) return;
  const foundIndex = gear.weapons.findIndex((weapon) => weapon.id === weaponIdOrSlotIndex);
  const slotIndex = foundIndex >= 0 ? foundIndex : weaponIdOrSlotIndex;
  const [weapon] = gear.weapons.splice(slotIndex, 1);
  if (!weapon) return;
  gear.storageWeapons.push(weapon);
  clampActiveWeaponIndex(gear);
  recomputeAllAttachments();
  renderShop();
  updateHud();
}

export function equipStoredWeapon(storageIndex, slotIndex = null) {
  const gear = ensureGearStorage();
  if (!gear) return;
  const weapon = gear.storageWeapons[storageIndex];
  if (!weapon) return;

  const targetIndex = Number.isInteger(slotIndex) ? slotIndex : gear.weapons.length;
  if (targetIndex < 0 || targetIndex >= MAX_WEAPONS) return;
  const [storedWeapon] = gear.storageWeapons.splice(storageIndex, 1);
  if (gear.weapons[targetIndex]) {
    const equipped = gear.weapons[targetIndex];
    gear.weapons[targetIndex] = storedWeapon;
    gear.storageWeapons.push(equipped);
  } else if (gear.weapons.length < MAX_WEAPONS) {
    gear.weapons.push(storedWeapon);
  } else {
    gear.storageWeapons.splice(storageIndex, 0, storedWeapon);
    return;
  }
  setActiveWeaponIndex(targetIndex);
  recomputeAllAttachments();
  renderShop();
  updateHud();
}

function findWeapon(id) {
  return game.player.gear.weapons.find((weapon) => weapon.id === id) || null;
}

function aggregateAttachments(list) {
  const map = new Map();
  list.forEach((att, idx) => {
    if (!map.has(att.key)) {
      map.set(att.key, { ...att, count: 1, indices: [idx] });
    } else {
      const entry = map.get(att.key);
      entry.count += 1;
      entry.indices.push(idx);
    }
  });
  return Array.from(map.values());
}

function attachmentLabelText(agg) {
  return agg.count > 1 ? `${agg.name} ×${agg.count}` : agg.name;
}

function attachmentIcon(category, stars) {
  if (stars >= 3) return "★";
  if (category === "support") return "+";
  if (category === "special" || category === "unique") return "◆";
  return "▲";
}

function bindPress(element, handler) {
  let lastHandledAt = 0;
  const run = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - lastHandledAt < 80) return;
    lastHandledAt = now;
    handler();
  };
  element.addEventListener("click", run);
  element.addEventListener("pointerup", run);
}

export function weaponIcon(weapon) {
  if (!weapon) return "+";
  const baseName = weapon.baseName || weapon.name;
  if (weapon.kind === "flame") return "F";
  if (weapon.kind === "timedBomb" || weapon.kind === "pulseBomb") return "B";
  if (weapon.kind === "sustainedLaser") return "L";
  if (weapon.kind === "orbit") return "O";
  if (weapon.kind === "sword") return "S";
  if (baseName === "石") return "R";
  if (baseName === "豆鉄砲") return "M";
  return "W";
}

function buildLevelUpCard(weapon, index) {
  const level = syncWeaponLevel(weapon);
  const nextLevel = level + 1;
  const maxLevel = getWeaponMaxLevel(weapon);
  const maxAttachments = getWeaponMaxAttachments(weapon);
  const maxed = level >= maxLevel || weapon.attachments.length >= maxAttachments;
  const cost = maxed ? 0 : weaponLevelUpPrice(weapon);
  const canAfford = game.gold >= cost;
  const card = document.createElement("article");
  card.className = `offer offer-weapon${maxed ? " offer-taken" : ""}${!maxed && !canAfford ? " offer-unaffordable" : ""}`;

  const icon = document.createElement("span");
  icon.className = "offer-icon";
  icon.textContent = weaponIcon(weapon);

  const headRow = document.createElement("div");
  headRow.className = "offer-head";

  const type = document.createElement("span");
  type.className = "offer-type offer-type-weapon";
  type.textContent = `武器 ${index + 1}`;
  headRow.append(type);

  const title = document.createElement("h2");
  title.textContent = weapon.name;

  const description = document.createElement("p");
  description.textContent = maxed
    ? "最大レベル。これ以上アタッチメントは増えません。"
    : `Lv${nextLevel}で付与するアタッチメントをランダム3択から選びます。`;

  const meta = document.createElement("small");
  meta.className = "offer-meta";
  meta.textContent = maxed
    ? `Lv ${level}/${maxLevel}・アタッチメント ${weapon.attachments.length}/${maxAttachments}`
    : `Lv ${level}/${maxLevel}・アタッチメント ${weapon.attachments.length}/${maxAttachments}・抽選 ${attachmentRarityChanceText(nextLevel)}`;

  const price = document.createElement("div");
  price.className = "price";
  const priceAmount = document.createElement("strong");
  priceAmount.className = "price-amount";
  priceAmount.textContent = maxed ? "MAX" : `${cost}G`;
  const owned = document.createElement("span");
  owned.className = "price-owned";
  owned.textContent = `所持 ${game.gold}G`;
  price.append(priceAmount, owned);

  const action = document.createElement("div");
  action.className = "offer-action";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "offer-buy";
  button.textContent = maxed ? "最大" : canAfford ? `Lv${nextLevel}へ` : "不足";
  button.disabled = maxed || !canAfford;
  button.addEventListener("click", () => beginWeaponLevelUp(weapon.id));
  action.append(button);

  const body = document.createElement("div");
  body.className = "offer-body";
  body.append(headRow, title, description, meta);

  const purchase = document.createElement("div");
  purchase.className = "offer-purchase";
  purchase.append(price, action);

  card.append(icon, body, purchase);
  return card;
}

function buildAttachmentChoiceCard(choice, index, weapon) {
  const card = document.createElement("article");
  card.className = `offer offer-attachment attach-stars-${choice.stars || 1}`;

  const icon = document.createElement("span");
  icon.className = "offer-icon";
  icon.textContent = attachmentIcon(choice.category, choice.stars || 1);

  const headRow = document.createElement("div");
  headRow.className = "offer-head";
  const type = document.createElement("span");
  type.className = "offer-type offer-type-attachment";
  type.textContent = `候補 ${index + 1}・${starsLabel(choice.stars)}`;
  headRow.append(type);

  const title = document.createElement("h2");
  title.textContent = choice.name;

  const description = document.createElement("p");
  description.textContent = choice.text || "";

  const meta = document.createElement("small");
  meta.className = "offer-meta";
  meta.textContent = `${weapon?.name || "武器"}へ付与・${attachmentCategoryLabel(choice.category)}`;

  const body = document.createElement("div");
  body.className = "offer-body";
  body.append(headRow, title, description, meta);

  const action = document.createElement("div");
  action.className = "offer-action";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "offer-buy";
  button.textContent = "付与する";
  button.addEventListener("click", () => chooseLevelAttachment(index));
  action.append(button);

  const purchase = document.createElement("div");
  purchase.className = "offer-purchase";
  purchase.append(action);

  card.append(icon, body, purchase);
  return card;
}

export function renderShop() {
  ensureGearStorage();
  updateShopTabs();
  hud.offers.replaceChildren();
  updateShopHeading();

  const pending = game.pendingAttachmentChoice;
  if (pending) {
    const weapon = findWeapon(pending.weaponId);
    pending.choices.forEach((choice, index) => {
      hud.offers.append(buildAttachmentChoiceCard(choice, index, weapon));
    });
  } else {
    const gear = ensureGearStorage();
    gear?.weapons.forEach((weapon, index) => {
      hud.offers.append(buildLevelUpCard(weapon, index));
    });
    if (!gear?.weapons.length) {
      const empty = document.createElement("p");
      empty.className = "storage-empty";
      empty.textContent = "装備中の武器がありません";
      hud.offers.append(empty);
    }
  }

  renderGearInventory();
  renderStorageInventory();
  updateShopControls();
}

function updateShopTabs() {
  const tab = game.pendingAttachmentChoice ? "shop" : (game.shopTab === "storage" ? "storage" : "shop");
  hud.shopPane?.classList.toggle("hidden", tab !== "shop");
  hud.storagePane?.classList.toggle("hidden", tab !== "storage");
  hud.shopTabShop?.classList.toggle("active", tab === "shop");
  hud.shopTabStorage?.classList.toggle("active", tab === "storage");
  hud.shopTabShop?.setAttribute("aria-selected", tab === "shop" ? "true" : "false");
  hud.shopTabStorage?.setAttribute("aria-selected", tab === "storage" ? "true" : "false");
  if (hud.shopTabShop) hud.shopTabShop.disabled = !!game.pendingAttachmentChoice;
  if (hud.shopTabStorage) hud.shopTabStorage.disabled = !!game.pendingAttachmentChoice;
}

function updateShopHeading() {
  const heading = hud.shop?.querySelector("h1");
  const kicker = hud.shop?.querySelector(".panel-kicker");
  if (kicker) kicker.textContent = game.pendingAttachmentChoice ? "武器レベルアップ" : "安全地帯";
  if (heading) {
    heading.textContent = game.pendingAttachmentChoice
      ? "付与するアタッチメントを選択"
      : "武器をレベルアップ";
  }
}

function updateShopControls() {
  if (!hud.shopReroll) return;
  hud.shopReroll.classList.add("hidden");
  hud.shopReroll.disabled = true;
  if (hud.shopContinue) {
    hud.shopContinue.textContent = game.pendingAttachmentChoice
      ? "強化を選択"
      : isShopTabStorage()
        ? "次の階層へ"
        : "倉庫へ";
    hud.shopContinue.disabled = !!game.pendingAttachmentChoice;
  }
}

function renderGearInventory() {
  const gear = ensureGearStorage();
  if (!gear) return;
  hud.gearInventory.replaceChildren();
  const board = document.createElement("div");
  board.className = "loadout-board";

  for (let i = 0; i < MAX_WEAPONS; i += 1) {
    board.append(buildWeaponSlot(gear.weapons[i], i));
  }
  hud.gearInventory.append(board);
}

function renderStorageInventory() {
  const gear = ensureGearStorage();
  if (!gear || !hud.storageInventory) return;
  hud.storageInventory.replaceChildren();

  const board = document.createElement("div");
  board.className = "storage-board";
  board.append(
    buildStorageSection("倉庫の武器", gear.storageWeapons, buildStoredWeaponCard, "武器の予備はありません"),
  );
  hud.storageInventory.append(board);
}

function buildStorageSection(title, items, buildCard, emptyText) {
  const section = document.createElement("section");
  section.className = "storage-section";

  const heading = document.createElement("div");
  heading.className = "storage-heading";
  const label = document.createElement("strong");
  label.textContent = title;
  const count = document.createElement("span");
  count.textContent = String(items.length);
  heading.append(label, count);

  const list = document.createElement("div");
  list.className = "storage-list";
  if (items.length > 0) {
    items.forEach((item, index) => list.append(buildCard(item, index)));
  } else {
    const empty = document.createElement("p");
    empty.className = "storage-empty";
    empty.textContent = emptyText;
    list.append(empty);
  }

  section.append(heading, list);
  return section;
}

function buildStoredWeaponCard(weapon, storageIndex) {
  const gear = ensureGearStorage();
  const card = document.createElement("article");
  card.className = "storage-card storage-weapon-card";

  const icon = document.createElement("span");
  icon.className = "weapon-icon";
  icon.textContent = weaponIcon(weapon);

  const body = document.createElement("div");
  body.className = "storage-card-body";
  const name = document.createElement("strong");
  name.textContent = weapon.name;
  const meta = document.createElement("small");
  meta.textContent = `Lv ${syncWeaponLevel(weapon)}/${getWeaponMaxLevel(weapon)} / ${weaponMetaLabel(weapon)} / ${weaponAmmoLabel(weapon)} / アタッチメント ${weapon.attachments.length}/${getWeaponMaxAttachments(weapon)}`;
  body.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "storage-actions";
  for (let i = 0; i < MAX_WEAPONS; i += 1) {
    const occupied = gear.weapons[i];
    const canUseEmptySlot = !occupied && gear.weapons.length < MAX_WEAPONS && i === gear.weapons.length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "storage-action";
    button.textContent = occupied ? `${i + 1}と交換` : `${i + 1}に装備`;
    button.disabled = !occupied && !canUseEmptySlot;
    bindPress(button, () => equipStoredWeapon(storageIndex, i));
    actions.append(button);
  }

  card.append(icon, body, actions);
  return card;
}

function buildStoredAttachmentCard(attachment, storageIndex) {
  const gear = ensureGearStorage();
  const definition = findAttachmentDefinition(attachment.key) || attachment;
  const card = document.createElement("article");
  card.className = `storage-card storage-attachment-card attach-stars-${attachment.stars || 1}`;

  const icon = document.createElement("span");
  icon.className = "offer-icon";
  icon.textContent = attachmentIcon(attachment.category, attachment.stars || 1);

  const body = document.createElement("div");
  body.className = "storage-card-body";
  const name = document.createElement("strong");
  name.textContent = attachment.name || definition.name;
  const meta = document.createElement("small");
  meta.textContent = `${starsLabel(attachment.stars)} / ${attachmentCategoryLabel(attachment.category || definition.category)}`;
  const text = document.createElement("p");
  text.textContent = definition.text || "";
  body.append(name, meta, text);

  const actions = document.createElement("div");
  actions.className = "storage-actions";
  gear.weapons.forEach((weapon, weaponIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "storage-action";
    button.textContent = `${weaponIndex + 1}へ`;
    button.disabled = weapon.attachments.length >= getWeaponMaxAttachments(weapon) || !canAttachToWeapon(definition, weapon);
    bindPress(button, () => equipStoredAttachment(storageIndex, weapon.id));
    actions.append(button);
  });

  if (gear.weapons.length === 0) {
    const empty = document.createElement("span");
    empty.className = "storage-action-note";
    empty.textContent = "装備中の武器がありません";
    actions.append(empty);
  }

  card.append(icon, body, actions);
  return card;
}

function buildWeaponSlot(weapon, index) {
  const activeIndex = clampActiveWeaponIndex(game.player.gear);
  const isActive = !!weapon && index === activeIndex;
  const level = weapon ? syncWeaponLevel(weapon) : 1;
  const maxLevel = weapon ? getWeaponMaxLevel(weapon) : 1;
  const maxAttachments = weapon ? getWeaponMaxAttachments(weapon) : 0;
  const slot = document.createElement("article");
  slot.className = `weapon-slot ${weapon ? "weapon-slot-filled" : "weapon-slot-empty"}${isActive ? " weapon-slot-active" : ""}`;

  const icon = document.createElement("span");
  icon.className = "weapon-icon";
  icon.textContent = weaponIcon(weapon);

  const top = document.createElement("div");
  top.className = "weapon-slot-top";
  const label = document.createElement("span");
  label.className = "slot-index";
  label.textContent = `武器 ${index + 1}`;
  const status = document.createElement("span");
  status.className = `slot-status ${weapon ? (isActive ? "slot-status-active" : "slot-status-equipped") : "slot-status-empty"}`;
  status.textContent = weapon ? (isActive ? "使用中" : "控え") : "空き";
  top.append(label, status);

  const name = document.createElement("strong");
  name.className = "weapon-slot-name";
  name.textContent = weapon ? weapon.name : "未装備";
  const kind = document.createElement("small");
  kind.className = "weapon-slot-kind";
  kind.textContent = weapon ? `${weaponMetaLabel(weapon)} / ${weaponAmmoLabel(weapon)}` : "武器スロット";

  const attachmentTrack = document.createElement("div");
  attachmentTrack.className = "attachment-track";
  const attachmentTitle = document.createElement("span");
  attachmentTitle.className = "attachment-title";
  attachmentTitle.textContent = weapon
    ? `Lv ${level}/${maxLevel}・アタッチメント ${weapon.attachments.length}/${maxAttachments}`
    : "アタッチメント";
  const attachmentList = document.createElement("div");
  attachmentList.className = "attachment-list";
  const attachments = weapon?.attachments || [];

  const attachmentPips = document.createElement("div");
  attachmentPips.className = "attachment-pips";
  for (let i = 0; i < maxAttachments; i += 1) {
    const pip = document.createElement("span");
    pip.className = `attachment-pip${attachments[i] ? ` attach-stars-${attachments[i].stars || 1}` : ""}`;
    pip.textContent = attachments[i] ? starsLabel(attachments[i].stars).slice(0, 1) : "";
    attachmentPips.append(pip);
  }

  if (attachments.length > 0) {
    const aggregated = aggregateAttachments(attachments);
    aggregated.forEach((agg) => {
      const row = document.createElement("div");
      row.className = "attachment-row";

      const chip = document.createElement("span");
      chip.className = `attach-chip attach-stars-${agg.stars || 1}`;
      const stars = document.createElement("span");
      stars.className = "attach-stars-label";
      stars.textContent = starsLabel(agg.stars);
      const attachmentName = document.createElement("span");
      attachmentName.className = "attach-name";
      attachmentName.textContent = attachmentLabelText(agg);
      chip.append(stars, attachmentName);

      row.append(chip);
      attachmentList.append(row);
    });
  } else {
    const empty = document.createElement("span");
    empty.className = "attach-chip attach-chip-empty";
    empty.textContent = weapon ? "空き" : "未装備";
    attachmentList.append(empty);
  }

  attachmentTrack.append(attachmentTitle, attachmentPips, attachmentList);
  const slotActions = document.createElement("div");
  slotActions.className = "weapon-slot-actions";
  if (weapon) {
    const maxed = level >= maxLevel || weapon.attachments.length >= maxAttachments;
    const levelUp = document.createElement("button");
    levelUp.type = "button";
    levelUp.className = "weapon-use";
    levelUp.textContent = maxed ? "Lv MAX" : `LvUP ${weaponLevelUpPrice(weapon)}G`;
    levelUp.disabled = maxed || game.gold < weaponLevelUpPrice(weapon) || !!game.pendingAttachmentChoice;
    bindPress(levelUp, () => beginWeaponLevelUp(weapon.id));
    slotActions.append(levelUp);
    if (!isActive) {
      const use = document.createElement("button");
      use.type = "button";
      use.className = "weapon-use";
      use.textContent = "使用する";
      bindPress(use, () => {
        setActiveWeaponIndex(index);
        renderShop();
        updateHud();
      });
      slotActions.append(use);
    }
    const unequip = document.createElement("button");
    unequip.type = "button";
    unequip.className = "weapon-unequip";
    unequip.textContent = "武器を倉庫へ";
    unequip.disabled = game.player.gear.weapons.length <= 1 || !!game.pendingAttachmentChoice;
    bindPress(unequip, () => unequipWeapon(weapon.id));
    slotActions.append(unequip);
  } else {
    const note = document.createElement("span");
    note.className = "slot-empty-note";
    note.textContent = "倉庫の武器を装備できます";
    slotActions.append(note);
  }
  const body = document.createElement("div");
  body.className = "weapon-slot-body";
  body.append(top, name, kind, attachmentTrack, slotActions);
  slot.append(icon, body);
  return slot;
}

export function prepareStarterPick() {
  const normalWeapons = WEAPON_POOL.filter((template) => (template.rarity || template.weapon?.rarity) === "normal");
  const starterPool = normalWeapons.length > 0 ? normalWeapons : WEAPON_POOL;
  game.starterChoices = shuffle(starterPool).slice(0, 3);
}

export function pickStarterWeapon(index) {
  const template = game.starterChoices[index];
  if (!template) return;
  const weapon = createWeapon({ name: template.name, ...template.weapon });
  game.player.gear.weapons = [weapon];
  game.player.gear.activeWeaponIndex = 0;
  game.selectedWeapon = weapon.baseName || weapon.name;
  game.starterChoices = [];
  game.mode = "arena";
  hud.starterPick.classList.add("hidden");
  updateHud();
}

export function renderStarterPick() {
  hud.starterOffers.replaceChildren();
  const kicker = hud.starterPick.querySelector(".panel-kicker");
  const heading = hud.starterPick.querySelector("h1");
  if (kicker) kicker.textContent = "最初の武器";
  if (heading) heading.textContent = "1つを選び、60秒アリーナWaveへ";
  game.starterChoices.forEach((template, index) => {
    const card = document.createElement("article");
    card.className = "starter-card offer-weapon";

    const tag = document.createElement("span");
    tag.className = "offer-type offer-type-weapon";
    tag.textContent = "メイン武器";

    const title = document.createElement("h2");
    title.textContent = template.name;

    const text = document.createElement("p");
    text.textContent = template.text || "";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "starter-card-pick";
    button.textContent = "これで始める";
    button.addEventListener("click", () => pickStarterWeapon(index));

    card.append(tag, title, text, button);
    hud.starterOffers.append(card);
  });
  hud.starterPick.classList.remove("hidden");
}
