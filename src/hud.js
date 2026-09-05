import { difficulty } from './difficulty.js';
import { shortestDungeonDelta } from './dungeon.js';
import {SKILLS, skillStatus} from './runSkills.js';
import {getLocale} from './i18n.js';
import { t } from "./i18n.js";
import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { resetVirtualMove } from "./input.js";
import { getActiveWeapon } from "./weapons.js";
import { countItemsByKey, ensureStoneMaterialInventory, formatStoneItemSummary, stoneEvolutionProgress, stoneItemIcon } from "./stoneItems.js";
import { STONE_MATERIALS } from "./data/stoneItems.js";
import { COMBAT_ROOM_ELITE, ROOM_COMBAT, ROOM_START, ROOM_STAIRS, ROOM_TREASURE, ROOM_WORKBENCH, getDungeonRoomAtWorld } from "./dungeon.js";

export function updateHud() {
  hud.wave.textContent = String(game.wave || 1);
  renderEncounterGauge();
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold || 0);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold || 0);
  hud.kills.textContent = String(game.totalKills || 0);
  renderHpGauge();
  renderCraftTreeButton();
  renderPauseStoneItems();
  renderMaterialHud();
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "arena");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "weaponSelect") return t("hud.objective.weaponSelect");
  if (game.mode === "upgradeTree") return getLocale()==="ja" ? "スキル購入" : "Skills";
  if (game.mode === "treasure") return t("treasure.label");
  if (game.mode === "modding") return t("modding.label");
  if (game.mode === "workbench") return t("workbench.label");
  if (game.mode === "pause") return t("pause.label");
  if (game.mode === "result") return game.runResult?.result === "clear" ? t("result.clear") : t("gameOver.kicker");
  if (game.mode === "over") return t("gameOver.kicker");
  if (game.mode === 'bossReward') return getLocale() === 'ja' ? 'ボス撃破 / 強化の時間' : 'Boss defeated / Upgrade';
  if (game.mode === 'arena') {
    const ja = getLocale() === 'ja';
    const e = game.encounter;
    const cfg = difficulty(game.wave);
    const tier = (ja ? '難易度 ' : 'Difficulty ') + game.wave + '/5';
    if (e?.phase === 'warning') return tier + (ja ? ' · ボス出現！' : ' · BOSS INCOMING!');
    if (e?.phase === 'boss' && e.boss) {
      const delta = shortestDungeonDelta(game.dungeon,game.player.x,game.player.y,e.boss.x,e.boss.y);
      const arrows = ['→','↘','↓','↙','←','↖','↑','↗'];
      const arrow = arrows[(Math.round(Math.atan2(delta.dy,delta.dx)/(Math.PI/4))+8)%8];
      return cfg.bossName[ja ? 0 : 1] + ' ' + arrow + ' ' + Math.max(0,Math.ceil(e.boss.hp)) + '/' + e.boss.maxHp;
    }
    return tier + (ja ? ' · ボスまで ' : ' · Boss ') + (e?.kills || 0) + '/' + cfg.kills;
  }
  return t('hud.objective.preparing');
}

function renderEncounterGauge() {
  if (!hud.encounterGauge) return;
  const e = game.encounter;
  const boss = e?.phase === 'boss' && e.boss;
  const max = boss ? e.boss.maxHp : difficulty(game.wave).kills;
  const value = Math.max(0,Math.min(max,boss ? e.boss.hp : (e?.kills || 0)));
  hud.encounterGauge.classList.toggle('hidden',game.mode !== 'arena');
  hud.encounterGauge.classList.toggle('is-boss',Boolean(boss));
  hud.encounterGauge.setAttribute('aria-valuemax',String(max));
  hud.encounterGauge.setAttribute('aria-valuenow',String(Math.ceil(value)));
  hud.encounterGauge.setAttribute('aria-label',getLocale()==='ja' ? (boss ? 'ボスHP' : 'ボス出現までの討伐数') : (boss ? 'Boss HP' : 'Kills to boss'));
  hud.encounterFill.style.width = (100*value/max)+'%';
}

function renderHpGauge() {
  if (!hud.hpText || !game.player) return;
  const hp = Math.max(0, Math.ceil(game.player.hp));
  const maxHp = Math.max(1, Math.ceil(game.player.maxHp));
  const barrier = Math.max(0, Math.ceil(game.player.barrier || 0));
  const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
  const barrierRatio = Math.max(0, Math.min(1, barrier / maxHp));

  hud.hpText.textContent = barrier > 0 ? `${hp}/${maxHp} ◆${barrier}` : `${hp}/${maxHp}`;
  if (hud.hpGaugeFill) hud.hpGaugeFill.style.width = `${Math.round(hpRatio * 1000) / 10}%`;
  if (hud.hpBarrierFill) {
    hud.hpBarrierFill.style.width = `${Math.round(barrierRatio * 1000) / 10}%`;
    hud.hpBarrierFill.classList.toggle("hidden", barrier <= 0);
  }
  if (hud.hpGauge) {
    hud.hpGauge.setAttribute("aria-valuemax", String(maxHp));
    hud.hpGauge.setAttribute("aria-valuenow", String(hp));
    hud.hpGauge.classList.toggle("hp-gauge-low", hpRatio <= 0.3);
    hud.hpGauge.classList.toggle("hp-gauge-critical", hpRatio <= 0.15);
    hud.hpGauge.classList.toggle("hp-gauge-barrier", barrier > 0);
  }
}


function renderMaterialHud() { hud.materialHud?.classList.add('hidden'); }

function renderPauseStoneItems() {
 if(hud.pauseStoneItems) hud.pauseStoneItems.textContent=SKILLS.filter(n=>game.treePurchases.weapon[n.id]).map(n=>getLocale()==='ja'?n.ja:n.en).join(' / ') || (getLocale()==='ja'?'敵を倒してGを集め、スキルを購入しよう。':'Defeat enemies for gold and buy skills.');
}

function renderCraftTreeButton() {
  if (!hud.craftTreeBtn) return;
  const isArena = game.mode === "arena";
  hud.craftTreeBtn.classList.toggle("hidden", !isArena);
  hud.craftTreeBtn.disabled = !isArena;
  hud.craftTreeBtn.textContent = 'K ✦';
  hud.craftTreeBtn.classList.toggle('can-buy',SKILLS.some(n=>skillStatus(n,game.treePurchases.weapon,game.gold)==='available'));
  hud.craftTreeBtn.title = t("workbench.craftTreeButton");
  hud.craftTreeBtn.setAttribute("aria-label", t("workbench.craftTreeButton"));
}

export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isArena = game.mode === "arena";
  hud.touchControls.classList.toggle("disabled", !isArena);
  if (!isArena && pointer.down) resetVirtualMove();
}
