import { game } from "./state.js";
import { hud } from "./dom.js";
import { MAX_ATTACHMENTS, MAX_STORED_ATTACHMENTS, MAX_WEAPON_LEVEL, MAX_WEAPONS, RUN_DURATION_SECONDS, getWeaponMaxAttachments, getWeaponMaxLevel } from "./constants.js";
import { resetEnemySpawnTimer, spawnOpeningEnemies } from "./enemies.js";
import { clampActiveWeaponIndex, createWeapon, setActiveWeaponIndex, weaponMetaLabel } from "./weapons.js";
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
      variantSummary: "威力が少し高い",
      damage: 42,
      fireRate: 0.9,
      bulletSpeed: 360,
      life: 1.15,
      radius: 12,
      kick: 1.9,
      bulletGlow: "glowAmber",
      bulletSprite: "stoneReadable",
    },
  },
  {
    name: "マシンガン",
    rarity: "normal",
    text: "遅めの弾を絶え間なく連射する、手数重視の射撃武器。",
    weapon: {
      baseName: "マシンガン",
      rarity: "normal",
      variantSummary: "低威力だが高頻度・低速連射",
      kind: "projectile",
      damage: 10,
      fireRate: 11.5,
      bulletSpeed: 440,
      life: 1.18,
      range: 520,
      radius: 5,
      jitter: 0.08,
      kick: 0.7,
      bulletTint: [1, 0.82, 0.42],
      bulletGlow: "glowAmber",
      bulletSprite: "machineGunBullet",
      stoneVisual: { form: "miniBullet", trail: "none", hitEffect: "normal" },
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
    name: "火炎放射器",
    rarity: "normal",
    text: "前方に炎を吹きつける標準的な火炎放射器。",
    weapon: {
      baseName: "火炎放射器",
      rarity: "normal",
      variantSummary: "標準性能",
      kind: "flame",
      damage: 6,
      fireRate: 5.8,
      bulletSpeed: 1,
      range: 195,
      cone: 0.62,
      kick: 1.2,
      effectTint: [1, 0.42, 0.12],
      effectGlow: "glowRed",
    },
  },
  {
    name: "ブーメラン",
    rarity: "normal",
    text: "敵方向へ飛んで戻り、往路と復路で複数の敵を切る。",
    weapon: {
      baseName: "ブーメラン",
      rarity: "normal",
      variantSummary: "往復軌道。短い再ヒット間隔で多段ヒット",
      kind: "boomerang",
      damage: 28,
      fireRate: 1.0,
      bulletSpeed: 560,
      life: 2.1,
      returnTime: 0.82,
      range: 620,
      radius: 12,
      kick: 1.5,
      bulletTint: [1, 0.82, 0.48],
      bulletGlow: "glowAmber",
      bulletSprite: "boomerang",
      effectTint: [1, 0.78, 0.38],
      effectGlow: "glowAmber",
    },
  },
  {
    name: "時限爆弾",
    rarity: "normal",
    text: "足元に黒い爆弾を設置し、導火線の後に大爆発する。",
    weapon: {
      baseName: "時限爆弾",
      rarity: "normal",
      variantSummary: "遅延つき高火力範囲攻撃",
      kind: "timedBomb",
      damage: 32,
      explosionDamage: 82,
      explosionRadius: 98,
      fireRate: 0.75,
      bulletSpeed: 1,
      fuse: 1.15,
      life: 0.9,
      range: 120,
      radius: 11,
      knockback: 4,
      kick: 2.5,
      bulletTint: [0.16, 0.17, 0.22],
      bulletGlow: "glowRed",
      bulletSprite: "bomb",
      effectTint: [1, 0.45, 0.18],
      effectGlow: "glowRed",
    },
  },
  {
    name: "持続レーザー",
    rarity: "normal",
    text: "狙った方向へしばらく残るレーザーを設置し、触れた敵を焼く。",
    weapon: {
      baseName: "持続レーザー",
      rarity: "normal",
      variantSummary: "一定時間残る直線レーザー",
      kind: "sustainedLaser",
      damage: 12,
      fireRate: 0.9,
      bulletSpeed: 1,
      range: 560,
      lineWidth: 18,
      duration: 1.45,
      tickRate: 8,
      pierce: 3,
      kick: 1.6,
      effectTint: [0.5, 0.95, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "ソード",
    rarity: "normal",
    text: "向いている方向へ鋭い剣の斬撃を放つ近接武器。",
    weapon: {
      baseName: "ソード",
      rarity: "normal",
      variantSummary: "短射程・高威力の扇状斬撃",
      kind: "sword",
      damage: 58,
      fireRate: 1.25,
      bulletSpeed: 1,
      range: 145,
      cone: 0.72,
      radius: 10,
      knockback: 14,
      kick: 2.1,
      effectTint: [0.95, 0.9, 0.78],
      effectGlow: "glowAmber",
      bulletSprite: "swordIcon",
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
  weapon.level = Math.min(MAX_WEAPON_LEVEL, Math.max(1, weapon.level || 1));
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
    locked: false,
  };
}

export function beginWeaponLevelUp(weaponId) {
  const gear = ensureGearStorage();
  if (!gear) return;
  const weapon = findWeapon(weaponId);
  if (!weapon || game.pendingAttachmentChoice) return;
  const level = syncWeaponLevel(weapon);
  if (level >= MAX_WEAPON_LEVEL || weapon.attachments.length >= MAX_ATTACHMENTS) return;
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

export function detachAttachment(weaponId, slotIndex) {
  const gear = ensureGearStorage();
  const weapon = findWeapon(weaponId);
  if (!gear || !weapon) return false;
  const attachment = weapon.attachments[slotIndex];
  if (!attachment || attachment.locked) return false;
  if ((gear.storageAttachments || []).length >= MAX_STORED_ATTACHMENTS) return false;
  weapon.attachments.splice(slotIndex, 1);
  gear.storageAttachments.push(attachment);
  recomputeAllAttachments();
  renderShop();
  updateHud();
  return true;
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
  if (baseName === "マシンガン") return "M";
  if (baseName === "ナイフ") return "K";
  if (baseName === "ブーメラン") return "B";
  if (baseName === "弓") return "Y";
  if (baseName === "雷の杖") return "T";
  if (baseName === "地雷") return "M";
  if (baseName === "爆弾") return "B";
  if (baseName === "時限爆弾") return "B";
  if (baseName === "剣") return "S";
  if (baseName === "斧（斬撃）") return "A";
  if (baseName === "持続レーザー") return "L";
  if (baseName === "毒瓶") return "P";
  if (baseName === "氷の杖") return "I";
  if (baseName === "ドローン") return "D";
  if (weapon.kind === "flame") return "F";
  if (weapon.kind === "timedBomb" || weapon.kind === "pulseBomb") return "B";
  if (weapon.kind === "sustainedLaser") return "L";
  if (weapon.kind === "orbit") return "O";
  if (weapon.kind === "sword") return "S";
  if (baseName === "石") return "R";
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
  meta.textContent = `Lv ${syncWeaponLevel(weapon)}/${getWeaponMaxLevel(weapon)} / ${weaponMetaLabel(weapon)} / アタッチメント ${weapon.attachments.length}/${getWeaponMaxAttachments(weapon)}`;
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
  kind.textContent = weapon ? `${weaponMetaLabel(weapon)}` : "武器スロット";

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
  const backupTemplate = WEAPON_POOL.find((candidate) => candidate !== template && (candidate.rarity || candidate.weapon?.rarity) === "normal")
    || WEAPON_POOL.find((candidate) => candidate !== template);
  const backupWeapon = backupTemplate ? createWeapon({ name: backupTemplate.name, ...backupTemplate.weapon }) : null;
  game.player.gear.weapons = backupWeapon ? [weapon, backupWeapon] : [weapon];
  game.player.gear.activeWeaponIndex = 0;
  game.selectedWeapon = weapon.baseName || weapon.name;
  game.starterChoices = [];
  game.mode = "arena";
  game.floorElapsed = 0;
  game.waveTimeLeft = RUN_DURATION_SECONDS;
  game.spawnClock = 0;
  game.spawnBatchSize = 0;
  window.dispatchEvent(new CustomEvent("starter-weapon-picked"));
  spawnOpeningEnemies();
  resetEnemySpawnTimer();
  hud.starterPick.classList.add("hidden");
  updateHud();
}

export function renderStarterPick() {
  hud.starterOffers.replaceChildren();
  const kicker = hud.starterPick.querySelector(".panel-kicker");
  const heading = hud.starterPick.querySelector("h1");
  if (kicker) kicker.textContent = "最初の武器";
  if (heading) heading.textContent = "メインを選び、武器A/Bでダンジョン探索へ";
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
    button.textContent = "これを武器Aにする";
    button.addEventListener("click", () => pickStarterWeapon(index));

    card.append(tag, title, text, button);
    hud.starterOffers.append(card);
  });
  hud.starterPick.classList.remove("hidden");
}
