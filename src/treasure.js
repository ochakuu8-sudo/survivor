import {game} from './state.js';
import {grantGold} from './gold.js';
import {updateHud} from './hud.js';
export function updateTreasureChests(dt=0) {
 if(game.mode!=='arena')return;
 for(const chest of game.dungeon?.chests || []) {
  if(chest.opened)continue;
  const p=game.player;
  if(Math.hypot(p.x-chest.x,p.y-chest.y)>p.radius+chest.radius+18){chest.holdTimer=0;continue;}
  chest.holdTimer=(chest.holdTimer||0)+dt;
  if(chest.holdTimer>=1){chest.opened=true;grantGold(20);updateHud();}
 }
}
export function claimTreasureReward() {}
export function rerollTreasureReward() {}
