import {
  MAX_WEAPONS,
  MAX_WEAPON_ATTACHMENTS,
  OFFER_TYPE_LABELS,
} from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { clamp } from "./utils/math.js";
import { createWeapon, findWeapon, weaponKindLabel } from "./weapons.js";
import {
  addAttachmentToWeapon,
  attachmentCategoryLabel,
  pickShopAttachment,
  rarityLabel,
  rarityShortLabel,
  recomputeAllAttachments,
} from "./attachments.js";
import { updateHud } from "./hud.js";

const ATTACHMENT_RARITY_BASE_COST = {
  normal: 11,
  rare: 22,
  epic: 38,
  legend: 60,
};

const SHOP_WEAPON_COUNT = 2;
const SHOP_ATTACHMENT_COUNT = 4;

const WEAPON_POOL = [
  {
    name: "豆鉄砲",
    text: "短射程のマシンガン。軽い弾を近距離にばらまく。",
    baseCost: 14,
    weapon: {
      damage: 5,
      fireRate: 8.2,
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
    name: "ショットガン",
    text: "近距離で群れを薙ぎ払う。複数弾が扇状に広がる。",
    baseCost: 22,
    weapon: {
      damage: 10,
      fireRate: 0.9,
      bulletSpeed: 580,
      life: 0.42,
      range: 270,
      projectiles: 5,
      spread: 0.28,
      radius: 8,
      kick: 2.6,
      bulletTint: [1, 0.86, 0.6],
      bulletGlow: "glowAmber",
    },
  },
  {
    name: "火炎放射器",
    text: "前方に炎を吹きつける。近くの群れをまとめて焼く。",
    baseCost: 22,
    weapon: {
      kind: "flame",
      damage: 6,
      fireRate: 5.5,
      bulletSpeed: 1,
      range: 195,
      cone: 0.62,
      kick: 1.2,
      effectTint: [1, 0.42, 0.12],
      effectGlow: "glowRed",
    },
  },
  {
    name: "レーザー照射器",
    text: "一直線に焼き切る。列になった敵をまとめて貫く。",
    baseCost: 26,
    weapon: {
      kind: "laser",
      damage: 32,
      fireRate: 0.78,
      bulletSpeed: 1,
      range: 640,
      pierce: 8,
      lineWidth: 22,
      kick: 2.2,
      effectTint: [0.48, 1, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "次元爆弾",
    text: "着弾すると空間が弾ける。爆心の周囲をまとめて巻き込む。",
    baseCost: 28,
    weapon: {
      kind: "bomb",
      damage: 8,
      explosionDamage: 44,
      fireRate: 0.55,
      bulletSpeed: 380,
      life: 0.92,
      range: 420,
      radius: 12,
      explosionRadius: 132,
      kick: 3.4,
      bulletTint: [0.75, 0.78, 1],
      bulletGlow: "glowCyan",
      effectTint: [0.84, 0.58, 1],
      effectGlow: "glowRed",
    },
  },
  {
    name: "時限爆弾",
    text: "その場に爆弾を置く。数秒後に広い範囲を爆破する。",
    baseCost: 25,
    weapon: {
      kind: "timedBomb",
      damage: 0,
      explosionDamage: 54,
      fireRate: 0.42,
      bulletSpeed: 0,
      fuse: 2.2,
      life: 2.2,
      range: 260,
      radius: 15,
      explosionRadius: 150,
      kick: 3.4,
      bulletTint: [0.95, 0.72, 0.34],
      bulletGlow: "glowRed",
      effectTint: [1, 0.52, 0.16],
      effectGlow: "glowRed",
    },
  },
  {
    name: "設置レーザー",
    text: "設置した光線がしばらく残り、触れた敵を連続で焼く。",
    baseCost: 27,
    weapon: {
      kind: "sustainedLaser",
      damage: 18,
      fireRate: 0.48,
      bulletSpeed: 1,
      range: 560,
      lineWidth: 18,
      duration: 1.35,
      tickRate: 8,
      pierce: 8,
      kick: 2.0,
      effectTint: [0.48, 1, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "モーニングスター",
    text: "自分の周囲を回る鉄球で、近くの敵を巻き込む。",
    baseCost: 21,
    weapon: {
      kind: "orbit",
      damage: 20,
      fireRate: 2.6,
      bulletSpeed: 1,
      range: 145,
      areaRadius: 38,
      orbitRadius: 82,
      orbitSpeed: 4.6,
      kick: 1.5,
      effectTint: [0.84, 0.88, 1],
      effectGlow: "glowCyan",
    },
  },
  {
    name: "ソード",
    text: "自身の前方を扇形に斬る。近距離の敵をまとめて払う。",
    baseCost: 18,
    weapon: {
      kind: "sword",
      damage: 24,
      fireRate: 1.35,
      bulletSpeed: 1,
      range: 135,
      cone: 0.66,
      kick: 2.1,
      effectTint: [0.74, 0.96, 1],
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

function rollWeaponCost(baseCost) {
  return Math.max(4, Math.round(baseCost * (1 + game.wave * 0.14) + Math.random() * 4));
}

function rollAttachmentCost(rarity) {
  const base = ATTACHMENT_RARITY_BASE_COST[rarity] ?? ATTACHMENT_RARITY_BASE_COST.normal;
  return Math.max(5, Math.round(base * (1 + game.wave * 0.12) + Math.random() * 4));
}

function makeWeaponOffer() {
  const used = new Set(game.player.gear.weapons.map((weapon) => weapon.name));
  const candidates = WEAPON_POOL.filter((entry) => !used.has(entry.name));
  if (candidates.length === 0) return null;
  const template = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    type: "weapon",
    name: template.name,
    text: template.text,
    weapon: template.weapon,
    cost: rollWeaponCost(template.baseCost),
    bought: false,
    pinned: false,
  };
}

function makeAttachmentOffer() {
  const pick = pickShopAttachment(game.wave);
  if (!pick) return null;
  return {
    type: "attachment",
    name: pick.definition.name,
    text: pick.definition.text,
    definition: pick.definition,
    rarity: pick.rarity,
    category: pick.definition.category,
    cost: rollAttachmentCost(pick.rarity),
    bought: false,
    pinned: false,
  };
}

function pinnedOfferSnapshot() {
  if (!game.pinnedOffer) return null;
  return { ...game.pinnedOffer, bought: false, pinned: true };
}

export function generateOffers() {
  const picks = [];
  const usedWeaponNames = new Set();

  for (let i = 0; i < SHOP_WEAPON_COUNT; i += 1) {
    const offer = makeWeaponOffer();
    if (!offer) continue;
    if (usedWeaponNames.has(offer.name)) {
      i -= 1;
      continue;
    }
    usedWeaponNames.add(offer.name);
    picks.push(offer);
  }

  for (let i = 0; i < SHOP_ATTACHMENT_COUNT; i += 1) {
    const offer = makeAttachmentOffer();
    if (!offer) continue;
    picks.push(offer);
  }

  const pinned = pinnedOfferSnapshot();
  let injected = false;
  if (pinned) {
    if (pinned.type === "weapon" && !usedWeaponNames.has(pinned.name) && game.player.gear.weapons.length < MAX_WEAPONS) {
      const slot = picks.findIndex((offer) => offer.type === "weapon");
      if (slot >= 0) picks[slot] = pinned;
      else picks.push(pinned);
      injected = true;
    } else if (pinned.type === "attachment") {
      const slot = picks.findIndex((offer) => offer.type === "attachment");
      if (slot >= 0) picks[slot] = pinned;
      else picks.push(pinned);
      injected = true;
    }
    if (!injected) game.pinnedOffer = null;
  }

  game.offers = shuffle(picks);
}

export function rerollCost() {
  return Math.floor(4 + game.wave * 1.5 + game.rerolls * 3);
}

export function togglePinOffer(index) {
  const offer = game.offers[index];
  if (!offer || offer.bought) return;

  if (offer.pinned) {
    offer.pinned = false;
    game.pinnedOffer = null;
  } else {
    game.offers.forEach((other) => {
      if (other !== offer) other.pinned = false;
    });
    offer.pinned = true;
    game.pinnedOffer = { ...offer, bought: false, pinned: true };
  }
  renderShop();
}

export function buyOffer(index, weaponId = null) {
  const offer = game.offers[index];
  if (!offer || offer.bought) return;

  if (offer.type === "weapon") {
    if (!canBuyOffer(offer)) return;
    game.money -= offer.cost;
    offer.bought = true;
    if (offer.pinned) {
      offer.pinned = false;
      game.pinnedOffer = null;
    }
    applyWeaponOffer(offer);
    afterPurchase();
    return;
  }

  if (offer.type === "attachment") {
    const weapon = findWeapon(weaponId);
    if (!canBuyAttachmentOnWeapon(offer, weapon)) return;
    game.money -= offer.cost;
    offer.bought = true;
    if (offer.pinned) {
      offer.pinned = false;
      game.pinnedOffer = null;
    }
    applyAttachmentOffer(offer, weapon);
    afterPurchase();
  }
}

function afterPurchase() {
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

export function canBuyOffer(offer) {
  if (!offer || offer.bought || game.money < offer.cost) return false;
  if (offer.type === "weapon") {
    if (game.player.gear.weapons.length >= MAX_WEAPONS) return false;
    if (game.player.gear.weapons.some((weapon) => weapon.name === offer.name)) return false;
    return true;
  }
  if (offer.type === "attachment") {
    return game.player.gear.weapons.some((weapon) => weapon.attachments.length < MAX_WEAPON_ATTACHMENTS);
  }
  return false;
}

function canBuyAttachmentOnWeapon(offer, weapon) {
  if (!offer || offer.type !== "attachment" || offer.bought) return false;
  if (game.money < offer.cost) return false;
  if (!weapon || weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return false;
  return true;
}

function applyWeaponOffer(offer) {
  game.player.gear.weapons.push(createWeapon({ name: offer.name, ...offer.weapon }));
  recomputeAllAttachments();
}

function applyAttachmentOffer(offer, weapon) {
  addAttachmentToWeapon(weapon, {
    key: offer.definition.key,
    rarity: offer.rarity,
    definition: offer.definition,
  });
}

function buildOfferCard(offer, index) {
  const card = document.createElement("article");
  card.className = `offer offer-${offer.type}${offer.pinned ? " offer-pinned" : ""}`;
  if (offer.type === "attachment") {
    card.classList.add(`attach-rarity-${offer.rarity || "normal"}`);
  }
  card.dataset.expanded = offer.expanded ? "true" : "false";

  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = "offer-summary";

  const summaryType = document.createElement("span");
  summaryType.className = `offer-type offer-type-${offer.type}`;
  summaryType.textContent = offer.type === "attachment"
    ? `${OFFER_TYPE_LABELS.attachment}・${rarityShortLabel(offer.rarity)}`
    : OFFER_TYPE_LABELS[offer.type] || "装備";

  const summaryName = document.createElement("strong");
  summaryName.className = "offer-summary-name";
  summaryName.textContent = offer.name;

  const summaryPrice = document.createElement("span");
  summaryPrice.className = "offer-summary-price";
  summaryPrice.textContent = offer.bought ? "売切" : `${offer.cost}枚`;

  const chevron = document.createElement("span");
  chevron.className = "offer-summary-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾";

  summary.append(summaryType, summaryName, summaryPrice, chevron);
  summary.addEventListener("click", () => {
    const next = card.dataset.expanded === "true" ? "false" : "true";
    card.dataset.expanded = next;
    offer.expanded = next === "true";
  });

  const bodyEl = document.createElement("div");
  bodyEl.className = "offer-body";

  const headRow = document.createElement("div");
  headRow.className = "offer-head";

  const type = document.createElement("span");
  type.className = `offer-type offer-type-${offer.type}`;
  type.textContent = offer.type === "attachment"
    ? `${OFFER_TYPE_LABELS.attachment}・${rarityShortLabel(offer.rarity)}`
    : OFFER_TYPE_LABELS[offer.type] || "装備";

  const pinButton = document.createElement("button");
  pinButton.type = "button";
  pinButton.className = `offer-pin${offer.pinned ? " offer-pin-active" : ""}`;
  pinButton.textContent = offer.pinned ? "ピン解除" : "ピン留め";
  pinButton.disabled = offer.bought;
  pinButton.addEventListener("click", () => togglePinOffer(index));

  headRow.append(type, pinButton);

  const title = document.createElement("h2");
  title.textContent = offer.name;

  const description = document.createElement("p");
  description.textContent = offer.text;

  const meta = document.createElement("small");
  meta.className = "offer-meta";
  if (offer.type === "weapon") {
    meta.textContent = `武器スロット ${game.player.gear.weapons.length}/${MAX_WEAPONS}`;
  } else if (offer.type === "attachment") {
    meta.textContent = `${rarityLabel(offer.rarity)}・${attachmentCategoryLabel(offer.category)}`;
  }

  const price = document.createElement("div");
  price.className = "price";
  const cost = document.createElement("strong");
  cost.textContent = offer.bought ? "売切" : `${offer.cost}枚`;
  price.append(cost);

  bodyEl.append(headRow, title, description, meta, price);

  const action = document.createElement("div");
  action.className = "offer-action";

  if (offer.bought) {
    const tag = document.createElement("span");
    tag.className = "offer-bought-tag";
    tag.textContent = "購入済み";
    action.append(tag);
  } else if (offer.type === "weapon") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "offer-buy";
    button.textContent = "購入";
    button.disabled = !canBuyOffer(offer);
    button.addEventListener("click", () => buyOffer(index));
    action.append(button);
  } else if (offer.type === "attachment") {
    const targets = document.createElement("div");
    targets.className = "offer-targets";

    if (game.player.gear.weapons.length === 0) {
      const note = document.createElement("small");
      note.className = "offer-note";
      note.textContent = "装備先の武器がありません";
      targets.append(note);
    } else {
      game.player.gear.weapons.forEach((weapon) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "offer-target";
        const slotsUsed = weapon.attachments.length;
        button.textContent = `${weapon.name} (${slotsUsed}/${MAX_WEAPON_ATTACHMENTS})`;
        button.disabled = !canBuyAttachmentOnWeapon(offer, weapon);
        button.addEventListener("click", () => buyOffer(index, weapon.id));
        targets.append(button);
      });
    }

    action.append(targets);
  }

  bodyEl.append(action);
  card.append(summary, bodyEl);
  return card;
}

function buildOfferSection(kind, label, accent) {
  const section = document.createElement("section");
  section.className = `offer-section offer-section-${kind}`;

  const heading = document.createElement("h3");
  heading.className = "offer-section-heading";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const count = document.createElement("span");
  count.className = "offer-section-count";
  heading.append(labelEl, count);

  const grid = document.createElement("div");
  grid.className = "offer-grid";

  section.append(heading, grid);
  section.dataset.accent = accent;
  return { section, grid, count };
}

export function renderShop() {
  hud.shopCash.textContent = String(game.money);
  hud.offers.replaceChildren();

  const weaponSection = buildOfferSection("weapons", "武器", "weapon");
  const attachmentSection = buildOfferSection("attachments", "アタッチメント", "attachment");

  let weaponCount = 0;
  let attachmentCount = 0;
  game.offers.forEach((offer, index) => {
    const card = buildOfferCard(offer, index);
    if (offer.type === "weapon") {
      weaponSection.grid.append(card);
      weaponCount += 1;
    } else if (offer.type === "attachment") {
      attachmentSection.grid.append(card);
      attachmentCount += 1;
    }
  });

  weaponSection.count.textContent = weaponCount > 0 ? `${weaponCount}件` : "なし";
  attachmentSection.count.textContent = attachmentCount > 0 ? `${attachmentCount}件` : "なし";

  hud.offers.append(weaponSection.section, attachmentSection.section);

  renderGearInventory();

  const cost = rerollCost();
  hud.reroll.textContent = `リロール ${cost}枚`;
  hud.reroll.disabled = game.money < cost;
  hud.nextWave.disabled = false;
}

function renderGearInventory() {
  hud.gearInventory.replaceChildren();
  const gear = game.player.gear;

  const board = document.createElement("div");
  board.className = "loadout-board";

  for (let index = 0; index < MAX_WEAPONS; index += 1) {
    const weapon = gear.weapons[index];
    const slot = document.createElement("article");
    slot.className = `weapon-slot ${weapon ? "weapon-slot-filled" : "weapon-slot-empty"}`;

    const top = document.createElement("div");
    top.className = "weapon-slot-top";

    const label = document.createElement("span");
    label.className = "slot-index";
    label.textContent = `武器 ${index + 1}`;

    const status = document.createElement("span");
    status.className = `slot-status ${weapon ? "slot-status-equipped" : "slot-status-empty"}`;
    status.textContent = weapon ? "装備中" : "空き";

    top.append(label, status);

    const name = document.createElement("strong");
    name.className = "weapon-slot-name";
    name.textContent = weapon ? weapon.name : "未装備";

    const kind = document.createElement("small");
    kind.className = "weapon-slot-kind";
    kind.textContent = weapon ? weaponKindLabel(weapon) : "武器スロット";

    const attachmentTrack = document.createElement("div");
    attachmentTrack.className = "attachment-track";

    const attachmentTitle = document.createElement("span");
    attachmentTitle.className = "attachment-title";
    attachmentTitle.textContent = weapon
      ? `アタッチメント ${weapon.attachments.length}/${MAX_WEAPON_ATTACHMENTS}`
      : "アタッチメント";

    const attachmentList = document.createElement("div");
    attachmentList.className = "attachment-list";

    const attachments = weapon?.attachments || [];
    if (attachments.length > 0) {
      attachments.forEach((attachment) => {
        const chip = document.createElement("span");
        chip.className = `attach-chip attach-rarity-${attachment.rarity || "normal"}`;

        const rarity = document.createElement("span");
        rarity.className = "attach-rarity-label";
        rarity.textContent = rarityLabel(attachment.rarity);

        const attachmentName = document.createElement("span");
        attachmentName.className = "attach-name";
        attachmentName.textContent = attachment.name;

        chip.append(rarity, attachmentName);
        attachmentList.append(chip);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "attach-chip attach-chip-empty";
      empty.textContent = weapon ? "空き" : "未装着";
      attachmentList.append(empty);
    }

    attachmentTrack.append(attachmentTitle, attachmentList);

    slot.append(top, name, kind, attachmentTrack);
    board.append(slot);
  }

  hud.gearInventory.append(board);
}
