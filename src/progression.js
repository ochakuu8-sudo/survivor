import {SKILLS} from './runSkills.js';
export const SAVE_KEY='survivor.progression.v1';
export function floorMultiplier(floor=1) {return Math.pow(1.45,Math.min(29,Math.max(0,Math.floor(floor)-1)));}
export function rewardForFloor(base,floor=1){return Math.max(0,Math.round(base*floorMultiplier(floor)));}
export function readProgress(storage) {
 try {
  storage ??= globalThis.localStorage;
  const data=JSON.parse(storage?.getItem(SAVE_KEY)||'null');
  if(!data || data.version!==1)return {gold:0,purchased:{},activeFinal:null};
  const purchased={};
  for(const n of SKILLS)if(data.purchased?.[n.id]===true && (!n.requires || purchased[n.requires]))purchased[n.id]=true;
  const activeFinal=SKILLS.some(n=>n.id===data.activeFinal&&n.final&&purchased[n.id])?data.activeFinal:null;
  return {gold:Number.isSafeInteger(data.gold)&&data.gold>=0?Math.min(data.gold,1e12):0,purchased,activeFinal};
 }catch{return {gold:0,purchased:{},activeFinal:null};}
}
export function saveProgress(game,storage){
 try {storage ??= globalThis.localStorage;if(!storage)throw new Error('Storage unavailable');storage.setItem(SAVE_KEY,JSON.stringify({version:1,gold:game.gold,purchased:game.treePurchases.weapon,activeFinal:game.activeFinal||null}));game.saveFailed=false;return true;}catch{game.saveFailed=true;return false;}
}
