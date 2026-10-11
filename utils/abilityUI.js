'use strict';
const {ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const engine=require('./abilityEngine');
function choicePayload(b,page=0){
 const r=b.abilityState?.request;if(!r)return {content:'No ability needs a choice.',components:[],files:[]};
 const source=engine.find(b,r.sourceUid),options=engine.optionsFor(b,r),pages=Math.max(1,Math.ceil(options.length/20));
 page=Math.max(0,Math.min(pages-1,Number(page)||0));const rows=[];
 for(let offset=page*20;offset<Math.min(options.length,(page+1)*20);offset+=5){
   const row=new ActionRowBuilder();
   for(let i=offset;i<Math.min(options.length,offset+5);i++)row.addComponents(new ButtonBuilder()
     .setCustomId(`battle_abpick_${b.id}_${r.nonce}_${i}`).setLabel(options[i].label.slice(0,80)).setStyle(ButtonStyle.Primary));
   rows.push(row);
 }
 if(pages>1)rows.push(new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId(`battle_abpage_${b.id}_${r.nonce}_${page-1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
   new ButtonBuilder().setCustomId(`battle_abpage_${b.id}_${r.nonce}_${page+1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page===pages-1)));
 const intel=engine.privateIntel(b,r.ownerId);
 return {content:(`**${source?.card.name??'Card'} ability**\nChoose ${r.steps[r.step].replace(/([A-Z])/g,' $1').toLowerCase()} (${r.step+1}/${r.steps.length}).\n${intel}`).slice(0,1900),components:rows,files:[]};
}
function boardButtons(b){
 return [new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId(`battle_abopen_${b.id}`).setLabel('Choose Ability Target').setStyle(ButtonStyle.Primary),
   new ButtonBuilder().setCustomId(`battle_abintel_${b.id}`).setLabel('Private Intel').setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId(`battle_forfeit_${b.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger))];
}
async function handle(interaction,b,resume){
 const prefix=`battle_ab`;if(!interaction.customId.startsWith(prefix))return false;
 const id=interaction.user.id;
 if(interaction.customId===`battle_abintel_${b.id}`){
   const hidden=engine.all(b).filter(r=>r.item.ownerId===id&&engine.isHidden(b,r.item));
   const row=new ActionRowBuilder();for(const {item}of hidden.slice(0,5))row.addComponents(new ButtonBuilder()
     .setCustomId(`battle_abreveal_${b.id}_${item.battleUid}`).setLabel('Reveal '+item.card.name).setStyle(ButtonStyle.Secondary));
   await interaction.reply({content:(engine.privateIntel(b,id)||'No active scans.').slice(0,1900),ephemeral:true,components:row.components.length?[row]:[]});return true;
 }
 if(interaction.customId.startsWith(`battle_abreveal_${b.id}_`)){
   const uid=interaction.customId.split('_').pop();const ok=engine.revealSue(b,id,uid);
   await interaction.update({content:ok?'Sue Storm revealed. Her scan and turn gains continue.':'That hidden card is no longer available.',components:[]});
   if(ok)await resume(false);return true;
 }
 const r=b.abilityState?.request;
 if(!r||r.ownerId!==id){await interaction.reply({content:'There is no ability choice waiting for you.',ephemeral:true});return true;}
 if(interaction.customId===`battle_abopen_${b.id}`){await interaction.reply({...choicePayload(b),ephemeral:true});return true;}
 if(interaction.customId.startsWith(`battle_abpage_${b.id}_`)){
   const parts=interaction.customId.split('_'),page=Number(parts.pop()),nonce=Number(parts.pop());
   if(nonce!==r.nonce){await interaction.reply({content:'This choice expired. Open the latest ability panel.',ephemeral:true});return true;}
   await interaction.update(choicePayload(b,page));return true;
 }
 if(interaction.customId.startsWith(`battle_abpick_${b.id}_`)){
   const parts=interaction.customId.split('_'),index=Number(parts.pop()),nonce=Number(parts.pop());
   const options=engine.optionsFor(b,r),value=options[index]?.value;
   if(nonce!==r.nonce||!Number.isInteger(index)||!value){await interaction.reply({content:'This target choice expired.',ephemeral:true});return true;}
   const result=engine.selectTarget(b,id,nonce,value);
   if(!result.ok){await interaction.reply({content:result.error,ephemeral:true});return true;}
   await interaction.deferUpdate();
   await interaction.editReply(result.request?.ownerId===id?choicePayload(b):{content:'Ability resolved.',files:[],components:[]});
   await resume(true);return true;
 }
 await interaction.reply({content:'This battle button is no longer available.',ephemeral:true});return true;
}
module.exports={choicePayload,boardButtons,handle};
