import { game, keys } from "./state.js";
import { hud } from "./dom.js";
import { readProgress, saveProgress } from "./progression.js";
import { updateHud } from "./hud.js";
import { renderBossReward } from "./arena.js";
import { BuildCombat, COLORS } from "./buildCombat.js";
import { stoneSummary, composeStone } from "./stoneCombat.js";
import { damageEnemy } from "./combat.js";
import { shortestDungeonDelta, wrapDungeonPoint } from "./dungeon.js";
import { grantGold } from "./gold.js";
import { NODE_MAP } from "./buildModel.js";
import {
  WEAPON_MAP,
  AFFIX_MAP,
  equipped,
  profile,
  levelInfo,
  weaponSlots,
  syncLootBuild,
  canEdit,
  equipWeapon,
  startReroll,
  chooseReroll,
  rerollPrice,
  sellWeapon,
  saleValue,
  claimInbox,
  claimBossWeapon,
  collectWeaponDrops,
} from "./lootModel.js";
let selected = null,
  filter = "",
  sort = "new",
  notice = "";
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const button = (text, fn, disabled = false) => {
  const e = el("button", "", text);
  e.onclick = fn;
  e.disabled = disabled;
  return e;
};
const affixLabel = (a) =>
  a ? AFFIX_MAP.get(a.id).name + " " + ["Ⅰ", "Ⅱ", "Ⅲ"][a.rank - 1] : "空き枠";
export function initSkillProgress() {
  const s = readProgress();
  game.gold = s.gold;
  game.loot = s.loot;
  game.lootDirty = false;
  game.lootNotice = "";
  game.treePurchases = { weapon: {} };
  game.skillPaid = {};
  game.activeSkills = [];
  game.masteryRank = 0;
  game.totalSkillPoints = 0;
  game.buildPresets = [];
  game.modeBeforeSkillTree = null;
  game.inventoryOverflow = false;
  game.buildCombat = null;
  collectWeaponDrops(game);
  claimInbox(game);
  syncLootBuild(game);
  selected = game.loot.equippedId;
  saveProgress(game);
}
export function applyPurchasedSkillTreeToActiveWeapon() {
  syncLootBuild(game);
  const p = game.player;
  if (!p) return;
  if (!game.buildCombat)
    game.buildCombat = new BuildCombat(game, {
      delta: (a, b) => shortestDungeonDelta(game.dungeon, a.x, a.y, b.x, b.y),
      wrap: (o) => wrapDungeonPoint(game.dungeon, o),
      damage: (e, v, s) => damageEnemy(e, v, e.x, e.y, 1, 80, s),
      reward: (n) => grantGold(n),
    });
  else game.buildCombat.configure();
  const old = p.maxHp || 30;
  p.buildOriginalMax = 30;
  p.maxHp = Math.round(30 * (game.activeSkills.includes("R04") ? 0.45 : 1));
  p.hp = Math.min(p.maxHp, (p.hp * p.maxHp) / old);
}
export function enterUpgradeTree() {
  if (
    !["arena", "pause", "bossReward", "result", "weaponSelect"].includes(
      game.mode,
    )
  )
    return;
  game.modeBeforeSkillTree = game.mode;
  game.mode = "upgradeTree";
  keys.clear();
  hud.pauseMenu.classList.add("hidden");
  hud.bossReward?.classList.add("hidden");
  hud.gameOver?.classList.add("hidden");
  hud.skillTree.classList.remove("hidden");
  renderSkillTree();
}
export const enterDebugSkillTree = enterUpgradeTree;
export function hideSkillTree() {
  hud.skillTree.classList.add("hidden");
}
export function continueFromSkillTree() {
  if (game.mode !== "upgradeTree") return;
  if (game.loot.inbox.length) {
    notice = "受取待ちの武器を整理してください";
    renderSkillTree();
    return;
  }
  if (
    game.loot.bossOffer &&
    !game.loot.bossOffer.selectedId &&
    (game.runElapsed || 0) === 0 &&
    game.modeBeforeSkillTree !== "bossReward"
  ) {
    notice = "前回のボス報酬を選んでください";
    renderSkillTree();
    return;
  }
  hideSkillTree();
  game.mode = game.modeBeforeSkillTree || "arena";
  game.modeBeforeSkillTree = null;
  game.inventoryOverflow = false;
  keys.clear();
  if (game.mode === "bossReward") renderBossReward();
  if (game.mode === "pause") hud.pauseMenu.classList.remove("hidden");
  if (game.mode === "result") hud.gameOver.classList.remove("hidden");
  updateHud();
}
export function lootAction(fn) {
  const before = JSON.stringify(game.loot),
    gold = game.gold,
    oldId = game.loot.equippedId;
  const result = fn();
  notice = typeof result === "string" ? result : "";
  if (!saveProgress(game)) {
    game.loot = JSON.parse(before);
    game.gold = gold;
    notice =
      "保存できないため変更を取り消しました。保存領域を確認してください。";
  }
  if (oldId !== game.loot.equippedId) game.buildCombat = null;
  applyPurchasedSkillTreeToActiveWeapon();
  if (game.mode === "upgradeTree") renderSkillTree();
  else if (game.mode === "bossReward") renderBossReward();
  updateHud();
  return notice;
}
export function appendBossChoices(panel) {
  const offer = game.loot?.bossOffer;
  if (!offer || offer.selectedId) return;
  panel.append(el("h2", "", "戦利品を1個選ぶ"));
  const row = el("div", "loot-reward-choices");
  for (const w of offer.choices) {
    const def = WEAPON_MAP.get(w.kind),
      card = el("article", "loot-reward-card");
    card.append(
      el("h3", "", def.name),
      el("small", "", `Lv.1 · 品質 ${w.quality}% · 3枠`),
      el("p", "", def.effect),
      el(
        "p",
        "loot-affix-tags",
        w.affixes.filter(Boolean).map(affixLabel).join(" / "),
      ),
      button("この武器を獲得", () =>
        lootAction(() => claimBossWeapon(game, w.uid)),
      ),
    );
    row.append(card);
  }
  panel.append(row);
}
export function renderSkillTree() {
  if (!game.loot) return;
  const panel = hud.skillTree;
  panel.replaceChildren();
  panel.className = "panel loot-panel";
  panel.setAttribute("aria-label", "武器庫");
  const current = equipped(game),
    editable = canEdit(game);
  const head = el("header", "loot-head");
  head.append(
    el("h1", "", "武器庫"),
    el("strong", "", `${game.gold} G`),
    button("戻る", continueFromSkillTree),
  );
  panel.append(head);
  const top = el("div", "loot-equipped-banner");
  top.append(
    el("span", "loot-gem", "◆"),
    el(
      "div",
      "",
      `${WEAPON_MAP.get(current.kind).name} Lv.${levelInfo(current.xp).level} / ${weaponSlots(current)}枠`,
    ),
    el("p", "", stoneSummary(profile(current).ids)),
  );
  panel.append(top);
  panel.append(
    el(
      "p",
      "loot-help",
      editable
        ? "武器を使って育てる。Lv.4・8・12・16・20で装備枠が増えます。"
        : "戦闘中は閲覧できます。交換・リロールはボス撃破後に。",
    ),
  );
  const message = notice || game.lootNotice;
  if (message || game.saveFailed)
    panel.append(
      el(
        "p",
        "build-notice",
        game.saveFailed
          ? "保存できません。ブラウザの保存領域を確認してください。"
          : message,
      ),
    );
  if (game.loot.inbox.length) {
    panel.append(
      el(
        "p",
        "build-notice",
        `受取待ち ${game.loot.inbox.length}個。武器を売却すると自動で受け取ります。`,
      ),
    );
  }
  if (game.loot.bossOffer && !game.loot.bossOffer.selectedId)
    appendBossChoices(panel);
  const settings = el("div", "loot-toolbar"),
    search = el("input");
  search.placeholder = "武器名・効果を検索";
  search.setAttribute("aria-label", "武器を検索");
  search.value = filter;
  search.onchange = () => {
    filter = search.value;
    renderSkillTree();
  };
  const sorting = el("select");
  sorting.setAttribute("aria-label", "並び順");
  for (const [value, label] of [
    ["new", "新着順"],
    ["level", "レベル順"],
    ["quality", "品質順"],
    ["name", "名前順"],
  ]) {
    const o = el("option", "", label);
    o.value = value;
    sorting.append(o);
  }
  sorting.value = sort;
  sorting.onchange = () => {
    sort = sorting.value;
    renderSkillTree();
  };
  settings.append(
    search,
    sorting,
    el("small", "", `所持 ${game.loot.inventory.length}/96`),
    button(
      game.loot.debugFree ? "無料テスト：ON" : "無料テスト：OFF",
      () =>
        lootAction(() => {
          game.loot.debugFree = !game.loot.debugFree;
          return game.loot.debugFree
            ? "リロール無料。経験値と枠解放条件は有効です。"
            : "通常価格に切り替えました";
        }),
      !editable,
    ),
  );
  panel.append(settings);
  const layout = el("div", "loot-layout"),
    list = el("div", "loot-list");
  let visible = game.loot.inventory.filter((w) => {
    const d = WEAPON_MAP.get(w.kind);
    return (d.name + " " + d.effect).includes(filter);
  });
  visible.sort((a, b) =>
    sort === "level"
      ? b.xp - a.xp
      : sort === "quality"
        ? b.quality - a.quality
        : sort === "name"
          ? WEAPON_MAP.get(a.kind).name.localeCompare(
              WEAPON_MAP.get(b.kind).name,
            )
          : Number(b.uid.slice(1)) - Number(a.uid.slice(1)),
  );
  if (!game.loot.inventory.some((w) => w.uid === selected))
    selected = current.uid;
  for (const w of visible) {
    const d = WEAPON_MAP.get(w.kind),
      card = button("", () => {
        selected = w.uid;
        renderSkillTree();
      });
    card.className =
      "loot-weapon-card" +
      (selected === w.uid ? " selected" : "") +
      (current.uid === w.uid ? " equipped" : "");
    card.dataset.weaponId = w.uid;
    card.style.setProperty(
      "--stone-color",
      `rgb(${(COLORS[d.family] || COLORS.H).map((v) => Math.round(v * 255)).join(",")})`,
    );
    card.append(
      el("span", "loot-gem", "◆"),
      el("strong", "", d.name),
      el(
        "small",
        "",
        `Lv.${levelInfo(w.xp).level} · 品質 ${w.quality}% · ${weaponSlots(w)}枠`,
      ),
      el(
        "span",
        "loot-card-status",
        `${current.uid === w.uid ? "装備中 " : ""}${w.protected ? "保護 " : ""}${w.isNew ? "NEW" : ""}`,
      ),
    );
    list.append(card);
  }
  if (!visible.length) list.append(el("p", "", "該当する武器はありません"));
  layout.append(list);
  const w = game.loot.inventory.find((w) => w.uid === selected) || current,
    d = WEAPON_MAP.get(w.kind),
    info = levelInfo(w.xp),
    p = profile(w),
    spec = composeStone(p.ids),
    detail = el("article", "loot-detail");
  detail.append(
    el(
      "small",
      "",
      `${w.kind === "starter" ? "原石" : "固有武器"} · 品質 ${w.quality}%`,
    ),
    el("h2", "", d.name),
    el("p", "", d.effect),
    el(
      "small",
      "",
      `本体に内蔵：${
        d.innate
          .filter((id) => id !== d.id)
          .map((id) => NODE_MAP.get(id).name)
          .join(" / ") || "なし"
      }`,
    ),
  );
  const meter = el("progress");
  meter.max = info.next || 1;
  meter.value = info.next ? info.current : 1;
  meter.setAttribute("aria-label", "武器経験値");
  detail.append(
    el("strong", "", `Lv.${info.level} / 20`),
    meter,
    el(
      "small",
      "",
      info.next
        ? `経験値 ${info.current}/${info.next} · 次の枠：Lv.${[4, 8, 12, 16, 20].find((l) => l > info.level)}`
        : "最大レベル · 8枠解放済み",
    ),
  );
  detail.append(
    el(
      "p",
      "loot-stats",
      `基礎威力 ${(p.power * spec.damage).toFixed(1)} · 基本間隔 ${spec.interval.toFixed(2)}秒 · ${spec.count}発（条件付き補正を除く）`,
    ),
    el("p", "loot-affix-tags", stoneSummary(p.ids)),
  );
  if (w.uid !== current.uid) {
    const cp = profile(current),
      cs = composeStone(cp.ids),
      diff = p.power * spec.damage - cp.power * cs.damage;
    detail.append(
      el(
        "small",
        "",
        `装備中との差：基礎威力 ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} / 発射間隔 ${(spec.interval - cs.interval).toFixed(2)}秒`,
      ),
    );
  }
  detail.append(
    button(
      w.uid === current.uid ? "装備中" : "この武器を装備",
      () => lootAction(() => equipWeapon(game, w.uid)),
      !editable || w.uid === current.uid,
    ),
    button(w.protected ? "保護を解除" : "お気に入り保護", () =>
      lootAction(() => {
        w.protected = !w.protected;
      }),
    ),
    button(
      `売却 ${saleValue(w)} G`,
      () => lootAction(() => sellWeapon(game, w.uid)),
      (!editable && !game.inventoryOverflow) ||
        w.uid === current.uid ||
        w.protected ||
        game.loot.reroll?.uid === w.uid,
    ),
  );
  detail.append(
    el(
      "small",
      "",
      "本体と同じ効果は重複加算されません。段階が高い場合は追加分だけ適用します。",
    ),
  );
  detail.append(
    el(
      "h3",
      "",
      `アタッチメント ${w.affixes.filter(Boolean).length}/${weaponSlots(w)}枠`,
    ),
  );
  for (let i = 0; i < 8; i++) {
    const a = w.affixes[i],
      open = i < weaponSlots(w),
      row = el("section", "loot-slot" + (!open ? " locked" : ""));
    row.append(
      el(
        "strong",
        "",
        open
          ? `${i + 1}. ${affixLabel(a)}`
          : `${i + 1}. Lv.${[4, 8, 12, 16, 20][i - 3]}で解放`,
      ),
    );
    if (open) {
      if (a)
        row.append(
          el(
            "p",
            "",
            AFFIX_MAP.get(a.id)
              .tiers[a.rank - 1].map((id) => NODE_MAP.get(id).effect)
              .join(" "),
          ),
        );
      row.append(
        button(
          `${a ? "この枠をリロール" : "候補を選んで充填"} ${rerollPrice(game, w, i)} G`,
          () => lootAction(() => startReroll(game, w.uid, i)),
          !editable || !!game.loot.reroll,
        ),
      );
    }
    detail.append(row);
  }
  layout.append(detail);
  panel.append(layout);
  const r = game.loot.reroll;
  if (r) {
    const rw = game.loot.inventory.find((w) => w.uid === r.uid),
      box = el("section", "loot-roll-panel");
    box.setAttribute("aria-label", "リロール候補");
    box.append(
      el("h2", "", `${WEAPON_MAP.get(rw.kind).name} / 枠${r.slot + 1}の候補`),
      el(
        "small",
        "",
        `支払済み ${r.cost} G。ほかの枠は変わりません。閉じても候補は保存されます。`,
      ),
    );
    const choices = el("div", "loot-roll-choices");
    r.choices.forEach((a, i) => {
      const b = button(
        "",
        () => lootAction(() => chooseReroll(game, i)),
        !editable,
      );
      b.append(
        el("strong", "", affixLabel(a)),
        el(
          "span",
          "",
          AFFIX_MAP.get(a.id)
            .tiers[a.rank - 1].map((id) => NODE_MAP.get(id).effect)
            .join(" "),
        ),
      );
      choices.append(b);
    });
    box.append(
      choices,
      button(
        `現在の効果を維持：${affixLabel(rw.affixes[r.slot])}`,
        () => lootAction(() => chooseReroll(game, null)),
        !editable,
      ),
    );
    panel.append(box);
  }
}
