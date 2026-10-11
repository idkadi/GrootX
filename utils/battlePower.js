'use strict';
const {normalize,getCardMapping}=require('../data/abilityMappings');
const TIER_POWER={common:1,uncommon:2,rare:3,epic:5,legendary:7};
const SERIAL_LIMITS={legendary:[25,50,100,200],epic:[50,100,200,300],rare:[100,250,400,600],uncommon:[200,400,600,800],common:[250,500,750,1000]};
function getBasePower(card={}) { return Number.isFinite(card.power)?card.power:TIER_POWER[String(card.tier??'').trim().toLowerCase()]??1; }
function getSerialBoost(serial,tier='common') {
 const s=Number(serial),limits=SERIAL_LIMITS[String(tier).toLowerCase()];
 if(!Number.isInteger(s)||s<1||!limits)return 0;
 const i=limits.findIndex(limit=>s<=limit);return i<0?0:4-i;
}
function characterName(card) {
 // Spider Unity recipients remain distinct characters for same-character synergy.
 const n=normalize(card?.name);
 if(['scarletspider','spiderpunk','jessicadrew','pavitrprabhakar','spiderham'].includes(n))return n;
 if(n==='nightmonkey')return 'spider_man';
 return getCardMapping(card)?.character??n;
}
function getSynergyBoost(card,cardsAtLocation=[]) {
 const others=cardsAtLocation.filter(c=>c!==card);
 const movie=normalize(card?.appearance);
 const sameMovie=movie&&others.some(c=>normalize(c.appearance)===movie)?2:0;
 const character=characterName(card);
 const sameCharacter=character&&others.some(c=>characterName(c)===character)?2:0;
 return sameMovie+sameCharacter;
}
function getLocationBoost(card,location) {
 if(!location||typeof location!=='object'||!Array.isArray(location.boostNames))return 0;
 return location.boostNames.some(n=>normalize(n)===normalize(card?.name))?3:0;
}
function calculateBattlePower(card,options={}) {
 const basePower=getBasePower(card);
 const serialBoost=getSerialBoost(options.serial??card?.serial,card?.tier);
 const synergyBoost=getSynergyBoost(card,options.cardsAtLocation??[]);
 const locationBoost=getLocationBoost(card,options.location);
 const abilityBoost=Number(options.abilityBoost)||0;
 return {basePower,serialBoost,synergyBoost,locationBoost,abilityBoost,finalPower:basePower+serialBoost+synergyBoost+locationBoost+abilityBoost};
}
module.exports={TIER_POWER,SERIAL_LIMITS,calculateBattlePower,getBasePower,getSerialBoost,getSynergyBoost,getLocationBoost,characterName};
