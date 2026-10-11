'use strict';
const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const RULES = [
 ['iron_man', ['Iron Man','Tony Stark','Iron Man Mark 2','Iron Man Mark 3'], ['legendary','epic','rare']],
 ['spider_man', ['Spider-Man','Iron Spider'], ['legendary','epic','rare']],
 ['spider_man', ['Scarlet Spider','Spider-Punk','Jessica Drew','Pavitr Prabhakar','Spider-Ham','Night Monkey'], ['rare']],
 ['hulk', ['Hulk'], ['legendary','epic','rare']],
 ['thor', ['Thor','Thor Odinson'], ['legendary','epic','rare']],
 ['thanos', ['Thanos'], ['legendary']],
 ['captain_america', ['Captain America'], ['legendary','epic']],
 ['hawkeye', ['Hawkeye'], ['legendary','epic','rare']],
 ['black_widow', ['Black Widow','Natasha Romanoff'], ['legendary','epic','rare']],
 ['venom', ['Venom'], ['legendary','epic']],
 ['wolverine', ['Wolverine','Logan'], ['legendary','epic','rare']],
 ['scarlet_witch', ['Scarlet Witch','Wanda Maximoff'], ['legendary','epic','rare']],
 ['loki', ['Loki'], ['legendary','epic']],
 ['daredevil', ['Daredevil'], ['legendary','epic','rare']],
 ['punisher', ['Punisher','The Punisher','Frank Castle'], ['legendary','epic']],
 ['doctor_strange', ['Doctor Strange','Stephen Strange'], ['legendary','epic']],
 ['black_panther', ['Black Panther',"T'Challa"], ['legendary','epic']],
 ['silver_surfer', ['Silver Surfer'], ['epic','rare']],
 ['doctor_doom', ['Doctor Doom'], ['epic']],
 ['spider_man_2099', ['Spider-Man 2099'], ['legendary']],
 ['miles_morales', ['Miles Morales'], ['legendary']],
 ['deadpool', ['Deadpool'], ['legendary']],
 ['knull', ['Knull'], ['legendary']],
 ['galactus', ['Galactus'], ['epic']],
 ['reed_richards', ['Reed Richards','Mr. Fantastic','Mister Fantastic'], ['epic']],
 ['sue_storm', ['Sue Storm','Invisible Woman'], ['epic']],
 ['human_torch', ['Human Torch','Johnny Storm'], ['epic']],
 ['the_thing', ['The Thing'], ['epic']]
];
const nameIndex = new Map();
for (const [character,names,rarities] of RULES) for (const name of names) {
 const key=normalize(name);
 if(nameIndex.has(key))throw new Error('Duplicate ability mapping: '+name);
 nameIndex.set(key,{character,rarities});
}
function getAbilityKey(card) {
 const rule=nameIndex.get(normalize(card?.name));
 const tier=String(card?.tier??card?.rarity??'').trim().toLowerCase();
 return rule?.rarities.includes(tier)?rule.character+'_'+tier:null;
}
function getCardMapping(card) {
 if(!card)return null;
 const rule=nameIndex.get(normalize(card.name)),abilityKey=getAbilityKey(card);
 return {character:rule?.character??null,tier:String(card.tier??card.rarity??'').trim().toLowerCase(),abilityKey,status:abilityKey?'assigned':'unassigned'};
}
function getCardIdentity(card,context={}) {
 if(!card||!/^\d+$/.test(String(card.id??'')))return null;
 const id=Number(card.id);if(!Number.isSafeInteger(id)||id<1)return null;
 const event=normalize(context.event??card.event);
 if(event)return 'event:'+(event==='halloween2026'?'halloween26':event)+':'+id;
 const raw=context.season??card.season;if(raw==null)return null;
 const season=String(raw).trim().toLowerCase().replace(/^s/,'');
 return /^\d+$/.test(season)&&Number.isSafeInteger(Number(season))?'s'+Number(season)+':'+id:null;
}
module.exports={normalize,getAbilityKey,getCardMapping,getCardIdentity,listPendingAbilities:()=>[]};
