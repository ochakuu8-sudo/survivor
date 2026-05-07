import {
  MAX_WEAPONS,
  MAX_WEAPON_ATTACHMENTS,
  OFFER_TYPE_LABELS,
} from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { clamp } from "./utils/math.js";
import {
  addWeaponPierce,
  boostWeaponImpact,
  createWeapon,
  extendWeaponReach,
  findWeapon,
  weaponKindLabel,
} from "./weapons.js";
import {
  addAttachmentToWeapon,
  attachmentCategoryLabel,
  attachmentEffectSummary,
  attachmentMinimumRarityLabel,
  attachmentRerollCost,
  formatRarityOdds,
  getSelectedAttachmentInfo,
  pickRandomAttachment,
  rarityLabel,
  recomputeWeaponAttachments,
  weaponUpgradeCost,
} from "./attachments.js";
import { updateHud } from "./hud.js";

export function generateOffers() {
  const pool = [
    {
      type: "weapon",
      name: "路地裏ピストル",
      text: "扱いやすい武器。弾の手応えが少し重くなる。",
      baseCost: 12,
      weapon: {
        damage: 24,
        fireRate: 1.45,
        bulletSpeed: 700,
      },
    },
    {
      type: "weapon",
      name: "釘打ち銃",
      text: "連射寄りの武器。短い間隔で弾を撃てる。",
      baseCost: 13,
      weapon: {
        damage: 13,
        fireRate: 2.5,
        bulletSpeed: 650,
      },
    },
    {
      type: "weapon",
      name: "二連バレル",
      text: "散らして撃つ武器。弾数は増えるが、一発は少し軽くなる。",
      baseCost: 24,
      weapon: {
        damage: 14,
        fireRate: 1.18,
        bulletSpeed: 620,
        projectiles: 2,
        spread: 0.2,
      },
    },
    {
      type: "weapon",
      name: "貫通ライフル",
      text: "列を抜く武器。弾が敵を貫きやすくなる。",
      baseCost: 18,
      weapon: {
        damage: 27,
        fireRate: 0.95,
        bulletSpeed: 760,
        pierce: 1,
        life: 0.82,
      },
    },
    {
      type: "weapon",
      name: "サブマシンガン",
      text: "近い敵へ細かい弾幕を浴びせる。狙いは少し暴れるが、群れを削り続ける。",
      baseCost: 19,
      weapon: {
        damage: 8,
        fireRate: 6.2,
        bulletSpeed: 730,
        life: 0.48,
        spread: 0.05,
        jitter: 0.24,
        kick: 1.0,
      },
    },
    {
      type: "weapon",
      name: "火炎放射器",
      text: "前方を炎でなぎ払う。近くの群れにまとめて火をつける。",
      baseCost: 22,
      weapon: {
        kind: "flame",
        damage: 7,
        fireRate: 5.4,
        bulletSpeed: 1,
        range: 185,
        cone: 0.58,
        kick: 1.2,
        effectTint: [1, 0.52, 0.2],
        effectGlow: "glowRed",
      },
    },
    {
      type: "weapon",
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
      type: "weapon",
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
      type: "weapon",
      name: "テスラコイル",
      text: "青い火花が敵から敵へ跳ねる。散った群れにも手が届く。",
      baseCost: 23,
      weapon: {
        kind: "chain",
        damage: 17,
        fireRate: 1.15,
        bulletSpeed: 1,
        range: 430,
        chainCount: 3,
        chainRange: 190,
        kick: 1.7,
        effectTint: [0.45, 0.95, 1],
        effectGlow: "glowCyan",
      },
    },
    {
      type: "weapon",
      name: "回転ノコギリ",
      text: "重い刃を投げる。遅いが敵の列を削りながら進む。",
      baseCost: 21,
      weapon: {
        damage: 20,
        fireRate: 1.0,
        bulletSpeed: 500,
        life: 0.9,
        radius: 13,
        pierce: 3,
        kick: 2.4,
        bulletTint: [0.8, 0.95, 1],
        bulletGlow: "glowCyan",
      },
    },
    {
      type: "attachment",
      name: "改造トリガー",
      text: "引き金を短くし、武器の手数を増やす。",
      baseCost: 13,
      attach: (weapon) => {
        weapon.fireRate *= 1.18;
      },
    },
    {
      type: "attachment",
      name: "密輸弾薬",
      text: "弾薬の質を上げ、着弾の勢いを強める。",
      baseCost: 16,
      attach: (weapon) => {
        boostWeaponImpact(weapon, 5);
        weapon.bulletSpeed *= 1.12;
      },
    },
    {
      type: "attachment",
      name: "貫通クリップ",
      text: "弾が敵の群れを抜けやすくなる。",
      baseCost: 17,
      attach: (weapon) => {
        addWeaponPierce(weapon);
      },
    },
    {
      type: "attachment",
      name: "ロングバレル",
      text: "遠くの敵まで弾が届きやすくなる。",
      baseCost: 14,
      attach: (weapon) => {
        extendWeaponReach(weapon, 1.18);
      },
    },
    {
      type: "relic",
      name: "錆びた守り札",
      text: "倒れにくくなる古いお守り。傷も少し塞がる。",
      baseCost: 14,
      apply: () => {
        game.player.maxHp += 22;
        game.player.hp = clamp(game.player.hp + 22, 1, game.player.maxHp);
      },
    },
    {
      type: "relic",
      name: "割れた防犯バッジ",
      text: "噛まれた時の痛みを和らげる。",
      baseCost: 11,
      apply: () => {
        game.player.armor += 3;
      },
    },
    {
      type: "relic",
      name: "応急テープ",
      text: "戦闘中に少しずつ傷を塞ぐ。",
      baseCost: 18,
      apply: () => {
        game.player.regen += 0.7;
      },
    },
    {
      type: "relic",
      name: "壊れかけの電池",
      text: "危ない力を引き出すが、身を守りにくくなる。",
      baseCost: 15,
      apply: () => {
        game.player.weaponPowerBonus += 8;
        game.player.armor -= 2;
      },
    },
    {
      type: "relic",
      name: "スクラップ磁石",
      text: "落ちたコインがこちらへ寄りやすくなる。",
      baseCost: 9,
      apply: () => {
        game.player.pickup += 34;
      },
    },
    {
      type: "relic",
      name: "軽量スニーカー",
      text: "足回りを軽くして、逃げ回りやすくする。",
      baseCost: 10,
      apply: () => {
        game.player.speed += 22;
      },
    },
  ];

  const activeWeapons = [
    {
      type: "weapon",
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
      type: "weapon",
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
      type: "weapon",
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
      type: "weapon",
      name: "レーザー",
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
      type: "weapon",
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
      type: "weapon",
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

  const activePool = [
    ...activeWeapons,
    ...pool.filter((item) => item.type === "relic"),
  ];

  const picks = [];
  const used = new Set();
  for (const type of game.player.gear.weapons.length < MAX_WEAPONS ? ["weapon", "relic"] : ["relic"]) {
    addOfferPick(activePool, picks, used, type);
  }
  let guard = 0;
  while (picks.length < 4 && guard < 40) {
    addOfferPick(activePool, picks, used);
    guard += 1;
  }
  game.offers = shuffle(picks);
}

function addOfferPick(pool, picks, used, type = "") {
  const candidates = [];
  pool.forEach((offer, index) => {
    if (used.has(index)) return;
    if (type && offer.type !== type) return;
    if (offer.type === "weapon" && game.player.gear.weapons.length >= MAX_WEAPONS) return;
    if (offer.type === "weapon" && game.player.gear.weapons.some((weapon) => weapon.name === offer.name)) return;
    if (offer.type === "attachment" && game.player.gear.weapons.length === 0) return;
    candidates.push(index);
  });
  if (candidates.length === 0) return;

  const index = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(index);
  const template = pool[index];
  const offer = {
    ...template,
    cost: Math.max(4, Math.round(template.baseCost * (1 + game.wave * 0.14) + Math.random() * 4)),
    bought: false,
    choosing: false,
  };
  picks.push(offer);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function rerollCost() {
  return Math.floor(4 + game.wave * 1.5 + game.rerolls * 3);
}

export function buyOffer(index) {
  const offer = game.offers[index];
  if (!offer || !canBuyOffer(offer)) return;

  game.money -= offer.cost;
  offer.bought = true;
  applyOffer(offer);
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

export function canBuyOffer(offer) {
  if (!offer || offer.bought || game.money < offer.cost) return false;
  if (offer.type === "weapon") return game.player.gear.weapons.length < MAX_WEAPONS;
  if (offer.type === "attachment") return false;
  return true;
}

function applyOffer(offer, targetWeapon = null) {
  if (offer.type === "weapon") {
    game.player.gear.weapons.push(createWeapon({ name: offer.name, ...offer.weapon }));
    return;
  }

  if (offer.type === "attachment") {
    const weapon = targetWeapon || findWeapon(offer.targetWeaponId);
    if (!weapon) return;
    addAttachmentToWeapon(weapon, offer);
    return;
  }

  offer.apply();
  game.player.gear.relics.push(offer.name);
}

export function upgradeWeaponAttachment(weaponId) {
  const weapon = findWeapon(weaponId);
  if (!weapon || weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return;
  const cost = weaponUpgradeCost(weapon);
  if (game.money < cost) return;

  const attachment = pickRandomAttachment(weapon.attachments.length);
  const attachmentIndex = weapon.attachments.length;
  if (!addAttachmentToWeapon(weapon, attachment)) return;

  game.money -= cost;
  game.selectedAttachment = { weaponId: weapon.id, attachmentIndex };
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

export function rerollWeaponAttachment(weaponId, attachmentIndex) {
  const weapon = findWeapon(weaponId);
  if (!weapon || !weapon.attachments[attachmentIndex]) return;
  const cost = attachmentRerollCost(weapon);
  if (game.money < cost) return;

  const replacement = pickRandomAttachment(attachmentIndex);
  if (!replacement) return;
  weapon.attachments[attachmentIndex] = {
    key: replacement.definition.key,
    name: replacement.definition.name,
    rarity: replacement.rarity,
    category: replacement.definition.category || "stat",
  };
  recomputeWeaponAttachments(weapon);

  game.money -= cost;
  game.selectedAttachment = { weaponId: weapon.id, attachmentIndex };
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

export function renderShop() {
  hud.shopCash.textContent = String(game.money);
  hud.offers.replaceChildren();

  game.offers.forEach((offer, index) => {
    const card = document.createElement("article");
    card.className = `offer offer-${offer.type}`;

    const type = document.createElement("span");
    type.className = `offer-type offer-type-${offer.type}`;
    type.textContent = OFFER_TYPE_LABELS[offer.type] || "装備";

    const title = document.createElement("h2");
    title.textContent = offer.name;

    const body = document.createElement("p");
    body.textContent = offer.text;

    const meta = document.createElement("small");
    meta.className = "offer-meta";
    meta.textContent = offer.type === "weapon"
      ? `武器スロット ${game.player.gear.weapons.length}/${MAX_WEAPONS}`
      : "プレイヤーが所持";

    const price = document.createElement("div");
    price.className = "price";

    const cost = document.createElement("strong");
    cost.textContent = offer.bought ? "売切" : `${offer.cost}枚`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = offer.bought ? "購入済み" : "購入";
    button.disabled = !canBuyOffer(offer);
    button.addEventListener("click", () => buyOffer(index));

    price.append(cost, button);
    card.append(type, title, body, meta, price);
    hud.offers.append(card);
  });

  renderGearInventory();

  const cost = rerollCost();
  hud.reroll.textContent = `リロール ${cost}枚`;
  hud.reroll.disabled = game.money < cost;
  hud.nextWave.disabled = false;
}

function createAttachmentInfoPanel() {
  const info = getSelectedAttachmentInfo();
  if (!info) return null;

  const { weapon, attachment, definition, attachmentIndex } = info;
  const panel = document.createElement("aside");
  panel.className = `attachment-info-panel attach-rarity-${attachment.rarity || "normal"}`;

  const head = document.createElement("div");
  head.className = "attachment-info-head";

  const titleBlock = document.createElement("div");
  titleBlock.className = "attachment-info-title";

  const rarity = document.createElement("span");
  rarity.className = "attach-rarity-label";
  rarity.textContent = rarityLabel(attachment.rarity);

  const title = document.createElement("strong");
  title.textContent = attachment.name;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "attachment-info-close";
  close.textContent = "閉じる";
  close.addEventListener("click", () => {
    game.selectedAttachment = null;
    renderGearInventory();
  });

  titleBlock.append(rarity, title);
  head.append(titleBlock, close);

  const meta = document.createElement("div");
  meta.className = "attachment-info-meta";
  const slot = document.createElement("span");
  slot.textContent = `${weapon.name} / ${attachmentIndex + 1}枠目`;
  const category = document.createElement("span");
  category.textContent = attachmentCategoryLabel(attachment.category);
  const minimum = document.createElement("span");
  minimum.textContent = `出現: ${attachmentMinimumRarityLabel(definition)}以上`;
  meta.append(slot, category, minimum);

  const text = document.createElement("p");
  text.textContent = definition?.text || "効果情報がまだ設定されていません。";

  const summary = document.createElement("strong");
  summary.className = "attachment-info-summary";
  summary.textContent = attachmentEffectSummary(definition, attachment.rarity);

  const reroll = document.createElement("button");
  reroll.type = "button";
  reroll.className = "attachment-info-reroll";
  const cost = attachmentRerollCost(weapon, attachmentIndex);
  reroll.textContent = `この枠を入替 ${cost}枚`;
  reroll.disabled = game.money < cost;
  reroll.addEventListener("click", () => rerollWeaponAttachment(weapon.id, attachmentIndex));

  panel.append(head, meta, text, summary, reroll);
  return panel;
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
      attachments.forEach((attachment, attachmentIndex) => {
        const row = document.createElement("div");
        row.className = "attachment-row";

        const isSelected = game.selectedAttachment?.weaponId === weapon.id
          && game.selectedAttachment?.attachmentIndex === attachmentIndex;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `attach-chip attach-info-button attach-rarity-${attachment.rarity || "normal"} ${isSelected ? "attach-chip-selected" : ""}`;
        chip.addEventListener("click", () => {
          game.selectedAttachment = { weaponId: weapon.id, attachmentIndex };
          renderGearInventory();
        });

        const rarity = document.createElement("span");
        rarity.className = "attach-rarity-label";
        rarity.textContent = rarityLabel(attachment.rarity);

        const attachmentName = document.createElement("span");
        attachmentName.className = "attach-name";
        attachmentName.textContent = attachment.name;

        chip.append(rarity, attachmentName);

        const rerollButton = document.createElement("button");
        rerollButton.type = "button";
        rerollButton.className = "attachment-reroll";
        const cost = attachmentRerollCost(weapon, attachmentIndex);
        rerollButton.textContent = `入替 ${cost}枚`;
        rerollButton.disabled = game.money < cost;
        rerollButton.addEventListener("click", () => rerollWeaponAttachment(weapon.id, attachmentIndex));

        row.append(chip, rerollButton);
        attachmentList.append(row);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "attach-chip attach-chip-empty";
      empty.textContent = weapon ? "空き" : "未装着";
      attachmentList.append(empty);
    }

    attachmentTrack.append(attachmentTitle, attachmentList);
    if (weapon) {
      const upgradeActions = document.createElement("div");
      upgradeActions.className = "weapon-upgrade-actions";

      const upgradeButton = document.createElement("button");
      upgradeButton.type = "button";
      upgradeButton.className = "weapon-upgrade-button";
      const upgradeCost = weaponUpgradeCost(weapon);
      upgradeButton.textContent = weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS
        ? "強化上限"
        : `強化 ${upgradeCost}枚`;
      upgradeButton.disabled = weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS || game.money < upgradeCost;
      upgradeButton.addEventListener("click", () => upgradeWeaponAttachment(weapon.id));

      const upgradeNote = document.createElement("small");
      upgradeNote.className = "weapon-upgrade-note";
      upgradeNote.textContent = weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS
        ? "装着枠が満杯"
        : `次枠: ${formatRarityOdds(weapon.attachments.length)}`;

      upgradeActions.append(upgradeButton, upgradeNote);
      attachmentTrack.append(upgradeActions);
    }

    slot.append(top, name, kind, attachmentTrack);
    board.append(slot);
  }

  const relicShelf = document.createElement("div");
  relicShelf.className = "relic-shelf";
  const relicLabel = document.createElement("span");
  relicLabel.textContent = "レリック";
  const relicCount = document.createElement("strong");
  relicCount.textContent = `${gear.relics.length}`;
  const relicList = document.createElement("small");
  relicList.textContent = gear.relics.length > 0 ? gear.relics.slice(-5).join(" / ") : "未所持";
  relicShelf.append(relicLabel, relicCount, relicList);

  const attachmentInfoPanel = createAttachmentInfoPanel();
  hud.gearInventory.append(board);
  if (attachmentInfoPanel) hud.gearInventory.append(attachmentInfoPanel);
  hud.gearInventory.append(relicShelf);
}
