'use strict';
const {ActionRowBuilder, ButtonBuilder, ButtonStyle}=require('discord.js');
const connectDB=require('../database');
const engine=require('./abilityEngine');
// Storage keys must match inventory.js and craft.js; engine keys are internal.
const WEAPONS={
 webshooter:{key:'web_shooter',name:'Web Shooter'},
 captain_shield:{key:'cap_shield',name:"Captain America's Shield"},
 arc_reactor:{key:'arc_reactor',name:'Arc Reactor'},
 wolverine_claws:{key:'wolverine_claws',name:"Wolverine's Claws"},
 mjolnir:{key:'mjolnir',name:'Mjolnir'}
};
async function loadInventory(b,db){
 b.weaponInventory={};
 for(const id of [b.player1Id,b.player2Id]){
  const doc=await db.collection('inventory').findOne({userId:id});
  b.weaponInventory[id]=Object.fromEntries(Object.entries(WEAPONS).map(([type,w])=>[type,Math.max(0,Number(doc?.weapons?.[w.key])||0)]));
 }
}
function check(b,id,type,side){
 if(![b.player1Id,b.player2Id].includes(id))return 'You are not part of this battle.';
 if(b.finished||b.phase!=='playing'||b.completingTurn||b.revealing)return 'Wait until card placement resumes.';
 if(b.lockedPlayers?.[id])return 'Your turn is locked. Use weapons before locking.';
 if(b.turn<2)return 'Weapons unlock in round 2.';
 if(!WEAPONS[type]||!engine.SIDES.includes(side))return 'Invalid weapon or location.';
 if(b.abilityState.weaponUsed[id]?.includes(type))return 'You already used this weapon in this battle.';
 if(b.abilityState.disabledWeapons[id]?.[type]>=b.turn)return 'Black Widow has disabled this weapon.';
 if((b.abilityState.weaponEnergy[id]??0)<2)return 'You need 2 weapon energy.';
 if(!(b.weaponInventory?.[id]?.[type]>0))return 'You do not own this weapon.';
 return null;
}
function panel(b,id){
 const s=b.abilityState,rows=[],energy=s.weaponEnergy[id]??0;
 const row=new ActionRowBuilder();
 for(const [type,w] of Object.entries(WEAPONS)){
  const owned=b.weaponInventory?.[id]?.[type]??0;
  row.addComponents(new ButtonBuilder().setCustomId(`battle_weaponpick_${b.id}_${b.turn}_${type}`)
   .setLabel(`${w.name} (${owned})`).setStyle(ButtonStyle.Primary)
   .setDisabled(Boolean(check(b,id,type,'left'))));
 }
 rows.push(row);
 return {content:`**Weapons · Round ${b.turn}/6**\n⚡ Weapon energy: **${energy}** · Each use costs **2**.\n+1 energy per round, saved until used. Weapons unlock in round 2. Each type can be used once per battle.\nPick a weapon, then its location.`,components:rows};
}
async function handle(i,b,refresh){
 const id=i.user.id;
 // Acknowledge before connecting to MongoDB or rendering a new board.
 if(i.customId===`battle_weaponopen_${b.id}`){
  await i.deferReply({ephemeral:true});
  if(b.finished||b.phase!=='playing'||b.lockedPlayers[id])return i.editReply({content:'Weapons are available during your unlocked card placement turn.',components:[]});
  return i.editReply(panel(b,id));
 }
 const pickPrefix=`battle_weaponpick_${b.id}_${b.turn}_`;
 if(i.customId.startsWith(pickPrefix)){
  await i.deferUpdate();
  const type=i.customId.slice(pickPrefix.length),error=check(b,id,type,'left');
  if(error)return i.editReply({content:error,components:[]});
  const row=new ActionRowBuilder();
  for(const [index,side]of engine.SIDES.entries())row.addComponents(new ButtonBuilder()
   .setCustomId(`battle_weaponuse_${b.id}_${b.turn}_${type}_${side}`)
   .setLabel((b.locations[index]?.name??side).slice(0,80)).setStyle(ButtonStyle.Primary));
  return i.editReply({content:`**${WEAPONS[type].name}** · Choose a location.\nThis spends 2 weapon energy and consumes 1 inventory unit, even if blocked.`,components:[row]});
 }
 const prefix=`battle_weaponuse_${b.id}_${b.turn}_`;
 if(!i.customId.startsWith(prefix))return i.reply({content:'This weapon panel expired. Open Weapons from the latest board.',ephemeral:true});
 const tail=i.customId.slice(prefix.length),side=tail.slice(tail.lastIndexOf('_')+1),type=tail.slice(0,tail.lastIndexOf('_'));
 const error=check(b,id,type,side);
 if(error)return i.reply({content:error,ephemeral:true});
 // Set the lock synchronously before the first await. Other battle actions must wait.
 if(b.weaponApplying)return i.reply({content:'A weapon is resolving. Try again shortly.',ephemeral:true});
 b.weaponApplying=true;
 let deducted=false,applied=false,inventory;
 try{
  await i.deferUpdate();
  const db=await connectDB();inventory=db.collection('inventory');
  const key=`weapons.${WEAPONS[type].key}`;
  const result=await inventory.updateOne({userId:id,[key]:{$gte:1}},{$inc:{[key]:-1}});
  if(!result.modifiedCount){
   b.weaponInventory[id][type]=0;
   return await i.editReply({content:'That weapon is no longer in your inventory. Nothing was used.',components:[]});
  }
  deducted=true;
  const resultEffect=engine.useWeapon(b,id,type,side);
  if(!resultEffect.ok)throw new Error(resultEffect.error);
  applied=true;
  await i.editReply({content:`✅ ${WEAPONS[type].name} used. Weapon energy remaining: **${b.abilityState.weaponEnergy[id]}**.`,components:[]});
  await refresh();
 }catch(error){
  console.error('[BATTLE WEAPON]',error);
  if(deducted&&!applied){
   try{await inventory.updateOne({userId:id},{$inc:{[`weapons.${WEAPONS[type].key}`]:1}});}catch(refundError){console.error('[WEAPON REFUND FAILED]',refundError);}
  }
  const payload={content:applied?'✅ Weapon effect and inventory were saved, but the display failed. Open the latest battle board.':'Could not complete weapon use. Check your inventory before retrying.',components:[]};
  if(i.deferred||i.replied)await i.editReply(payload).catch(()=>{});
  else await i.reply({...payload,ephemeral:true}).catch(()=>{});
 }finally{b.weaponApplying=false;}
}
module.exports={WEAPONS,loadInventory,check,panel,handle};
