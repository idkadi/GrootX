'use strict';
const {ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const engine=require('./abilityEngine');
const {abilityName}=require('./abilityNames');
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
 return {content:(`**${abilityName(r.key)}** · ${source?.card.name??'Card'}\nChoose ${r.steps[r.step].replace(/([A-Z])/g,' $1').toLowerCase()} (${r.step+1}/${r.steps.length}).\n${intel}`).slice(0,1900),components:rows,files:[]};
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
   // Claim this request before awaiting acknowledgement. Duplicate clicks cannot
   // race the second step or mutate the engine twice.
   if(b.abilityChoosing){await interaction.reply({content:'Your ability choice is resolving. Please wait.',ephemeral:true});return true;}
   b.abilityChoosing=true;
   try{
     await interaction.deferUpdate();
     const rng=b.abilityState.rng;
     const before=structuredClone({board:b.board,hands:b.hands,decks:b.decks,locations:b.locations,
       abilityState:{...b.abilityState,rng:null}});
     let result;
     try{result=engine.selectTarget(b,id,nonce,value);}catch(error){
       // Keep the current choice retryable if an effect fails mid-resolution.
       Object.assign(b,before);b.abilityState.rng=rng;throw error;
     }
     if(!result.ok){await interaction.editReply({content:result.error,components:[]});return true;}
     let displayError;
     try{
       await interaction.editReply(result.request?.ownerId===id?choicePayload(b):{content:'Ability resolved.',files:[],components:[]});
     }catch(error){displayError=error;console.error('[ABILITY PANEL]',error);}
     // A multi-step request remains active. Do not regenerate the board between
     // selecting a friendly card and selecting the enemy card.
     if(result.request===r){
       if(displayError)await interaction.followUp({content:'The panel could not refresh. Open Choose Ability Target again to finish your choice.',ephemeral:true}).catch(()=>{});
     }else{
       // Continue the reveal even if editing the private panel failed.
       await resume(true);
     }
   }catch(error){
     console.error('[ABILITY CHOICE]',error);
     if(interaction.deferred||interaction.replied){
       await interaction.followUp({content:'Could not refresh this ability. Use the latest Choose Ability Target button.',ephemeral:true}).catch(()=>{});
     }else await interaction.reply({content:'Could not acknowledge your choice. Open the latest ability panel and try again.',ephemeral:true}).catch(()=>{});
   }finally{b.abilityChoosing=false;}
   return true;
 }
 await interaction.reply({content:'This battle button is no longer available.',ephemeral:true});return true;
}
module.exports={choicePayload,boardButtons,handle};
