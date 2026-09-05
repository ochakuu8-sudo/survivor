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
  validateBuild,
  buyNode,
  costFor,
  canRespec,
  activateNode,
  setBuild,
  refundNode,
  applyRecipe,
  quoteRecipe,
  buyMastery,
  masteryCost,
} from "./buildModel.js";
import { BuildCombat } from "./buildCombat.js";
import { DEBUG_FREE_SKILLS } from "./buildSettings.js";
import { damageEnemy } from "./combat.js";
import { shortestDungeonDelta, wrapDungeonPoint } from "./dungeon.js";
import { grantGold } from "./gold.js";
export const WEAPON_SKILL_TREES = { stone: SKILLS };
let selected = "A01",
  filter = "",
  scale = 0.8,
  scroll = { x: 500, y: 250 },
  recipeId = "01",
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
  const ok = buyNode(game, id);
  if (ok) changed();
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
    `習得 ${Object.keys(owned).length}/180 · 有効 ${active.length}/20 · 大ノード ${active.filter((id) => NODE_MAP.get(id)?.major).length}/4 · 基礎成長 Lv.${game.masteryRank || 0}`,
  );
  panel.append(info);
  panel.append(
    el(
      "p",
      "",
      game.debugFreeSkills
        ? "デバッグ版：全180ノードの習得コストは0。構成の上限と前提は有効です。"
        : !game.freeSkillClaimed
          ? "習得0から開始。最初の入口ノードは無料で選べます。"
          : editable
            ? "構成変更・100%返金が可能です。Gと購入済みスキルは再挑戦後も引き継ぎます。"
            : "戦闘中は追加購入・有効化ができます。取り外しと返金はボス撃破後に。",
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
      renderSkillTree();
    });
    b.className =
      "constellation-node " +
      (owned[n.id] ? "owned" : available ? "available" : "locked") +
      (active.includes(n.id) ? " equipped" : "") +
      (selected === n.id ? " selected" : "") +
      (n.major ? " final-node" : "") +
      (!match ? " dimmed" : "");
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    b.setAttribute(
      "aria-label",
      `${n.id} ${n.name} ${active.includes(n.id) ? "有効" : owned[n.id] ? "購入済み" : costFor(game, n) + "G"}`,
    );
    b.setAttribute("aria-pressed", String(selected === n.id));
    b.dataset.nodeId = n.id;
    b.append(
      el(
        "span",
        "node-gem",
        active.includes(n.id)
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
        `${n.id} · ${active.includes(n.id) ? "有効" : owned[n.id] ? "✓" : costFor(game, n) + " G"}`,
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
      `${n.major ? "大ノード · " : ""}${WEAPON_NODES.has(n.id) ? "武装 · " : ""}前提：${n.requires_all.map((id) => NODE_MAP.get(id).name).join(" ＋ ") || "なし"}`,
    ),
  );
  if (!owned[n.id])
    detail.append(
      button(
        `習得 ${costFor(game, n)} G`,
        () => purchaseNode(n.id),
        game.gold < costFor(game, n) || n.requires_all.some((id) => !owned[id]),
      ),
    );
  else {
    detail.append(
      button(
        active.includes(n.id) ? "有効から外す" : "有効化",
        () =>
          changed(
            active.includes(n.id)
              ? setBuild(
                  game,
                  active.filter((id) => !closure([id]).includes(n.id)),
                )
              : activateNode(game, n.id),
          ),
        active.includes(n.id) && !editable,
      ),
    );
    detail.append(
      button(
        `前提にする子も返金（本ノード ${game.skillPaid[n.id] || 0} G）`,
        () => changed(refundNode(game, n.id)),
        !editable,
      ),
    );
  }
  const preview = el("div", "skill-motion-preview");
  preview.dataset.family = n.family;
  preview.append(el("span", "", "◆"), el("span", "", "·"), el("span", "", "○"));
  detail.append(
    preview,
    el("small", "", "形状プレビュー / 実際の範囲と周期は戦闘で確認できます"),
  );
  detail.append(el("h3", "", "ビルドレシピ 60"));
  const select = el("select");
  select.setAttribute("aria-label", "ビルドレシピ");
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
  const q = quoteRecipe(game, recipe);
  detail.append(
    el(
      "small",
      "",
      `返金 ${q.refund} G → 購入 ${q.cost} G → 残り ${q.balance} G`,
    ),
    button(
      "このレシピへ振り直す",
      () => changed(applyRecipe(game, recipe)),
      !editable || q.balance < 0 || !!q.error,
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
  detail.append(el("h3", "", "保存構成"));
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
