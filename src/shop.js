import {
  MAX_WEAPONS,
  MAX_WEAPON_ATTACHMENTS,
} from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { clamp } from "./utils/math.js";
import { createWeapon, weaponKindLabel } from "./weapons.js";
import {
  ACTIVE_ATTACHMENTS,
  addAttachmentToWeapon,
  attachmentCategoryLabel,
  findAttachmentDefinition,
  MAX_ATTACHMENT_LEVEL,
  pickShopAttachment,
  recomputeAllAttachments,
  starsLabel,
} from "./attachments.js";
import { updateHud } from "./hud.js";
import { startNextWave } from "./game.js";

export const WEAPON_POOL = [
  {
    name: "石",
    text: "重い石を山なりに投げる。一回跳弾して別の敵を狙う。",
    weapon: {
      damage: 40,
      fireRate: 0.72,
      bulletSpeed: 320,
      life: 1.45,
      radius: 12,
      kick: 2.2,
      ricochet: 1,
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
      knockback: 12,
      bulletTint: [1, 0.86, 0.6],
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
      bulletSpeed: 1,
      range: 195,
      cone: 0.62,
      kick: 1.2,
      effectTint: [1, 0.42, 0.12],
      effectGlow: "glowRed",
    },
  },
  {
    name: "次元爆弾",
    text: "その場に爆弾を設置し、消えるまで一定間隔で爆発する。",
    weapon: {
      kind: "pulseBomb",
      damage: 0,
      explosionDamage: 30,
      fireRate: 0.32,
      bulletSpeed: 0,
      range: 240,
      duration: 4.6,
      fuse: 0.55,
      tickRate: 1.4,
      radius: 14,
      explosionRadius: 110,
      kick: 1.8,
      bulletTint: [0.86, 0.78, 1],
      bulletGlow: "glowCyan",
      effectTint: [0.84, 0.58, 1],
      effectGlow: "glowRed",
    },
  },
  {
    name: "時限爆弾",
    text: "その場に爆弾を置く。約2秒後に広めの範囲を一発で爆破する。",
    weapon: {
      kind: "timedBomb",
      damage: 0,
      explosionDamage: 64,
      fireRate: 0.42,
      bulletSpeed: 0,
      fuse: 2.2,
      life: 2.2,
      range: 260,
      radius: 15,
      explosionRadius: 185,
      kick: 3.6,
      bulletTint: [0.95, 0.72, 0.34],
      bulletGlow: "glowRed",
      effectTint: [1, 0.52, 0.16],
      effectGlow: "glowRed",
    },
  },
  {
    name: "持続レーザー",
    text: "設置した光線がしばらく残り、触れた敵を連続で焼く。",
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
    weapon: {
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
    name: "ソード",
    text: "長いクールダウン後に前方を大きく薙ぐ一撃武器。",
    weapon: {
      kind: "sword",
      damage: 80,
      fireRate: 0.4,
      bulletSpeed: 1,
      range: 165,
      cone: 0.72,
      kick: 3.6,
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

export function generateOffers() {
  const picks = [];
  const seen = new Set();
  let guard = 0;
  while (picks.length < 3 && guard < 80) {
    const choice = pickShopAttachment(game.wave);
    guard += 1;
    if (!choice) continue;
    if (seen.has(choice.definition.key)) continue;
    seen.add(choice.definition.key);
    picks.push({
      definition: choice.definition,
      stars: choice.stars,
      name: choice.definition.name,
      text: choice.definition.text,
      category: choice.definition.category,
      taken: false,
    });
  }
  game.offers = picks;
}

export function pickReward(index) {
  const offer = game.offers[index];
  if (!offer || offer.taken) return;
  const weapon = game.player.gear.weapons[0];
  if (!weapon) return;
  const definition = offer.definition;
  if (weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return;
  if (!addAttachmentToWeapon(weapon, { key: definition.key, stars: offer.stars })) return;
  offer.taken = true;
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  startNextWave();
}

export function detachAttachment(weaponId, attachmentIndex) {
  const weapon = findWeapon(weaponId);
  if (!weapon) return;
  if (!weapon.attachments[attachmentIndex]) return;
  weapon.attachments.splice(attachmentIndex, 1);
  recomputeAllAttachments();
  renderShop();
  updateHud();
}

export function mergeWeaponAttachment(weaponId, key, level) {
  if (level >= MAX_ATTACHMENT_LEVEL) return;
  const weapon = findWeapon(weaponId);
  if (!weapon) return;
  const matches = [];
  weapon.attachments.forEach((att, idx) => {
    if (att.key === key && (att.level || 1) === level) matches.push({ att, idx });
  });
  if (matches.length < 2) return;
  const removeIndices = matches.slice(0, 2).map((m) => m.idx).sort((a, b) => b - a);
  for (const idx of removeIndices) weapon.attachments.splice(idx, 1);
  const definition = findAttachmentDefinition(key);
  weapon.attachments.push({
    key,
    name: definition?.name || matches[0].att.name,
    stars: matches[0].att.stars || definition?.stars || 1,
    category: matches[0].att.category || definition?.category || "stat",
    level: level + 1,
  });
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
    const level = att.level || 1;
    const groupKey = `${att.key}-${level}`;
    if (!map.has(groupKey)) {
      map.set(groupKey, { ...att, level, count: 1, indices: [idx] });
    } else {
      const entry = map.get(groupKey);
      entry.count += 1;
      entry.indices.push(idx);
    }
  });
  return Array.from(map.values());
}

function attachmentLabelText(agg) {
  let text = agg.name;
  if (agg.level > 1) text += ` Lv${agg.level}`;
  if (agg.count > 1) text += ` ×${agg.count}`;
  return text;
}

function buildOfferCard(offer, index) {
  const card = document.createElement("article");
  card.className = `offer offer-attachment attach-stars-${offer.stars || 1}${offer.taken ? " offer-taken" : ""}`;

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

  card.append(headRow, title, description, meta);

  const action = document.createElement("div");
  action.className = "offer-action";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "offer-buy";
  const weapon = game.player.gear.weapons[0];
  const slotsFull = weapon && weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS;
  button.textContent = offer.taken ? "選択済" : slotsFull ? "枠が満杯" : "選ぶ";
  button.disabled = offer.taken || slotsFull;
  button.addEventListener("click", () => pickReward(index));
  action.append(button);

  card.append(action);
  return card;
}

export function renderShop() {
  hud.shopCash.textContent = String(game.money);
  hud.offers.replaceChildren();

  game.offers.forEach((offer, index) => {
    hud.offers.append(buildOfferCard(offer, index));
  });

  renderGearInventory();
}

function renderGearInventory() {
  hud.gearInventory.replaceChildren();
  const gear = game.player.gear;
  const board = document.createElement("div");
  board.className = "loadout-board";

  const weapon = gear.weapons[0];
  const slot = document.createElement("article");
  slot.className = `weapon-slot ${weapon ? "weapon-slot-filled" : "weapon-slot-empty"}`;

  const top = document.createElement("div");
  top.className = "weapon-slot-top";
  const label = document.createElement("span");
  label.className = "slot-index";
  label.textContent = "装備武器";
  const status = document.createElement("span");
  status.className = `slot-status ${weapon ? "slot-status-equipped" : "slot-status-empty"}`;
  status.textContent = weapon ? "装備中" : "未装備";
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
      detach.textContent = "外す";
      detach.addEventListener("click", () => detachAttachment(weapon.id, agg.indices[0]));

      row.append(chip, detach);

      if (agg.count >= 2 && agg.level < MAX_ATTACHMENT_LEVEL) {
        const merge = document.createElement("button");
        merge.type = "button";
        merge.className = "attachment-merge";
        merge.textContent = `合成 → Lv${agg.level + 1}`;
        merge.addEventListener("click", () => mergeWeaponAttachment(weapon.id, agg.key, agg.level));
        row.append(merge);
      }

      attachmentList.append(row);
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
  hud.gearInventory.append(board);
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
  if (heading) heading.textContent = "3つから1つ選んで夜街へ";
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
