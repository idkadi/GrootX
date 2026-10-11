'use strict';
const {getAbilityKey,normalize}=require('../data/abilityMappings');
const {calculateBattlePower}=require('./battlePower');
const DEFAULT_LOCATIONS=require('../data/locations');
const SIDES=['left','middle','right'];
const WEAPONS=['webshooter','captain_shield','arc_reactor','wolverine_claws','mjolnir'];
const OG6=new Set(['iron_man','captain_america','thor','hulk','black_widow','hawkeye']);
const F4=new Set(['reed_richards','sue_storm','human_torch','the_thing']);
const SYMBIOTES=new Set(['venom','shevenom','carnage','riot','antivenom','agentvenom','spidervenom']);
const SPECIALISTS=new Map([
 ['ironman','iron_man'],['tonystark','iron_man'],['ironmanmark2','iron_man'],['ironmanmark3','iron_man'],
 ['captainamerica','captain_america'],['thor','thor'],['thorodinson','thor'],['hulk','hulk'],
 ['blackwidow','black_widow'],['natasharomanoff','black_widow'],['hawkeye','hawkeye'],
 ['reedrichards','reed_richards'],['mrfantastic','reed_richards'],['misterfantastic','reed_richards'],
 ['suestorm','sue_storm'],['invisiblewoman','sue_storm'],['humantorch','human_torch'],['johnnystorm','human_torch'],['thething','the_thing']
]);
const TARGETS={
 spider_man_legendary:['friendlyOther','enemyCard'],loki_legendary:['friendlyOther','enemyCard'],
 spider_man_epic:['enemyCard','enemyOtherLocation'],hulk_legendary:['enemyCard'],thor_legendary:['enemySide'],
 thor_epic:['shieldSide'],black_widow_legendary:['weapon'],venom_legendary:['friendlySpiderHere'],
 venom_epic:['enemySpider'],scarlet_witch_legendary:['enemyCard'],loki_epic:['enemyCard'],
 daredevil_epic:['enemyCard'],doctor_strange_legendary:['newLocation'],doctor_strange_epic:['friendlyElsewhere'],
 silver_surfer_epic:['enemyCard'],miles_morales_legendary:['enemySpider']
};
function initBattle(b,options={}) {
 if(b.abilityState){ if(options.collectionCandidates)b.abilityState.collectionCandidates=options.collectionCandidates; if(options.locationPool)b.abilityState.locationPool=options.locationPool; return b; }
 b.abilityState={nextUid:1,nextShield:1,nonce:0,queue:[],request:null,resolving:false,
   log:[],privateLog:{},shields:[],modifiers:[],locks:[],bypass:{},scans:[],disabledWeapons:{},
   weaponEnergy:{},weaponUsed:{},lastEnergyTurn:0,endedTurn:0,
   rng:options.rng??Math.random,locationPool:options.locationPool??DEFAULT_LOCATIONS,
   collectionCandidates:options.collectionCandidates??{},identities:[]};
 for(const id of players(b)) {
   b.hands??={};b.hands[id]??=[];b.decks??={};b.decks[id]??=[];
   b.abilityState.privateLog[id]=[];b.abilityState.weaponEnergy[id]=0;b.abilityState.weaponUsed[id]=[];
   for(const item of [...b.hands[id],...b.decks[id]])prepareItem(b,item,id);
 }
 b.board??={left:[],middle:[],right:[]};
 for(const side of SIDES)for(const item of b.board[side]??[])prepareItem(b,item,item.ownerId);
 startTurn(b);return b;
}
function players(b){return [b.player1Id,b.player2Id];}
function opponent(b,id){return players(b).find(p=>p!==id);}
function state(b){if(!b.abilityState)initBattle(b);return b.abilityState;}
function prepareItem(b,item,ownerId){
 item.battleUid??='c'+b.abilityState.nextUid++;
 item.originalOwnerId??=ownerId;item.ownerId??=ownerId;
 item.ability??={delta:0,activated:false}; const key=identity(item);if(!b.abilityState.identities.includes(key))b.abilityState.identities.push(key);return item;
}
function all(b,includePending=false){return SIDES.flatMap(side=>(b.board[side]??[]).filter(i=>includePending||!i.pendingReveal).map(item=>({item,side})));}
function locate(b,item){return all(b,true).find(r=>r.item===item)?.side??null;}
function find(b,uid){return all(b,true).find(r=>r.item.battleUid===uid)?.item??null;}
function friendly(b,item){return all(b).filter(r=>r.item.ownerId===item.ownerId);}
function enemies(b,item){return all(b).filter(r=>r.item.ownerId!==item.ownerId);}
function inFamily(item,family){return family.has(SPECIALISTS.get(normalize(item.card.name))??normalize(item.card.name));}
function isSpider(item){return ['spiderman','ironspider','nightmonkey'].includes(normalize(item.card.name));}
function group(b,name){const loc=state(b).locationPool.find(l=>normalize(l.name)===normalize(name));return new Set((loc?.boostNames??[]).map(normalize));}
function member(item,names){return names.has(normalize(item.card.name));}
function isHidden(b,item){return !b.finished&&item.ability?.hiddenUntil>=b.turn&&!item.ability?.revealedEarly;}
function displayName(b,item){return isHidden(b,item)?'Hidden card':item.card.name;}
function log(b,message){state(b).log.push({turn:b.turn,text:message});}
function privateLog(b,id,message){(state(b).privateLog[id]??=[]).push({turn:b.turn,text:message});}
function random(b,arr){if(!arr.length)return null;const v=Math.max(0,Math.min(.999999999,Number(state(b).rng())||0));return arr[Math.floor(v*arr.length)];}
function cardPower(b,item){
 const side=locate(b,item);if(!side||item.pendingReveal)return 0;
 const teammates=(b.board[side]??[]).filter(i=>i.ownerId===item.ownerId&&!i.pendingReveal);
 const abilityBoost=(item.ability?.delta??0)+ongoingBonus(b,item);
 return calculateBattlePower(item.card,{serial:item.serial??item.entry?.serialNumber,cardsAtLocation:teammates.map(i=>i.card),location:b.locations[SIDES.indexOf(side)],abilityBoost}).finalPower;
}
function ongoingBonus(b,item){
 const key=getAbilityKey(item.card),own=friendly(b,item).filter(r=>r.item!==item),side=locate(b,item);
 switch(key){
 case 'spider_man_rare':return own.some(r=>r.side===side&&member(r.item,group(b,'Spider-Society')))?2:0;
 case 'hulk_rare':return own.filter(r=>['hulk','shehulk','redhulk'].includes(normalize(r.item.card.name))).length;
 case 'thor_rare':return own.filter(r=>['thor','thorodinson','loki','odin'].includes(normalize(r.item.card.name))).length;
 case 'black_widow_rare':return own.filter(r=>inFamily(r.item,OG6)).length;
 case 'wolverine_rare':return own.filter(r=>member(r.item,group(b,'X-Mansion'))||normalize(r.item.card.name)==='deadpool').length;
 case 'scarlet_witch_rare':return own.filter(r=>member(r.item,group(b,'Kamar-Taj'))).length;
 case 'daredevil_rare':return own.filter(r=>member(r.item,group(b,'Hell’s Kitchen'))).length;
 case 'silver_surfer_rare':return own.filter(r=>normalize(r.item.card.name)==='silversurfer'||inFamily(r.item,F4)).length;
 case 'spider_man_2099_legendary':return all(b).filter(r=>r.item!==item&&member(r.item,group(b,'Spider-Society'))).length*2;
 case 'reed_richards_epic':case 'human_torch_epic':case 'the_thing_epic':return own.filter(r=>inFamily(r.item,F4)).length;
 default:return 0;
 }
}
function locationPower(b,side,id){
 const cards=(b.board[side]??[]).filter(i=>i.ownerId===id&&!i.pendingReveal);
 let total=cards.reduce((n,i)=>n+cardPower(b,i),0);
 total+=state(b).modifiers.filter(m=>m.ownerId===id&&m.side===side).reduce((n,m)=>n+m.amount,0);
 for(const {item,side:ownSide}of all(b))if(item.ownerId===id&&ownSide!==side&&getAbilityKey(item.card)==='reed_richards_epic')total+=2;
 return total;
}
function addLocation(b,id,side,amount){state(b).modifiers.push({ownerId:id,side,amount});}
function shield(b,id,side=null,until=null,source='ability'){
 state(b).shields.push({id:'s'+state(b).nextShield++,ownerId:id,side,until,source});
}
function activeShields(b){return state(b).shields.filter(s=>s.until==null||s.until>=b.turn);}
function immunity(b,item,kind){
 const key=getAbilityKey(item.card);
 if(item.pendingReveal)return false;
 if(key==='wolverine_legendary'||key==='miles_morales_legendary')return true;
 if(item.ability?.immuneUntil>=b.turn)return true;
 return key==='the_thing_epic'&&['reduce','move','swap','return'].includes(kind);
}
function removeShield(b,s){const list=state(b).shields;const i=list.indexOf(s);if(i>=0)list.splice(i,1);}
function consumeProtection(b,ownerId,sides,atomic=false,source=null,meta={}){
 const shields=activeShields(b).filter(s=>s.ownerId===ownerId);
 const bypass=meta.bypass??state(b).bypass[source?.ownerId];
 const ignored=s=>bypass?.scope==='board'||(bypass?.scope==='location'&&s.side===bypass.side);
 const local=sides.map(side=>shields.find(s=>s.side===side&&!ignored(s))).filter(Boolean);
 if(local.length){
   for(const s of atomic?local.slice(0,1):local)removeShield(b,s);
   log(b,'A location shield blocked '+(atomic?'the ability.':'the attack at '+local.map(s=>s.side).join(', ')+'.'));
   return atomic?new Set(sides):new Set(local.map(s=>s.side));
 }
 const board=shields.find(s=>s.side==null&&!ignored(s));
 if(board){removeShield(b,board);log(b,'A board shield blocked the attack.');return new Set(sides);}
 return new Set();
}
function takeBypass(b,source,meta){
 if(meta.reflected||meta.bypassShields)return null;
 const buff=state(b).bypass[source.ownerId];
 if(!buff)return null;
 if(buff.scope==='location'&&meta.sides&&!meta.sides.includes(buff.side))return null;
 delete state(b).bypass[source.ownerId];return buff;
}
function returnToHand(b,item,reset=false){
 const side=locate(b,item);if(!side)return;
 b.board[side].splice(b.board[side].indexOf(item),1);
 if(reset||getAbilityKey(item.card)==='deadpool_legendary')item.ability={delta:0,activated:false};
 delete item.pendingReveal;(b.hands[item.ownerId]??=[]).push(item);
 log(b,displayName(b,item)+' returned to hand.');
}
function move(b,item,destination){
 const from=locate(b,item);if(!from||from===destination||!SIDES.includes(destination))return false;
 if(!canPlace(b,item.ownerId,destination,{movement:true}))return false;
 b.board[from].splice(b.board[from].indexOf(item),1);b.board[destination].push(item);return true;
}
function exchange(b,own,enemy){
 const a=locate(b,own),z=locate(b,enemy);if(!a||!z||own===enemy||own.ownerId===enemy.ownerId)return false;
 const nextA=enemy.ownerId,nextZ=own.ownerId;
 const count=(side,id)=>b.board[side].filter(i=>i!==own&&i!==enemy&&i.ownerId===id).length;
 if(count(a,nextA)>=4||count(z,nextZ)>=4)return false;
 if(!canPlace(b,nextA,a,{movement:true,ignore:[own,enemy]})||!canPlace(b,nextZ,z,{movement:true,ignore:[own,enemy]}))return false;
 own.ownerId=nextA;enemy.ownerId=nextZ;return true;
}
// All enemy card effects use this path: shields -> reflection -> Deadpool -> immunity.
function attack(b,source,targets,kind,apply,meta={}){
 targets=targets.filter(i=>locate(b,i)&&!i.pendingReveal);if(!targets.length)return [];
 const targetSides=[...new Set(targets.map(i=>locate(b,i)))];
 const bypass=takeBypass(b,source,{...meta,sides:targetSides});
 const owner=targets[0].ownerId;
 const blocked=meta.bypassShields?new Set():consumeProtection(b,owner,targetSides,meta.atomic,source,{...meta,bypass});
 if(meta.atomic&&blocked.size)return [];
 let remaining=targets.filter(i=>!blocked.has(locate(b,i)));
 if(!meta.weapon&&!meta.reflected){
   const mirror=all(b).find(r=>r.item.ownerId===owner&&r.item.ability?.reflect&&remaining.some(i=>locate(b,i)===r.side));
   if(mirror){
     mirror.item.ability.reflect=false;
     const reflected=remaining.filter(i=>locate(b,i)===mirror.side);
     remaining=remaining.filter(i=>locate(b,i)!==mirror.side);
     if(meta.atomic)remaining=[];
     log(b,'Scarlet Witch reflected an enemy ability.');
     if(meta.reflect)meta.reflect(reflected,mirror.item);
     else if(locate(b,source)&&!immunity(b,source,kind))for(const original of reflected)apply(source,original,true);
   }
 }
 if(meta.atomic&&remaining.some(i=>immunity(b,i,kind))){log(b,'Individual protection blocked the entire exchange.');return [];}
 const result=[];
 for(let target of remaining){
   const originalTarget=target;
   if(immunity(b,target,kind)){log(b,displayName(b,target)+' resisted the enemy effect.');continue;}
   let absorbed=null;
   if(meta.individual&&!meta.reflected){
     absorbed=all(b).find(r=>r.item!==target&&r.item.ownerId===target.ownerId&&r.item.ability?.absorbUntil>=b.turn)?.item;
     if(absorbed){target=absorbed;log(b,'Deadpool absorbed the enemy effect.');}
   }
   if(kind==='destroy'&&(absorbed||target.ability?.absorbUntil>=b.turn)){returnToHand(b,target,true);result.push(target);continue;}
   apply(target,originalTarget,false);result.push(target);
   if(locate(b,target)&&target.ability?.absorbUntil>=b.turn&&cardPower(b,target)<=0)returnToHand(b,target,true);
 }
 return result;
}
function reduce(b,source,targets,amount,meta={}){
 const amounts=new Map(targets.map(t=>[t,Math.max(0,typeof amount==='function'?amount(t):amount)]));
 return attack(b,source,targets,'reduce',(target,original,reflected)=>{
   const n=reflected&&typeof amount==='function'?Math.max(0,amount(target)):(amounts.get(original)??0);target.ability.delta-=n;
   log(b,displayName(b,target)+' lost '+n+' points'+(reflected?' from reflection.':'.'));
 },meta);
}
function attackLocation(b,source,side,amount,meta={}){
 const id=opponent(b,source.ownerId);
 const bypass=takeBypass(b,source,{...meta,sides:[side]});
 if(!meta.skipProtection&&consumeProtection(b,id,[side],false,source,{...meta,bypass}).size)return false;
 // Original rules: fixed location deductions affect totals, not individual cards.
 if(!meta.weapon&&!meta.reflected){
   const mirror=(b.board[side]??[]).find(i=>i.ownerId===id&&!i.pendingReveal&&i.ability?.reflect);
   if(mirror){mirror.ability.reflect=false;if(!immunity(b,source,'reduce'))source.ability.delta-=amount;log(b,'Scarlet Witch reflected the location deduction.');return false;}
 }
 addLocation(b,id,side,-amount);log(b,'Enemy '+side+' lost '+amount+' location points.');return true;
}
function canPlace(b,id,side,options={}){
 if(!SIDES.includes(side))return false;
 const ignore=options.ignore??[];
 if((b.board[side]??[]).filter(i=>i.ownerId===id&&!ignore.includes(i)).length>=4)return false;
 const locks=state(b).locks.filter(l=>l.ownerId===id&&l.side===side&&b.turn>=l.start&&b.turn<=l.end);
 if(locks.some(l=>l.kind==='punisher')&&!options.movement)return false;
 const blockedSpaces=locks.filter(l=>l.kind==='web').length;
 return (b.board[side]??[]).filter(i=>i.ownerId===id&&!ignore.includes(i)).length<4-blockedSpaces;
}
function optionsFor(b,request){
 const source=find(b,request.sourceUid);if(!source)return [];
 const kind=request.steps[request.step],side=locate(b,source);
 const option=item=>({value:item.battleUid,label:displayName(b,item)+' · '+locate(b,item)+(isHidden(b,item)?'':' · '+cardPower(b,item)+' pts')});
 const first=find(b,request.picks[0]);
 switch(kind){
 case 'friendlyOther':return friendly(b,source).filter(r=>r.item!==source).map(r=>option(r.item));
 case 'enemyCard':return enemies(b,source).map(r=>option(r.item));
 case 'enemyOtherLocation':return enemies(b,source).filter(r=>r.item!==first&&r.side!==locate(b,first)).map(r=>option(r.item));
 case 'enemySpider':return enemies(b,source).filter(r=>isSpider(r.item)).map(r=>option(r.item));
 case 'friendlySpiderHere':return friendly(b,source).filter(r=>r.side===side&&r.item!==source&&isSpider(r.item)).map(r=>option(r.item));
 case 'friendlyElsewhere':return canPlace(b,source.ownerId,side,{movement:true})?friendly(b,source).filter(r=>r.side!==side).map(r=>option(r.item)):[];
 case 'enemySide':return SIDES.map(s=>({value:s,label:b.locations[SIDES.indexOf(s)]?.name??s}));
 case 'shieldSide':return SIDES.map(s=>({value:s,label:b.locations[SIDES.indexOf(s)]?.name??s}));
 case 'newLocation':return state(b).locationPool.filter(l=>!b.locations.some(current=>normalize(current.name)===normalize(l.name))).map(l=>({value:normalize(l.name),label:l.name}));
 case 'weapon':return WEAPONS.filter(w=>!state(b).weaponUsed[opponent(b,source.ownerId)]?.includes(w)).map(w=>({value:w,label:w.replace(/_/g,' ')}));
 default:return [];
 }
}
function enqueueReveals(b,items){state(b).queue.push(...items.map(i=>i.battleUid));}
function nextRequest(b){
 const s=state(b);if(s.request)return s.request;
 while(s.queue.length){
   const item=find(b,s.queue.shift());if(!item)continue;
   delete item.pendingReveal;
   if(item.ability.activated)continue;
   const key=getAbilityKey(item.card),steps=TARGETS[key]??[];
   if(!key){item.ability.activated=true;continue;}
   const request={sourceUid:item.battleUid,ownerId:item.ownerId,key,steps,step:0,picks:[],nonce:++s.nonce};
   if(steps.length&&optionsFor(b,request).length){s.request=request;return request;}
   activate(b,item,key,[]);
 }
 return null;
}
function selectTarget(b,id,nonce,value){
 const request=state(b).request;
 if(!request||request.ownerId!==id||request.nonce!==Number(nonce))return {ok:false,error:'This ability choice is no longer active.'};
 if(!optionsFor(b,request).some(o=>o.value===value))return {ok:false,error:'That target is no longer available.'};
 request.picks.push(value);request.step++;request.nonce=++state(b).nonce;
 if(request.step<request.steps.length){
   if(optionsFor(b,request).length)return {ok:true,request};
   log(b,'No legal second target; the ability had no effect.');
   const source=find(b,request.sourceUid);if(source)source.ability.activated=true;
 }else{const source=find(b,request.sourceUid);if(source)activate(b,source,request.key,request.picks);}
 state(b).request=null;return {ok:true,request:nextRequest(b)};
}
function activate(b,source,key,picks=[]){
 if(source.ability.activated)return;
 source.ability.activated=true;const owner=source.ownerId,enemy=opponent(b,owner),side=locate(b,source);
 const a=find(b,picks[0]),z=find(b,picks[1]),own=friendly(b,source);
 if(key==='sue_storm_epic')source.ability.hiddenUntil=b.turn+1;
 log(b,isHidden(b,source)?'A hidden card activated an ability.':displayName(b,source)+' activated '+key.replace(/_/g,' ')+'.');
 const boost=(targets,n)=>targets.forEach(t=>{t.ability.delta+=n;});
 switch(key){
 case 'iron_man_legendary':boost(own.map(r=>r.item),2);{const t=random(b,enemies(b,source).map(r=>r.item));if(t)reduce(b,source,[t],2,{individual:true});}break;
 case 'iron_man_epic':boost(own.filter(r=>r.side===side).map(r=>r.item),2);break;
 case 'iron_man_rare':state(b).scans.push({ownerId:owner,kind:'shield',until:b.turn+1});break;
 case 'spider_man_legendary':case 'loki_legendary':
   if(a&&z&&a!==source&&a.ownerId===owner&&z.ownerId===enemy){
     const done=attack(b,source,[z],'swap',target=>exchange(b,a,target),{atomic:true,individual:true,
       reflect:()=>{if(!immunity(b,source,'swap'))exchange(b,source,z);}});
     if(done.length)log(b,'Battle ownership exchanged; points stay attached to the cards.');
   }break;
 case 'spider_man_epic':
   if(a&&z&&a.ownerId===enemy&&z.ownerId===enemy&&locate(b,a)!==locate(b,z)){
     const firstSide=locate(b,a),secondSide=locate(b,z);
     attack(b,source,[a,z],'move',target=>{if(target===a){const i=b.board[firstSide].indexOf(a),j=b.board[secondSide].indexOf(z);b.board[firstSide][i]=z;b.board[secondSide][j]=a;}},{atomic:true,
       reflect:()=>move(b,source,firstSide)});
   }break;
 case 'hulk_legendary':if(a)reduce(b,source,[a],t=>Math.floor(Math.max(0,cardPower(b,t))/2),{individual:true});break;
 case 'hulk_epic':source.ability.immuneUntil=b.turn+2;break;
 case 'thor_legendary':if(SIDES.includes(picks[0]))reduce(b,source,(b.board[picks[0]]??[]).filter(i=>i.ownerId===enemy&&!i.pendingReveal),3);break;
 case 'thor_epic':{const sh=activeShields(b).find(sh=>sh.ownerId===enemy&&sh.side===picks[0]);if(sh){
   const mirror=(b.board[picks[0]]??[]).find(i=>i.ownerId===enemy&&!i.pendingReveal&&i.ability?.reflect);
   if(mirror){mirror.ability.reflect=false;const reflected=activeShields(b).find(sh=>sh.ownerId===owner&&sh.side===side);if(reflected)removeShield(b,reflected);log(b,'Scarlet Witch reflected shield breaking.');}
   else {removeShield(b,sh);log(b,'Thor broke a location shield.');}
 }}break;
 case 'thanos_legendary':{
   const chosen=random(b,SIDES),targets=(b.board[chosen]??[]).filter(i=>i.ownerId===enemy&&!i.pendingReveal&&!immunity(b,i,'reduce'));
   const total=targets.reduce((sum,i)=>sum+Math.max(0,cardPower(b,i)),0);
   attackLocation(b,source,chosen,Math.floor(total/2));break;
 }
 case 'captain_america_legendary':shield(b,owner);break;
 case 'captain_america_epic':shield(b,owner,side);break;
 case 'hawkeye_legendary':state(b).bypass[owner]={scope:'board'};break;
 case 'hawkeye_epic':state(b).bypass[owner]={scope:'location',side};break;
 case 'hawkeye_rare':boost(own.filter(r=>r.side===side&&inFamily(r.item,OG6)).map(r=>r.item),2);break;
 case 'black_widow_legendary':if(WEAPONS.includes(picks[0])){
   const boardShield=activeShields(b).find(sh=>sh.ownerId===enemy&&sh.side==null);
   if(boardShield){removeShield(b,boardShield);log(b,'A board shield blocked weapon sabotage.');}
   else {state(b).disabledWeapons[enemy]??={};state(b).disabledWeapons[enemy][picks[0]]=b.turn+2;log(b,picks[0].replace(/_/g,' ')+' disabled for three rounds.');}
 }break;
 case 'black_widow_epic':addLocation(b,owner,side,5);break;
 case 'venom_legendary':if(a&&a.ownerId===owner&&locate(b,a)===side&&isSpider(a))boost([a],cardPower(b,source));break;
 case 'venom_epic':if(a&&isSpider(a))reduce(b,source,[a],t=>Math.floor(Math.max(0,cardPower(b,t))/2),{individual:true});break;
 case 'scarlet_witch_legendary':if(a)reduce(b,source,[a],t=>Math.max(0,cardPower(b,t)-1),{individual:true});break;
 case 'scarlet_witch_epic':source.ability.reflect=true;break;
 case 'loki_epic':if(a){const applied=reduce(b,source,[a],3,{individual:true,reflect:(_,mirror)=>{if(!immunity(b,source,'reduce')){source.ability.delta-=3;mirror.ability.delta+=3;}}});if(applied.length)source.ability.delta+=3;}break;
 case 'daredevil_legendary':SIDES.forEach(s=>addLocation(b,owner,s,3));{
   const blocked=consumeProtection(b,enemy,SIDES,false,source,{bypass:takeBypass(b,source,{sides:SIDES})});
   SIDES.filter(s=>!blocked.has(s)).forEach(s=>attackLocation(b,source,s,2,{skipProtection:true}));
 }break;
 case 'daredevil_epic':if(a)reduce(b,source,[a],5,{individual:true});break;
 case 'punisher_legendary':{
   const blocked=consumeProtection(b,enemy,SIDES,false,source,{bypass:takeBypass(b,source,{sides:SIDES})});
   SIDES.filter(s=>!blocked.has(s)).forEach(s=>attackLocation(b,source,s,4,{skipProtection:true}));
 }break;
 case 'punisher_epic':if(!consumeProtection(b,enemy,[side],false,source).size){
   const mirror=(b.board[side]??[]).find(i=>i.ownerId===enemy&&!i.pendingReveal&&i.ability?.reflect);
   if(mirror){mirror.ability.reflect=false;state(b).locks.push({ownerId:owner,side,kind:'punisher',start:b.turn+1,end:b.turn+1});log(b,'Scarlet Witch reflected the placement block.');}
   else state(b).locks.push({ownerId:enemy,side,kind:'punisher',start:b.turn+1,end:b.turn+1});
 }break;
 case 'doctor_strange_legendary':{
   const replacement=state(b).locationPool.find(l=>normalize(l.name)===picks[0]);
   if(replacement&&!b.locations.some(l=>normalize(l.name)===normalize(replacement.name))&&!consumeProtection(b,enemy,[side],false,source).size){b.locations[SIDES.indexOf(side)]={...replacement,revealTurn:1};log(b,'Location changed to '+replacement.name+'; cards stay.');}
 }break;
 case 'doctor_strange_epic':if(a&&a.ownerId===owner)move(b,a,side);break;
 case 'black_panther_legendary':SIDES.forEach(s=>addLocation(b,owner,s,4));shield(b,owner,null,b.turn);break;
 case 'black_panther_epic':source.ability.delta+=own.filter(r=>r.side===side&&r.item!==source).length*2;break;
 case 'silver_surfer_epic':if(a)attack(b,source,[a],'return',target=>returnToHand(b,target),{individual:true});break;
 case 'doctor_doom_epic':{
   const hand=b.hands[enemy]??[],victim=random(b,hand);if(!victim)break;
   const occupied=new Set(state(b).identities);
   const eligible=(state(b).collectionCandidates[enemy]??[]).filter(i=>['legendary','epic','rare','uncommon'].includes(String(i.card?.tier).trim().toLowerCase())&&!occupied.has(identity(i)));
   const replacement=random(b,eligible);if(replacement){const copy=prepareItem(b,structuredClone(replacement),enemy);copy.originalOwnerId=enemy;copy.ownerId=enemy;copy.ability={delta:0,activated:false};hand[hand.indexOf(victim)]=copy;privateLog(b,enemy,'Doctor Doom changed a hand card into '+copy.card.name+'.');log(b,'Doctor Doom transmuted one enemy hand card.');}break;
 }
 case 'miles_morales_legendary':source.ability.delta+=own.filter(r=>r.side===side&&r.item!==source&&isSpider(r.item)).length*2;if(a&&isSpider(a))reduce(b,source,[a],2,{individual:true});break;
 case 'deadpool_legendary':source.ability.absorbUntil=b.turn+1;break;
 case 'knull_legendary':{
   const victims=enemies(b,source).filter(r=>SYMBIOTES.has(normalize(r.item.card.name))).map(r=>r.item);
   attack(b,source,victims,'destroy',target=>{const s=locate(b,target);if(s)b.board[s].splice(b.board[s].indexOf(target),1);log(b,displayName(b,target)+' was destroyed.');},{bypassShields:true});break;
 }
 case 'galactus_epic':if(!own.some(r=>r.side===side&&r.item!==source))source.ability.delta+=8;break;
 case 'sue_storm_epic':source.ability.hiddenUntil=b.turn+1;source.ability.sueUntil=b.turn+1;state(b).scans.push({ownerId:owner,kind:'hand',until:b.turn+1});break;
 case 'human_torch_epic':source.ability.delta+=4;break;
 // Remaining abilities are calculated dynamically in ongoingBonus.
 default:break;
 }
}
function identity(item){const e=item.entry??item;return JSON.stringify([e.season??e.cardSeason??item.card?.season??0,normalize(e.event??item.card?.event),item.card?.id??e.cardId]);}
function startTurn(b){
 const s=state(b);if(s.lastEnergyTurn>=b.turn)return;
 const gain=b.turn-s.lastEnergyTurn;for(const id of players(b))s.weaponEnergy[id]=(s.weaponEnergy[id]??0)+gain;
 s.lastEnergyTurn=b.turn;
 s.shields=s.shields.filter(sh=>sh.until==null||sh.until>=b.turn);
 s.locks=s.locks.filter(l=>l.end>=b.turn);
}
function endTurn(b){
 const s=state(b);if(s.endedTurn>=b.turn)return;s.endedTurn=b.turn;
 for(const {item}of all(b)){
   const key=getAbilityKey(item.card);
   if(['wolverine_legendary','wolverine_epic'].includes(key))item.ability.delta++;
   if(item.ability.sueUntil>=b.turn)item.ability.delta++;
 }
 for(const {item}of all(b))if(item.ability.absorbUntil<=b.turn&&getAbilityKey(item.card)==='deadpool_legendary')returnToHand(b,item,true);
}
function privateIntel(b,id){
 const s=state(b),enemy=opponent(b,id),lines=[];
 if(s.scans.some(scan=>scan.ownerId===id&&scan.kind==='shield'&&scan.until>=b.turn)){
   const detected=activeShields(b).filter(sh=>sh.ownerId===enemy);
   lines.push('Shield scan: '+(detected.length?detected.map(sh=>sh.side??'entire board').join(', '):'none active'));
 }
 if(s.scans.some(scan=>scan.ownerId===id&&scan.kind==='hand'&&scan.until>=b.turn))lines.push('Enemy hand: '+((b.hands[enemy]??[]).map(i=>i.card.name+' ('+i.card.tier+')').join(', ')||'empty'));
 return lines.concat((s.privateLog[id]??[]).slice(-4).map(e=>e.text)).join('\n');
}
function revealSue(b,id,uid){const item=find(b,uid);if(!item||item.ownerId!==id||!isHidden(b,item))return false;item.ability.revealedEarly=true;log(b,'Sue Storm revealed early.');return true;}
function useWeapon(b,id,type,side){
 const s=state(b);if(!WEAPONS.includes(type)||!SIDES.includes(side))return {ok:false,error:'Invalid weapon or location.'};
 if(b.turn<2)return {ok:false,error:'Weapons unlock in round 2.'};
 if(s.weaponUsed[id]?.includes(type))return {ok:false,error:'This weapon has already been used.'};
 if(s.disabledWeapons[id]?.[type]>=b.turn)return {ok:false,error:'This weapon is disabled.'};
 if((s.weaponEnergy[id]??0)<2)return {ok:false,error:'Not enough weapon energy.'};
 // Caller must supply inventory obtained from its inventory/crafting system.
 if(!(b.weaponInventory?.[id]?.[type]>0))return {ok:false,error:'You do not own this weapon in this battle.'};
 const source={ownerId:id,card:{name:type},ability:{delta:0}},enemy=opponent(b,id);
 s.weaponEnergy[id]-=2;(s.weaponUsed[id]??=[]).push(type);b.weaponInventory[id][type]--;
 const bypass=['webshooter','wolverine_claws','mjolnir'].includes(type)?takeBypass(b,source,{sides:[side]}):null;
 if(type==='captain_shield')shield(b,id,side,null,'weapon');
 else if(type==='arc_reactor')addLocation(b,id,side,10);
 else if(!consumeProtection(b,enemy,[side],false,source,{bypass}).size){
   if(type==='webshooter'){
     const count=(b.board[side]??[]).filter(i=>i.ownerId===enemy).length;
     if(count<4)s.locks.push({ownerId:enemy,side,kind:'web',start:b.turn,end:5});
   }else if(type==='wolverine_claws')addLocation(b,enemy,side,-10);
   else if(type==='mjolnir')addLocation(b,enemy,side,-Math.floor(Math.max(0,locationPower(b,side,enemy))*.25));
 }
 log(b,'A weapon was used'+(type==='captain_shield'?'.':': '+type.replace(/_/g,' ')+'.'));
 return {ok:true};
}
module.exports={SIDES,WEAPONS,initBattle,prepareItem,all,find,locate,cardPower,locationPower,ongoingBonus,
 canPlace,enqueueReveals,nextRequest,optionsFor,selectTarget,activate,endTurn,startTurn,privateIntel,
 isHidden,displayName,revealSue,useWeapon,immunity,identity};
