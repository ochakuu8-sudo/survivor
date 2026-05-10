import { game } from "./state.js";
import { hud } from "./dom.js";
import { MAX_ATTACHMENTS, MAX_WEAPONS } from "./constants.js";
import { clampActiveWeaponIndex, createWeapon, setActiveWeaponIndex, weaponAmmoLabel, weaponMetaLabel } from "./weapons.js";
import {
  addAttachmentToWeapon,
  attachmentCategoryLabel,
  canAttachToWeapon,
  findAttachmentDefinition,
  pickShopAttachment,
  recomputeAllAttachments,
  starsLabel,
} from "./attachments.js";
import { updateHud } from "./hud.js";

export const WEAPON_POOL = [
  {
    name: "石",
    text: "重い石を山なりに投げる。威力は高いが攻撃速度は遅い。",
    weapon: {
      damage: 40,
      fireRate: 0.72,
      ammoCapacity: 1,
      reloadTime: 1.15,
      bulletSpeed: 320,
      life: 1.45,
      radius: 12,
      kick: 2.2,
      bulletGlow: "glowAmber",
      bulletSprite: "stoneReadable",
    },
  },
  {
    name: "豆鉄砲",
    text: "短射程のマシンガン。軽い弾を近距離にばらまく。",
    weapon: {
      damage: 5,
      fireRate: 8.2,
      ammoCapacity: 24,
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
    name: "火炎放射器",
    text: "前方に炎を吹きつける。近くの群れをまとめて焼く。",
    weapon: {
      kind: "flame",
      damage: 6,
      fireRate: 5.5,
      ammoCapacity: 18,
      reloadTime: 1.55,
      bulletSpeed: 1,
      range: 195,
      cone: 0.62,
      kick: 1.2,
      effectTint: [1, 0.42, 0.12],
      effectGlow: "glowRed",
    },
  },
  {
    name: "モーニングスター",
    text: "自分の周囲を回る鉄球で、近くの敵を巻き込む。",
    weapon: {
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
];

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function attachmentPrice(stars, wave) {
  const basePrices = { 1: 12, 2: 22, 3: 36 };
  const floor = Math.max(1, wave);
  const rarity = Math.max(1, stars || 1);
  return (basePrices[rarity] || 12) + (floor - 1) * (3 + rarity * 2);
}

export function shopRerollPrice() {
  if ((game.shopRerollsUsed || 0) === 0) return 0;
  return 8 + game.wave * 4 + (game.shopRerollsUsed - 1) * 4;
}

function createShopOffer(seen = new Set()) {
  let guard = 0;
  while (guard < 80) {
    const choice = pickShopAttachment(game.wave);
    guard += 1;
    if (!choice) continue;
    if (seen.has(choice.definition.key)) continue;
    seen.add(choice.definition.key);
    return {
      definition: choice.definition,
      stars: choice.stars,
      name: choice.definition.name,
      text: choice.definition.text,
      category: choice.definition.category,
      price: attachmentPrice(choice.stars, game.wave),
      taken: false,
    };
  }
  return null;
}

export function generateOffers() {
  const picks = [];
  const seen = new Set();
  while (picks.length < 3) {
    const offer = createShopOffer(seen);
    if (!offer) break;
    picks.push(offer);
  }
  game.offers = picks;
}

function replaceOffer(index, previousOffer) {
  const seen = new Set(game.offers
    .filter((offer, i) => i !== index && offer?.definition)
    .map((offer) => offer.definition.key));
  if (previousOffer?.definition?.key) seen.add(previousOffer.definition.key);
  const nextOffer = createShopOffer(seen);
  game.offers[index] = nextOffer || { ...previousOffer, taken: true };
}

export function rerollShopOffers() {
  const price = shopRerollPrice();
  if (game.gold < price) return;
  if (price > 0) game.gold -= price;
  game.shopRerollsUsed = (game.shopRerollsUsed || 0) + 1;
  generateOffers();
  renderShop();
  updateHud();
}

export function setShopTab(tab) {
  game.shopTab = tab === "storage" ? "storage" : "shop";
  renderShop();
}

export function isShopTabStorage() {
  return game.shopTab === "storage";
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

export function buyAttachment(index) {
  const offer = game.offers[index];
  if (!offer || offer.taken) return;
  const gear = ensureGearStorage();
  if (!gear) return;
  if (game.gold < offer.price) return;
  const definition = offer.definition;
  gear.storageAttachments.push(normalizeAttachment(definition, offer.stars));
  game.gold -= offer.price;
  replaceOffer(index, offer);
  renderShop();
  updateHud();
}

export function detachAttachment(weaponId, attachmentIndex) {
  const gear = ensureGearStorage();
  const weapon = findWeapon(weaponId);
  if (!weapon) return;
  const [attachment] = weapon.attachments.splice(attachmentIndex, 1);
  if (!attachment) return;
  gear.storageAttachments.push(attachment);
  recomputeAllAttachments();
  renderShop();
  updateHud();
}

export function equipStoredAttachment(storageIndex, weaponId) {
  const gear = ensureGearStorage();
  const weapon = findWeapon(weaponId);
  if (!gear || !weapon) return;
  const attachment = gear.storageAttachments[storageIndex];
  if (!attachment || weapon.attachments.length >= MAX_ATTACHMENTS) return;
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

function buildOfferCard(offer, index) {
  const canAfford = game.gold >= offer.price;
  const card = document.createElement("article");
  card.className = `offer offer-attachment attach-stars-${offer.stars || 1}${offer.taken ? " offer-taken" : ""}${!offer.taken && !canAfford ? " offer-unaffordable" : ""}`;

  const icon = document.createElement("span");
  icon.className = "offer-icon";
  icon.textContent = attachmentIcon(offer.category, offer.stars || 1);

  const headRow = document.createElement("div");
  headRow.className = "offer-head";

  const type = document.createElement("span");
  type.className = "offer-type offer-type-attachment";
  type.textContent = `アタッチメント・${starsLabel(offer.stars)}`;
  headRow.append(type);

  const title = document.createElement("h2");
  title.textContent = offer.name;

  const description = document.createElement("p");
  description.textContent = offer.text;

  const meta = document.createElement("small");
  meta.className = "offer-meta";
  meta.textContent = `${starsLabel(offer.stars)}・${attachmentCategoryLabel(offer.category)}`;

  const price = document.createElement("div");
  price.className = "price";
  const priceAmount = document.createElement("strong");
  priceAmount.className = "price-amount";
  priceAmount.textContent = `${offer.price}G`;
  const owned = document.createElement("span");
  owned.className = "price-owned";
  owned.textContent = `所持 ${game.gold}G`;
  price.append(priceAmount, owned);

  const action = document.createElement("div");
  action.className = "offer-action";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "offer-buy";
  button.textContent = offer.taken ? "補充中" : canAfford ? "購入" : "不足";
  button.disabled = offer.taken || !canAfford;
  button.addEventListener("click", () => buyAttachment(index));
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

export function renderShop() {
  ensureGearStorage();
  updateShopTabs();
  hud.offers.replaceChildren();

  game.offers.forEach((offer, index) => {
    hud.offers.append(buildOfferCard(offer, index));
  });

  renderGearInventory();
  renderStorageInventory();
  updateShopControls();
}

function updateShopTabs() {
  const tab = game.shopTab === "storage" ? "storage" : "shop";
  hud.shopPane?.classList.toggle("hidden", tab !== "shop");
  hud.storagePane?.classList.toggle("hidden", tab !== "storage");
  hud.shopTabShop?.classList.toggle("active", tab === "shop");
  hud.shopTabStorage?.classList.toggle("active", tab === "storage");
  hud.shopTabShop?.setAttribute("aria-selected", tab === "shop" ? "true" : "false");
  hud.shopTabStorage?.setAttribute("aria-selected", tab === "storage" ? "true" : "false");
}

function updateShopControls() {
  if (!hud.shopReroll) return;
  const price = shopRerollPrice();
  const free = price === 0;
  hud.shopReroll.textContent = free ? "更新 無料" : `更新 ${price}G`;
  hud.shopReroll.disabled = !free && game.gold < price;
  if (hud.shopContinue) hud.shopContinue.textContent = isShopTabStorage() ? "次の階層へ" : "倉庫へ";
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
    buildStorageSection("倉庫のアタッチメント", gear.storageAttachments, buildStoredAttachmentCard, "購入したアタッチメントはここに入ります"),
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
  meta.textContent = `${weaponMetaLabel(weapon)} / ${weaponAmmoLabel(weapon)} / アタッチメント ${weapon.attachments.length}`;
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
    button.disabled = weapon.attachments.length >= MAX_ATTACHMENTS || !canAttachToWeapon(definition, weapon);
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
    ? `アタッチメント ${weapon.attachments.length}/${MAX_ATTACHMENTS}`
    : "アタッチメント";
  const attachmentList = document.createElement("div");
  attachmentList.className = "attachment-list";
  const attachments = weapon?.attachments || [];

  const attachmentPips = document.createElement("div");
  attachmentPips.className = "attachment-pips";
  for (let i = 0; i < MAX_ATTACHMENTS; i += 1) {
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

      const detach = document.createElement("button");
      detach.type = "button";
      detach.className = "attachment-detach";
      detach.textContent = "倉庫へ";
      bindPress(detach, () => detachAttachment(weapon.id, agg.indices[0]));

      row.append(chip, detach);
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
    unequip.disabled = game.player.gear.weapons.length <= 1;
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
  const indices = shuffle(WEAPON_POOL.map((_, i) => i)).slice(0, 3);
  game.starterChoices = indices.map((i) => WEAPON_POOL[i]);
}

export function pickStarterWeapon(index) {
  const template = game.starterChoices[index];
  if (!template) return;
  const weapon = createWeapon({ name: template.name, ...template.weapon });
  game.player.gear.weapons = [weapon];
  game.player.gear.activeWeaponIndex = 0;
  game.starterChoices = [];
  game.mode = "fight";
  hud.starterPick.classList.add("hidden");
  updateHud();
}

export function renderStarterPick() {
  hud.starterOffers.replaceChildren();
  const kicker = hud.starterPick.querySelector(".panel-kicker");
  const heading = hud.starterPick.querySelector("h1");
  if (kicker) kicker.textContent = "最初の武器";
  if (heading) heading.textContent = "3つから1つ選んで平原へ";
  game.starterChoices.forEach((template, index) => {
    const card = document.createElement("article");
    card.className = "starter-card offer-weapon";

    const tag = document.createElement("span");
    tag.className = "offer-type offer-type-weapon";
    tag.textContent = "武器";

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
