import { game, keys } from './state.js';
import { hud } from './dom.js';
import { difficulty, DIFFICULTIES } from './difficulty.js';
import { spawnEnemy, spawnEnemies, resetEnemySpawnTimer } from './enemies.js';
import { addTelegraphCircle } from './effects.js';
import { shortestDungeonDelta, wrapDungeonPoint } from './dungeon.js';
import { collectAllGold, grantGold } from './gold.js';
import { enterUpgradeTree } from './skillTree.js';
import { finishRun } from './game.js';
import { resetVirtualMove } from './input.js';
import { getLocale } from './i18n.js';

export function resetArenaProgress() {
  game.encounter = { phase: 'horde', kills: 0, boss: null, warning: 0, position: null };
  game.bossesDefeated = 0;
  game.runElapsed = 0;
  hud.bossReward?.classList.add('hidden');
}

// Death callbacks only record events; settle rewards after the combat update.
export function recordArenaKill(enemy) {
  const e = game.encounter;
  if (!e || !game.dungeon?.arena) return;
  if (e.phase === 'horde' && !enemy.boss) e.kills = Math.min(difficulty(game.wave).kills, e.kills + 1);
}

export function updateArenaProgress(dt) {
  const e = game.encounter;
  if (!e || game.mode !== 'arena') return;
  if (e.phase === 'horde' && e.kills >= difficulty(game.wave).kills) {
    e.phase = 'warning';
    e.warning = 2;
    const angle = Math.random() * Math.PI * 2;
    e.position = wrapDungeonPoint(game.dungeon, {
      x: game.player.x + Math.cos(angle) * 370,
      y: game.player.y + Math.sin(angle) * 370,
    });
    addTelegraphCircle(e.position.x, e.position.y, 88, 2);
  } else if (e.phase === 'warning') {
    e.warning -= dt;
    if (e.warning <= 0) {
      const delta = shortestDungeonDelta(game.dungeon, e.position.x, e.position.y, game.player.x, game.player.y);
      // Walking into the marker postpones the spawn and moves it away.
      if (Math.hypot(delta.dx, delta.dy) < 150) {
        const angle = Math.atan2(delta.dy, delta.dx);
        e.position = wrapDungeonPoint(game.dungeon, { x: game.player.x - Math.cos(angle) * 330, y: game.player.y - Math.sin(angle) * 330 });
        e.warning = 1;
        addTelegraphCircle(e.position.x, e.position.y, 88, 1);
        return;
      }
      const boss = spawnEnemy('bigZombie', { position: e.position, boss: true, noDeathChest: true });
      if (!boss) { e.warning = .5; return; }
      const cfg = difficulty(game.wave);
      boss.hp = boss.maxHp = boss.baseMaxHp = cfg.bossHp;
      boss.baseSpeed = 96;
      boss.chargeRange = 380;
      boss.chargeSpeed = 600;
      boss.chargeDuration = .6;
      boss.chargeWindup = .95;
      boss.chargeCooldown = Math.max(1.8, 3.2 - game.wave * .2);
      boss.chargeDamage = 8 + game.wave * 2;
      boss.attackDamage = 5 + game.wave;
      boss.volleyTimer = 3;
      boss.volleyWarning = 0;
      boss.volleyCount = game.wave >= 3 ? (game.wave === 5 ? 7 : 5) : 0;
      e.boss = boss;
      e.phase = 'boss';
      resetEnemySpawnTimer();
    }
  } else if (e.phase === 'boss' && e.boss?.dead) {
    e.phase = 'reward'; // Guard before any reward or UI side effects.
    game.bossesDefeated += 1;
    collectAllGold();
    game.lastBossReward = grantGold(difficulty(game.wave).bossReward);
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + Math.ceil(game.player.maxHp * .3));
    game.enemies = []; game.bullets = []; game.enemyProjectiles = []; game.effects = [];
    keys.clear(); resetVirtualMove();
    if (game.wave === DIFFICULTIES.length) {
      finishRun('clear');
    } else {
      game.mode = 'bossReward';
      renderBossReward();
    }
  }
}

export function spawnArenaHorde(dt) {
  const phase = game.encounter?.phase;
  if (phase === 'horde' || phase === 'boss') spawnEnemies(dt);
}

export function advanceDifficulty() {
  if (game.mode !== 'bossReward' || game.encounter?.phase !== 'reward' || game.wave >= DIFFICULTIES.length) return false;
  game.wave += 1;
  game.floorElapsed = 0; game.waveKills = 0;
  game.encounter = { phase: 'horde', kills: 0, boss: null, warning: 0, position: null };
  game.mode = 'arena';
  game.player.invulnerableTimer = 2;
  keys.clear(); resetVirtualMove();
  hud.bossReward.classList.add('hidden');
  resetEnemySpawnTimer(); game.spawnClock = .6;
  return true;
}

export function renderBossReward() {
  if (game.mode !== 'bossReward') return;
  const ja = getLocale() === 'ja';
  const panel = hud.bossReward;
  panel.replaceChildren();
  const kicker = document.createElement('span'); kicker.className = 'panel-kicker'; kicker.textContent = ja ? 'BOSS DEFEATED / 強化の時間' : 'BOSS DEFEATED / TIME TO UPGRADE';
  const title = document.createElement('h1'); title.textContent = ja ? `難易度 ${game.wave} 突破！` : `Difficulty ${game.wave} complete!`;
  const reward = document.createElement('p'); reward.className = 'boss-reward-gold'; reward.textContent = `+${game.lastBossReward} G`;
  const info = document.createElement('p'); info.textContent = ja ? `落ちているGを回収・HPを30%回復。所持 ${game.gold} G。` : `Loose gold collected. Restored 30% HP. Balance: ${game.gold} G.`;
  const next = document.createElement('p'); next.textContent = ja ? `次は難易度 ${game.wave + 1}。${difficulty(game.wave + 1).kills}体倒すと次のボスが出現。` : `Next: difficulty ${game.wave + 1}. Defeat ${difficulty(game.wave + 1).kills} enemies to summon its boss.`;
  const skills = document.createElement('button'); skills.textContent = ja ? 'スキルツリーで強化' : 'Upgrade skills'; skills.onclick = enterUpgradeTree;
  const go = document.createElement('button'); go.className = 'primary'; go.textContent = ja ? '次の難易度へ' : 'Next difficulty'; go.onclick = advanceDifficulty;
  const actions = document.createElement('div'); actions.className = 'boss-reward-actions'; actions.append(skills, go);
  panel.append(kicker, title, reward, info, next, actions); panel.classList.remove('hidden');
}
