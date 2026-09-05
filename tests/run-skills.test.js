import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
const saved=new Map();
globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
beforeEach(()=>saved.clear());
import {SKILLS,buySkill,buildSkillStats} from '../src/runSkills.js';
class Element {
 constructor(){this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.children=[];this.width=1280;this.height=720;}
 appendChild(x){this.children.push(x)} append(...x){this.children.push(...x)} replaceChildren(...x){this.children=x} setAttribute(){} removeAttribute(){} addEventListener(){} querySelector(){return new Element()} getBoundingClientRect(){return {width:1280,height:720,left:0,top:0}} }
globalThis.document={querySelector:()=>new Element(),createElement:()=>new Element(),createElementNS:()=>new Element(),body:new Element()};
globalThis.window={addEventListener(){},dispatchEvent(){},innerWidth:1280,innerHeight:720,devicePixelRatio:1,matchMedia:()=>({matches:false})};
const {game,setRenderer}=await import('../src/state.js'); setRenderer({dpr:1});
const {resetRun,startNextWave}=await import('../src/game.js');
const {enterUpgradeTree,continueFromSkillTree,purchaseNode,applyPurchasedSkillTreeToActiveWeapon}=await import('../src/skillTree.js');
const {updateFacilities}=await import('../src/workbench.js');
const {collectRoomGold}=await import('../src/gold.js');

test('purchases enforce funds, prerequisites, multiple final unlocks and no duplicate spending',()=>{
 const s={gold:1000,treePurchases:{weapon:{}}};
 assert.equal(buySkill(s,'meteor'),false);
 for(const id of ['rapid','multi','barrage','heavy','blast'])assert.equal(buySkill(s,id),true);
 const gold=s.gold;
 assert.equal(buySkill(s,'meteor'),true);assert.equal(s.activeFinal,'meteor');assert.equal(buySkill(s,'rapid'),false);assert.equal(s.gold,gold-110);
 s.gold=0;assert.equal(buySkill(s,'health'),false);
});
test('opening and closing preserves enemies, bullets, coins, room and cooldown',()=>{
 resetRun();const w=game.player.gear.weapons[0];w.cooldown=.73;
 game.bullets.push({x:1});game.goldDrops.push({x:2});
 const refs=[game.enemies,game.bullets,game.goldDrops,game.dungeon];
 enterUpgradeTree();assert.equal(game.mode,'upgradeTree');continueFromSkillTree();
 assert.equal(game.mode,'arena');assert.deepEqual([game.enemies,game.bullets,game.goldDrops,game.dungeon],refs);assert.equal(w.cooldown,.73);
});
test('skills stack once, health heals once, floor keeps progress, restart restores saved progression',()=>{
 resetRun();game.gold=200;game.player.hp=10;enterUpgradeTree();
 for(const id of ['heavy','blast','power','health']) assert.equal(purchaseNode(id),true);
 const w=game.player.gear.weapons[0];assert.equal(w.damage,12.5);assert.equal(w.explosionDamage,4.375);assert.equal(game.player.hp,22);assert.equal(game.player.maxHp,42);
 const stats={damage:w.damage,radius:w.radius,explosion:w.explosionDamage,hp:game.player.hp};
 applyPurchasedSkillTreeToActiveWeapon();assert.deepEqual({damage:w.damage,radius:w.radius,explosion:w.explosionDamage,hp:game.player.hp},stats);
 continueFromSkillTree();game.mode="bossReward";game.encounter.phase="reward";assert.equal(startNextWave(),true);assert.equal(game.player.gear.weapons[0],w);assert.equal(game.player.maxHp,42);assert.equal(game.treePurchases.weapon.health,true);
 const balance=game.gold;resetRun();assert.equal(game.gold,balance);assert.equal(game.treePurchases.weapon.health,true);assert.equal(game.player.maxHp,42);assert.equal(game.player.gear.weapons[0].damage,12.5);
});
test('every skill yields finite stats and final changes are implemented',()=>{
 resetRun();const base=game.player.gear.weapons[0].baseStats;
 for(const n of SKILLS){const result=buildSkillStats(base,game.player.baseStats,{[n.id]:true});for(const key of ['damage','fireRate','range','radius'])assert.ok(Number.isFinite(result.weapon[key]));}
 const result=buildSkillStats(base,game.player.baseStats,{bounce:true,chain:true,shards:true},'shards');assert.equal(result.weapon.ricochetCount,2);assert.equal(result.weapon.splitShardCount,1);
});
test('recovery is not consumed at full HP, treasure pays once without a fee',()=>{
 resetRun(); const p=game.player;
 const heal={type:'workbench',x:p.x,y:p.y,radius:30};const chest={type:'treasureVault',x:p.x,y:p.y,radius:30};game.dungeon.facilities=[heal,chest];
 updateFacilities(1);assert.equal(heal.used,undefined);assert.equal(game.gold,20);
 p.hp=5;updateFacilities(1);assert.equal(p.hp,20);assert.equal(heal.used,true);assert.equal(game.gold,20);updateFacilities(1);assert.equal(p.hp,20);
});
test('room completion collects only relevant coins',()=>{
 resetRun();const d=game.dungeon,room=d.rooms[0];
 game.goldDrops=[{x:d.offsetX+(room.x+.5)*96,y:d.offsetY+(room.y+.5)*96,value:3},{x:-99999,y:-99999,value:4}];
 collectRoomGold(room);assert.equal(game.gold,3);assert.equal(game.goldDrops.length,1);
});



const {readProgress,saveProgress,rewardForFloor,SAVE_KEY}=await import('../src/progression.js');
test('economy grows by floor while node prices remain fixed',()=>{
 const prices=SKILLS.map(n=>n.cost);assert.equal(rewardForFloor(12,1),12);assert.equal(rewardForFloor(12,5),79);assert.ok(rewardForFloor(12,10)>rewardForFloor(12,5));assert.deepEqual(SKILLS.map(n=>n.cost),prices);
});
test('save loading rejects malformed values and unknown nodes',()=>{
 saved.set(SAVE_KEY,'broken');assert.equal(readProgress().gold,0);
 saved.set(SAVE_KEY,JSON.stringify({version:1,gold:-100,purchased:{fake:true,meteor:true,heavy:true},activeFinal:'meteor'}));
 const loaded=readProgress();assert.equal(loaded.gold,0);assert.deepEqual(loaded.purchased,{heavy:true});assert.equal(loaded.activeFinal,null);
 assert.equal(saveProgress(game,{setItem(){throw new Error('quota')}}),false);assert.equal(game.saveFailed,true);
});
test('final switching removes old effects without losing unlocks',()=>{
 resetRun();game.gold=1000;enterUpgradeTree();for(const id of ['rapid','multi','barrage','bounce','chain','shards'])assert.equal(purchaseNode(id),true);
 const w=game.player.gear.weapons[0];assert.equal(w.splitShardCount,1);const rate=w.fireRate;
 game.activeFinal='barrage';applyPurchasedSkillTreeToActiveWeapon();assert.equal(w.splitShardCount,0);assert.equal(w.fireRate,rate*1.5);assert.equal(game.treePurchases.weapon.shards,true);
 saveProgress(game);resetRun();assert.equal(game.activeFinal,'barrage');assert.equal(game.player.gear.weapons[0].splitShardCount,0);
});

test('ordinary enemy pickup applies floor multiplier and persists immediately',async()=>{
 resetRun();game.wave=5;const p=game.player;
 game.goldDrops=[{x:p.x,y:p.y,vx:0,vy:0,value:2,radius:10,age:0,magnetDelay:0}];
 const {updateGoldDrops}=await import('../src/gold.js');updateGoldDrops(.016);
 assert.equal(game.gold,rewardForFloor(2,5));assert.equal(readProgress().gold,game.gold);
});
