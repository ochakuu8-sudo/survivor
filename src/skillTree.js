import { game, keys } from "./state.js";
import { hud } from "./dom.js";
import { readProgress, saveProgress } from "./progression.js";
import { updateHud } from "./hud.js";
import { renderBossReward } from "./arena.js";
import {
  SKILLS,
  RECIPES,
  NODE_MAP,
  FAMILIES,
  FAMILY_IDS,
  WEAPON_NODES,
  closure,
  buyNode,
  costFor,
  canRespec,
  refundNode,
  applyRecipe,
  quoteRecipe,
  buyMastery,
  masteryCost,
  syncBuild,
  equipSpecial,
  unlockSpecial,
} from "./buildModel.js";
import { stoneSummary } from "./stoneCombat.js";
import { BuildCombat } from "./buildCombat.js";
import { DEBUG_FREE_SKILLS } from "./buildSettings.js";
import { damageEnemy } from "./combat.js";
import { shortestDungeonDelta, wrapDungeonPoint } from "./dungeon.js";
import { grantGold } from "./gold.js";
export const WEAPON_SKILL_TREES = { stone: SKILLS };
let selected = "B10",
  filter = "",
  scale = 0.8,
  scroll = { x: 500, y: 250 },
  recipeId = "04",
  notice = "",
  fitMap = false;
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const button = (text, fn, disabled = false) => {
  const b = el("button", "", text);
  b.disabled = disabled;
  b.onclick = fn;
  return b;
};
export function initSkillProgress() {
  const s = readProgress();
  game.debugFreeSkills = DEBUG_FREE_SKILLS;
  game.gold = s.gold;
  game.treePurchases = { weapon: s.purchased };
  game.activeSkills = s.active;
  game.equippedSpecial = s.equippedSpecial;
  game.skillPaid = s.paid;
  game.masteryRank = s.rank;
  game.freeSkillClaimed = s.freeClaimed;
  game.buildPresets = s.presets;
  game.totalSkillPoints = 0;
  game.freeNodeCredits = { weapon: 0 };
  game.modeBeforeSkillTree = null;
  game.buildCombat = null;
}
export function applyPurchasedSkillTreeToActiveWeapon() {
  syncBuild(game);
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
  const old = p.maxHp;
  p.buildOriginalMax = 30 + Math.min(60, (game.masteryRank || 0) * 2);
  p.maxHp = Math.round(
    p.buildOriginalMax * (game.activeSkills.includes("R04") ? 0.45 : 1),
  );
  p.hp = Math.min(p.maxHp, p.hp * (p.maxHp / old));
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
  hideSkillTree();
  game.mode = game.modeBeforeSkillTree || "arena";
  game.modeBeforeSkillTree = null;
  keys.clear();
  if (game.mode === "bossReward") renderBossReward();
  if (game.mode === "pause") hud.pauseMenu.classList.remove("hidden");
  if (game.mode === "result") hud.gameOver.classList.remove("hidden");
  updateHud();
}
function changed(result = "") {
  notice =
    typeof result === "string"
      ? result
      : result === false
        ? "操作できません。条件と所持Gを確認してください。"
        : "";
  applyPurchasedSkillTreeToActiveWeapon();
  saveProgress(game);
  renderSkillTree();
  updateHud();
}
export function purchaseNode(id) {
  if (game.mode !== "upgradeTree") return false;
  const before = new Set(Object.keys(game.treePurchases.weapon));
  const ok = buyNode(game, id);
  if (ok) {
    const unlocked = SKILLS.filter(
      (n) => n.special && game.treePurchases.weapon[n.id] && !before.has(n.id),
    );
    changed(
      unlocked.length
        ? `特殊石を解放：${unlocked.map((n) => n.name).join("・")}。選んで装備できます。`
        : "特性を石ころに追加しました",
    );
  }
  return ok;
}
function position(n) {
  if (n.family === "R") {
    const a = ((Number(n.id.slice(1)) - 1) * Math.PI) / 6;
    return { x: 1100 + Math.cos(a) * 230, y: 1100 + Math.sin(a) * 230 };
  }
  if (n.family === "X") {
    const a = ((Number(n.id.slice(1)) - 1) * Math.PI) / 12;
    return { x: 1100 + Math.cos(a) * 335, y: 1100 + Math.sin(a) * 335 };
  }
  const f = FAMILY_IDS.indexOf(n.family),
    index = Number(n.id.slice(1)) - 1,
    depth = Math.floor(index / 3),
    lane = index % 3,
    a = (f * Math.PI) / 6 - Math.PI / 2 + (lane - 1) * 0.15,
    r = 500 + depth * 145;
  return { x: 1100 + Math.cos(a) * r, y: 1100 + Math.sin(a) * r };
}
export function renderSkillTree() {
  syncBuild(game);
  const panel = hud.skillTree;
  panel.className = "panel gold-skill-panel expanded-tree";
  panel.replaceChildren();
  panel.setAttribute("aria-label", "180ノードのスキルツリー");
  const active = game.activeSkills || [],
    owned = game.treePurchases.weapon,
    editable = canRespec(game);
  const head = el("div", "gold-skill-head");
  head.append(
    el("h1", "", "石の星図"),
    el("strong", "", `${game.gold} G`),
    button("戻る", continueFromSkillTree),
  );
  panel.append(head);
  const info = el(
    "p",
    "economy-summary",
    `特性 ${active.filter((id) => !NODE_MAP.get(id).special).length}/108 · 特殊石解放 ${SKILLS.filter((n) => n.special && owned[n.id]).length}/72 · 特殊石装備 ${game.equippedSpecial ? 1 : 0}/1 · 基礎成長 Lv.${game.masteryRank || 0}`,
  );
  panel.append(info);
  const stoneCard = el("div", "equipped-stone-card");
  stoneCard.append(el("span", "equipped-stone-gem", "◆"));
  const stoneText = el("div", "equipped-stone-text");
  stoneText.append(
    el("small", "", "装備中の石 / 特殊性能は1つ"),
    el("h2", "", NODE_MAP.get(game.equippedSpecial)?.name || "石ころ"),
    el("p", "", stoneSummary(active)),
  );
  if (game.equippedSpecial)
    stoneText.append(
      el("small", "", NODE_MAP.get(game.equippedSpecial).effect),
    );
  else
    stoneText.append(
      el("small", "", "特性を重ね、星形のノードから特殊石を解放しよう。"),
    );
  stoneCard.append(stoneText);
  panel.append(stoneCard);
  panel.append(
    el(
      "p",
      "",
      game.debugFreeSkills
        ? "デバッグ版：特性の習得コストはすべて0 G。特性はすべて同じ石に加算。必要な特性が揃うと特殊石を自動解放。"
        : !game.freeSkillClaimed
          ? "習得0から開始。最初の入口ノードは無料で選べます。"
          : editable
            ? "構成変更・100%返金が可能です。Gと購入済みスキルは再挑戦後も引き継ぎます。"
            : "戦闘中も特性を追加できます。特殊石の交換と返金はボス撃破後に。",
    ),
  );
  if (notice || game.saveFailed)
    panel.append(
      el(
        "p",
        "build-notice",
        game.saveFailed
          ? "保存できません。ブラウザの保存領域を確認してください。"
          : notice,
      ),
    );
  const toolbar = el("div", "tree-toolbar");
  const search = el("input");
  search.placeholder = "名前・効果・IDで検索";
  search.value = filter;
  search.setAttribute("aria-label", "スキルを検索");
  search.onchange = () => {
    filter = search.value;
    renderSkillTree();
  };
  toolbar.append(search);
  const families = el("select");
  families.setAttribute("aria-label", "領域へ移動");
  families.append(el("option", "", "領域へ移動…"));
  FAMILY_IDS.forEach((id, i) => {
    const o = el("option", "", `${id} · ${FAMILIES[i]}`);
    o.value = id;
    families.append(o);
  });
  families.onchange = () => {
    const n = NODE_MAP.get(families.value + "01");
    if (n) {
      selected = n.id;
      const p = position(n);
      scroll = {
        x: Math.max(0, p.x * scale - 280),
        y: Math.max(0, p.y * scale - 150),
      };
      renderSkillTree();
    }
  };
  toolbar.append(families);
  toolbar.append(
    button("−", () => {
      scale = Math.max(0.14, scale - 0.15);
      renderSkillTree();
    }),
    button("+", () => {
      scale = Math.min(1.4, scale + 0.15);
      renderSkillTree();
    }),
    button("全体", () => {
      fitMap = true;
      scroll = { x: 0, y: 0 };
      renderSkillTree();
    }),
  );
  panel.append(toolbar);
  const layout = el("div", "constellation-layout"),
    viewport = el("div", "constellation-viewport"),
    spacer = el("div", "constellation-spacer"),
    map = el("div", "constellation-map");
  map.style.width = "2200px";
  map.style.height = "2200px";
  map.style.transform = `scale(${scale})`;
  spacer.style.width = 2200 * scale + "px";
  spacer.style.height = 2200 * scale + "px";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 2200 2200");
  svg.classList.add("constellation-lines");
  const recipe = RECIPES.find((r) => r.id === recipeId) || RECIPES[0];
  const route = new Set(closure([selected]));
  for (const n of SKILLS) {
    const to = position(n);
    for (const id of n.requires_all) {
      const from = position(NODE_MAP.get(id)),
        path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
      path.setAttribute(
        "class",
        "constellation-link" +
          (n.family === "X" ? " bridge" : "") +
          (active.includes(n.id) ? " owned" : "") +
          (route.has(n.id) ? " route" : ""),
      );
      svg.append(path);
    }
  }
  map.append(svg);
  const hub = el("div", "constellation-hub", "◆");
  hub.style.left = "1100px";
  hub.style.top = "1100px";
  map.append(hub);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2,
      label = el(
        "div",
        "tree-family-label",
        `${FAMILY_IDS[i]} · ${FAMILIES[i]}`,
      );
    label.style.left = 1100 + Math.cos(a) * 1040 + "px";
    label.style.top = 1100 + Math.sin(a) * 1040 + "px";
    map.append(label);
  }
  SKILLS.forEach((n) => {
    const p = position(n),
      match =
        !filter ||
        `${n.id} ${n.name} ${n.effect}`
          .toLowerCase()
          .includes(filter.toLowerCase());
    const available =
      n.requires_all.every((id) => owned[id]) && game.gold >= costFor(game, n);
    const b = button("", () => {
      selected = n.id;
      if (n.special) recipeId = RECIPES.find((r) => r.specialId === n.id).id;
      renderSkillTree();
    });
    b.className =
      "constellation-node " +
      (owned[n.id] ? "owned" : available ? "available" : "locked") +
      (game.equippedSpecial === n.id ? " equipped" : "") +
      (selected === n.id ? " selected" : "") +
      (n.major ? " final-node" : "") +
      (!match ? " dimmed" : "");
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    b.setAttribute(
      "aria-label",
      `${n.id} ${n.name} ${n.special ? (game.equippedSpecial === n.id ? "装備中" : owned[n.id] ? "解放済み" : "未解放") : owned[n.id] ? "習得済み" : costFor(game, n) + "G"}`,
    );
    b.setAttribute("aria-pressed", String(selected === n.id));
    b.dataset.nodeId = n.id;
    b.append(
      el(
        "span",
        "node-gem",
        n.special
          ? "✦"
          : n.family === "X"
            ? "∞"
            : n.family === "R"
              ? "◇"
              : WEAPON_NODES.has(n.id)
                ? "◆"
                : "○",
      ),
      el("span", "node-title", n.name),
      el(
        "span",
        "node-cost",
        `${n.id} · ${n.special ? (game.equippedSpecial === n.id ? "装備中" : owned[n.id] ? "解放済" : n.requires_all.filter((id) => owned[id]).length + "/" + n.requires_all.length) : owned[n.id] ? "習得済" : costFor(game, n) + " G"}`,
      ),
    );
    map.append(b);
  });
  spacer.append(map);
  viewport.append(spacer);
  layout.append(viewport);
  viewport.addEventListener("scroll", () => {
    scroll = { x: viewport.scrollLeft, y: viewport.scrollTop };
  });
  let drag = null,
    moved = false;
  viewport.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = {
      x: e.clientX,
      y: e.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    moved = false;
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      moved = true;
      viewport.setPointerCapture(e.pointerId);
    }
    if (moved) {
      viewport.scrollLeft = drag.left - dx;
      viewport.scrollTop = drag.top - dy;
    }
  });
  viewport.addEventListener("pointerup", () => {
    drag = null;
  });
  viewport.addEventListener("pointercancel", () => {
    drag = null;
  });
  viewport.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );
  const n = NODE_MAP.get(selected) || SKILLS[0],
    detail = el("article", "gold-node constellation-detail");
  detail.append(
    el("small", "", `${n.id} / ${FAMILIES[FAMILY_IDS.indexOf(n.family)]}`),
    el("h2", "", n.name),
    el("p", "", n.effect),
    el(
      "small",
      "",
      `${n.special ? "特殊石 · 全条件を満たすと自動解放" : "通常特性 · 習得すると石に常時適用"}`,
    ),
  );
  if (n.requires_all.length) {
    detail.append(
      el(
        "h3",
        "",
        n.special
          ? `解放条件 ${n.requires_all.filter((id) => owned[id]).length}/${n.requires_all.length}（すべて必要）`
          : "前提ノード",
      ),
    );
    for (const id of n.requires_all) {
      const parent = NODE_MAP.get(id);
      detail.append(
        button(`${owned[id] ? "✓" : "○"} ${parent.name}`, () => {
          selected = id;
          renderSkillTree();
        }),
      );
    }
  }
  if (n.special) {
    detail.append(
      button(
        game.equippedSpecial === n.id
          ? "特殊石を外す"
          : owned[n.id]
            ? "この特殊石を装備"
            : "未解放：条件を揃えよう",
        () =>
          changed(
            equipSpecial(game, game.equippedSpecial === n.id ? null : n.id),
          ),
        !owned[n.id] || !editable,
      ),
    );
    if (!owned[n.id])
      detail.append(
        el("small", "", "各条件を押すと、その特性までのルートを確認できます。"),
      );
    if (!editable)
      detail.append(
        el("small", "", "交換は出撃前・ボス撃破後・結果画面で可能です。"),
      );
  } else if (!owned[n.id])
    detail.append(
      button(
        `習得 ${costFor(game, n)} G`,
        () => purchaseNode(n.id),
        game.gold < costFor(game, n) || n.requires_all.some((id) => !owned[id]),
      ),
    );
  else
    detail.append(
      el("p", "trait-applied", "✓ この特性は石ころに適用中"),
      button(
        `この特性と依存する特性を返金`,
        () => changed(refundNode(game, n.id)),
        !editable,
      ),
    );
  detail.append(el("h3", "", "特殊石図鑑 72"));
  const select = el("select");
  select.setAttribute("aria-label", "特殊石図鑑");
  RECIPES.forEach((r) => {
    const o = el("option", "", `${r.id} ${r.name}`);
    o.value = r.id;
    select.append(o);
  });
  select.value = recipeId;
  select.onchange = () => {
    recipeId = select.value;
    selected = RECIPES.find((r) => r.id === recipeId).core[0];
    renderSkillTree();
  };
  detail.append(
    select,
    el("p", "", recipe.play),
    el("small", "", recipe.weakness_and_boss),
  );
  const needed = closure([recipe.specialId]).filter(
    (id) => !NODE_MAP.get(id).special,
  );
  const q = quoteRecipe(game, {
    core: [...active.filter((id) => !NODE_MAP.get(id).special), ...needed],
  });
  detail.append(
    el(
      "small",
      "",
      `未習得の前提をまとめて習得：${q.cost} G（いまの特性は残ります）`,
    ),
    button(
      owned[recipe.specialId]
        ? "解放済み：特殊石を装備"
        : `前提をまとめて習得 ${q.cost} G`,
      () =>
        changed(
          owned[recipe.specialId]
            ? equipSpecial(game, recipe.specialId)
            : unlockSpecial(game, recipe.specialId),
        ),
      q.balance < 0 || (owned[recipe.specialId] && !editable),
    ),
  );
  detail.append(
    el("h3", "", "共通成長"),
    el(
      "small",
      "",
      `どの構成にも有効 · 威力 ×${(1.25 ** (game.masteryRank || 0)).toFixed(2)}`,
    ),
    button(
      `基礎成長 +1 / ${masteryCost(game)} G`,
      () => changed(buyMastery(game)),
      game.gold < masteryCost(game),
    ),
  );
  detail.append(
    el("h3", "", "保存構成"),
    el(
      "small",
      "",
      "読込は通常特性も保存時の構成へ振り直します。差額は全額返金。",
    ),
  );
  for (let i = 0; i < 6; i++) {
    const row = el("div", "preset-row");
    row.append(
      button(`保存 ${i + 1}`, () => {
        game.buildPresets[i] = {
          name: `構成 ${i + 1}`,
          core: [...game.activeSkills],
        };
        changed();
      }),
      button(
        game.buildPresets[i]?.name || "空き",
        () => changed(applyRecipe(game, game.buildPresets[i])),
        !editable || !game.buildPresets[i],
      ),
    );
    detail.append(row);
  }
  if (import.meta.env?.DEV) {
    detail.append(
      el("h3", "", "デバッグ"),
      button("習得・G・基礎成長を0へ", () => {
        game.gold = 0;
        game.treePurchases.weapon = {};
        game.activeSkills = [];
        game.equippedSpecial = null;
        game.skillPaid = {};
        game.masteryRank = 0;
        game.freeSkillClaimed = false;
        game.totalSkillPoints = 0;
        game.buildCombat = null;
        changed();
      }),
      button("テスト用 +1000 G", () => {
        game.gold += 1000;
        changed();
      }),
    );
  }
  layout.append(detail);
  panel.append(layout);
  if (fitMap && viewport.clientWidth) {
    fitMap = false;
    scale = Math.min(viewport.clientWidth, viewport.clientHeight) / 2200;
    map.style.transform = `scale(${scale})`;
    spacer.style.width = 2200 * scale + "px";
    spacer.style.height = 2200 * scale + "px";
  }
  viewport.scrollLeft = scroll.x;
  viewport.scrollTop = scroll.y;
}
