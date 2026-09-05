import {readProgress,saveProgress,floorMultiplier,rewardForFloor} from './progression.js';
import {game, keys} from './state.js';
import {hud} from './dom.js';
import {getLocale} from './i18n.js';
import {updateHud} from './hud.js';
import {SKILLS, skillStatus, buySkill, buildSkillStats} from './runSkills.js';
export const WEAPON_SKILL_TREES = {stone: SKILLS};
const ja = () => getLocale() === 'ja';
const name = n => ja() ? n.ja : n.en;
export function initSkillProgress() { const saved=readProgress(); game.gold=saved.gold; game.treePurchases = {weapon:saved.purchased}; game.activeFinal=saved.activeFinal; game.totalSkillPoints=0; game.freeNodeCredits={weapon:0}; game.modeBeforeSkillTree=null; }
export function enterUpgradeTree() {
  if (!['arena','pause'].includes(game.mode)) return;
  mapScale=window.innerWidth<=760?.65:.85;
  mapScroll={x:Math.max(0,(840*mapScale-(window.innerWidth<=760?window.innerWidth-48:window.innerWidth-360))/2),y:0};
  game.modeBeforeSkillTree=game.mode; game.mode='upgradeTree'; keys.clear();
  hud.pauseMenu.classList.add('hidden'); hud.skillTree.classList.remove('hidden');
  renderSkillTree(); updateHud();
}
export const enterDebugSkillTree = enterUpgradeTree;
export function hideSkillTree() { hud.skillTree.classList.add('hidden'); }
export function continueFromSkillTree() {
  if (game.mode !== 'upgradeTree') return;
  hideSkillTree(); game.mode=game.modeBeforeSkillTree || 'arena'; game.modeBeforeSkillTree=null; keys.clear();
  if (game.mode === 'pause') hud.pauseMenu.classList.remove('hidden');
  updateHud();
}
let selectedSkillId='rapid';
let mapScroll={x:0,y:0};
let mapScale=0.85;
export function renderSkillTree() {
  const panel=hud.skillTree;
  panel.className='panel gold-skill-panel';
  panel.removeAttribute('data-i18n-aria-label');
  panel.setAttribute('aria-label',ja()?'石のスキルツリー':'Stone skills');
  panel.replaceChildren();
  const head=document.createElement('div'); head.className='gold-skill-head';
  const title=document.createElement('h1'); title.textContent=ja()?'石のスキルツリー':'Stone skills';
  const cash=document.createElement('strong'); cash.textContent=game.gold+' G';
  const close=document.createElement('button'); close.textContent=ja()?'戦闘に戻る':'Resume'; close.onclick=continueFromSkillTree;
  head.append(title,cash,close); panel.append(head);
  const economy=document.createElement('p'); economy.className='economy-summary';
  economy.textContent=(ja()?'B':'Floor ')+game.wave+' · ×'+floorMultiplier(game.wave).toFixed(2)+(ja()?' 報酬 / 通常部屋 ':' rewards / Room ')+rewardForFloor(12,game.wave)+' G / '+(ja()?'エリート ':'Elite ')+rewardForFloor(25,game.wave)+' G'; panel.append(economy);
  const hint=document.createElement('p'); hint.textContent=ja()?'通貨と強化は自動保存され、死亡後も引き継ぎます。最終形態は購入済みから１つ選択。価格は固定です。':'Gold and skills are saved across runs. Select one unlocked final form. Node prices are fixed.'; panel.append(hint);
  if(game.saveFailed){const warning=document.createElement('p');warning.textContent=ja()?'保存できません。この画面を閉じると進行が失われる可能性があります。':'Saving unavailable. Progress may be lost when this page closes.';panel.append(warning);}
  const layout=document.createElement('div');layout.className='constellation-layout';
  const viewport=document.createElement('div');viewport.className='constellation-viewport';viewport.setAttribute('aria-label',ja()?'ドラッグして探索するスキルマップ':'Draggable skill map');
  const spacer=document.createElement('div');spacer.className='constellation-spacer';
  const map=document.createElement('div');map.className='constellation-map';
  const width=840,height=1130;
  const positions=new Map();
  for(const [column,branch] of ['rapid','bounce','heavy'].entries()) {
    SKILLS.filter(n=>n.branch===branch).forEach((n,i)=>positions.set(n.id,{x:180+240*column,y:335+i*112}));
  }
  for(const [i,n] of SKILLS.filter(n=>n.branch==='common').entries()) positions.set(n.id,{x:125+i*295,y:185});
  const hub={x:420,y:70};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.classList.add('constellation-lines');svg.setAttribute('aria-hidden','true');
  const ancestors=new Set();let cursor=SKILLS.find(n=>n.id===selectedSkillId);
  while(cursor){ancestors.add(cursor.id);cursor=SKILLS.find(n=>n.id===cursor.requires);}
  for(const n of SKILLS) {
    const a=n.requires?positions.get(n.requires):hub,b=positions.get(n.id);
    const line=document.createElementNS('http://www.w3.org/2000/svg','path');
    const mid=n.requires?(a.y+b.y)/2:(n.branch==='common'?112:255);
    line.setAttribute('d',!n.requires && n.branch!=='common' ? 'M 420 70 V 125 H 550 V 255 H '+b.x+' V '+b.y : 'M '+a.x+' '+a.y+' V '+mid+' H '+b.x+' V '+b.y);
    line.setAttribute('class','constellation-link'+(game.treePurchases.weapon[n.id]?' owned':'')+(ancestors.has(n.id)?' route':''));svg.appendChild(line);
  }
  map.append(svg);
  const root=document.createElement('div');root.className='constellation-hub';root.textContent='◆';root.style.left=hub.x+'px';root.style.top=hub.y+'px';map.append(root);
  const caption=document.createElement('div');caption.className='constellation-caption';caption.textContent=ja()?'石ころ / 永続成長':'STONE / PERMANENT GROWTH';map.append(caption);
  const icons={rapid:'»',multi:'⋮',barrage:'✹',bounce:'↗',chain:'↔',shards:'✧',heavy:'⬟',blast:'✷',meteor:'☄',power:'⚔',range:'◎',health:'♥'};
  for(const n of SKILLS) {
    const p=positions.get(n.id),status=skillStatus(n,game.treePurchases.weapon,game.gold);
    const button=document.createElement('button');button.className='constellation-node '+status+(n.id===selectedSkillId?' selected':'')+(n.final?' final-node':'');
    button.style.left=p.x+'px';button.style.top=p.y+'px';button.setAttribute('aria-label',name(n)+' · '+n.cost+' G');button.setAttribute('aria-pressed',String(n.id===selectedSkillId));
    const icon=document.createElement('span');icon.className='node-gem';icon.textContent=icons[n.id]||'◆';
    const label=document.createElement('span');label.className='node-title';label.textContent=name(n);
    const price=document.createElement('span');price.className='node-cost';price.textContent=status==='owned'?(game.activeFinal===n.id?'★ ACTIVE':'✓') : n.cost+' G';
    button.append(icon,label,price);button.onclick=()=>{selectedSkillId=n.id;mapScroll={x:viewport.scrollLeft,y:viewport.scrollTop};renderSkillTree();};map.append(button);
  }
  const resizeMap=()=>{map.style.transform='scale('+mapScale+')';spacer.style.width=width*mapScale+'px';spacer.style.height=height*mapScale+'px';};resizeMap();
  spacer.append(map);viewport.append(spacer);layout.append(viewport);
  const controls=document.createElement('div');controls.className='constellation-controls';
  for(const [label,delta] of [['−',-.15],['+',.15]]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label',delta>0?'Zoom in':'Zoom out');b.onclick=()=>{mapScale=Math.max(.4,Math.min(1.4,mapScale+delta));resizeMap();};controls.append(b);}
  const home=document.createElement('button');home.textContent=ja()?'起点へ':'Root';home.onclick=()=>{viewport.scrollLeft=Math.max(0,420*mapScale-viewport.clientWidth/2);viewport.scrollTop=0;};controls.append(home);panel.append(controls);
  viewport.scrollLeft=mapScroll.x;viewport.scrollTop=mapScroll.y;
  viewport.addEventListener('scroll',()=>{mapScroll={x:viewport.scrollLeft,y:viewport.scrollTop};});
  let drag=null,moved=false;
  viewport.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};moved=false;});
  viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5){moved=true;viewport.setPointerCapture(e.pointerId);}if(moved){viewport.scrollLeft=drag.left-dx;viewport.scrollTop=drag.top-dy;}});
  viewport.addEventListener('pointerup',()=>{drag=null;});viewport.addEventListener('pointercancel',()=>{drag=null;});
  viewport.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
  const n=SKILLS.find(n=>n.id===selectedSkillId)||SKILLS[0];
      const card=document.createElement('article'); const status=skillStatus(n,game.treePurchases.weapon,game.gold); card.className='gold-node constellation-detail '+status;
      const h=document.createElement('h2'); h.textContent=name(n)+(n.final?' ★':'');
      const detail=document.createElement('p'); detail.textContent=ja()?n.detailJa:n.detailEn;
      const preview=document.createElement('small');
      const w=game.player.gear.weapons[0];
      const before=buildSkillStats(w.runSkillBase || w.baseStats,game.player.baseStats,game.treePurchases.weapon,game.activeFinal);
      const after=buildSkillStats(w.runSkillBase || w.baseStats,game.player.baseStats,{...game.treePurchases.weapon,[n.id]:true},n.final?n.id:game.activeFinal);
      const labels={radius:ja()?'サイズ':'Size',knockback:ja()?'押し出し':'Knockback',bulletSpeed:ja()?'弾速':'Speed',life:ja()?'持続':'Lifetime',explosionDamage:ja()?'爆発威力':'Blast damage',damage:ja()?'威力':'Damage',fireRate:ja()?'連射/秒':'Shots/s',range:ja()?'射程':'Range',projectiles:ja()?'弾数':'Projectiles',ricochetCount:ja()?'跳弾':'Ricochets',explosionRadius:ja()?'爆発半径':'Blast radius',splitShardCount:ja()?'破片':'Shards'};
      preview.textContent=Object.entries(labels).filter(([k])=>before.weapon[k]!==after.weapon[k]).map(([k,label])=>label+': '+Number(before.weapon[k]||0).toFixed(1)+' → '+Number(after.weapon[k]||0).toFixed(1)).join(' / ');
      if(n.id==='health') preview.textContent='HP: '+before.player.maxHp+' → '+after.player.maxHp;
      const requirement=document.createElement('p'); requirement.textContent=n.requires ? (ja()?'前提：':'Requires: ')+name(SKILLS.find(x=>x.id===n.requires)) : (ja()?'前提なし':'No prerequisite');
      const buy=document.createElement('button'); buy.disabled=status!=='available';
      buy.textContent=status==='owned'?(ja()?'購入済み':'Owned'):status==='exclusive'?(ja()?'他系統の最終強化を選択済み':'Other final chosen'):status==='locked'?(ja()?'前提未解放':'Prerequisite locked'):status==='costly'?(ja()?'不足 ':'Need ')+(n.cost-game.gold)+' G':(ja()?'購入 ':'Buy ')+n.cost+' G';
      const price=document.createElement('small'); price.textContent=n.cost+' G'; buy.onclick=()=>purchaseNode(n.id);
      if(n.final && status==='owned') {
        buy.disabled=game.activeFinal===n.id;
        buy.textContent=game.activeFinal===n.id?(ja()?'選択中':'Active'):(ja()?'この形態に切り替える':'Activate form');
        buy.onclick=()=>{game.activeFinal=n.id;applyPurchasedSkillTreeToActiveWeapon();saveProgress(game);renderSkillTree();updateHud();};
      }
      card.append(h,detail,preview,requirement,price,buy);layout.append(card);
  panel.append(layout);
  viewport.scrollLeft=mapScroll.x;viewport.scrollTop=mapScroll.y;
}

export function purchaseNode(id) {
  if(game.mode!=='upgradeTree' || !buySkill(game,id)) return false;
  applyPurchasedSkillTreeToActiveWeapon(); saveProgress(game); renderSkillTree(); updateHud(); return true;
}
export function applyPurchasedSkillTreeToActiveWeapon() {
  const p=game.player,w=p?.gear.weapons[0]; if(!w)return;
  w.runSkillBase ||= {...w.baseStats,bulletSprite:w.bulletSprite};
  const oldMax=p.maxHp;
  const next=buildSkillStats(w.runSkillBase,p.baseStats,game.treePurchases.weapon,game.activeFinal);
  Object.assign(w,next.weapon); Object.assign(p,next.player);
  p.hp=Math.min(p.maxHp,p.hp+Math.max(0,p.maxHp-oldMax));
}
