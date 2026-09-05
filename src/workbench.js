// Former workbench rooms now provide recovery; vaults provide free run currency.
import {game} from './state.js';
import {grantGold} from './gold.js';
import {updateHud} from './hud.js';
export function updateFacilities(dt=0) {
  if(game.mode!=='arena')return;
  const p=game.player;
  for(const f of game.dungeon?.facilities || []) {
    if(f.used||f.opened)continue;
    if(Math.hypot(p.x-f.x,p.y-f.y)>p.radius+f.radius+20){f.holdTimer=0;continue;}
    if(f.type==='workbench' && p.hp>=p.maxHp)continue;
    f.holdTimer=(f.holdTimer||0)+dt;
    if(f.holdTimer<1)continue;
    if(f.type==='workbench'){p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.5);f.used=true;}
    else if(f.type==='treasureVault'){grantGold(20);f.opened=true;}
    updateHud();
  }
}
