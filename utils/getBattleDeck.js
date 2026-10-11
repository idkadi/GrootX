'use strict';
const connectDB=require('../database');
const {resolveEntry}=require('./battleCatalogue');
const clean=value=>String(value??'').trim().toLowerCase();
async function getBattleDeck(userId,deckNo){
 const db=await connectDB(),doc=await db.collection('decks').findOne({userId});
 if(!doc)return {ok:false,reason:'No deck found.',cards:[]};
 const slot=Number(deckNo??doc.activeDeck??1);
 if(![1,2,3].includes(slot))return {ok:false,reason:'Invalid deck slot.',cards:[]};
 const deck=doc.decks?doc.decks[String(slot)]:slot===1?{unlocked:true,name:'Deck 1',cards:doc.cards??[]}:null;
 if(!deck?.unlocked)return {ok:false,reason:'This deck is locked.',cards:[]};
 const codes=(deck.cards??[]).map(clean);
 if(codes.length!==12||new Set(codes).size!==12)return {ok:false,reason:'Deck must have 12 unique card codes.',cards:[]};
 const entries=await db.collection('collections').find({userId}).toArray(),identities=new Set(),counts={legendary:0,epic:0},result=[];
 for(const code of codes){
   const matches=entries.filter(e=>clean(e.code)===code);
   if(matches.length!==1)return {ok:false,reason:'Missing or ambiguous card: '+code,cards:[]};
   const entry=matches[0],record=resolveEntry(entry);
   if(!record)return {ok:false,reason:'Invalid season/event for '+code,cards:[]};
   if(identities.has(record.key))return {ok:false,reason:'Duplicate card: '+record.card.name,cards:[]};
   identities.add(record.key);const tier=String(record.card.tier).trim().toLowerCase();
   if(tier in counts&&++counts[tier]>4)return {ok:false,reason:'Maximum 4 '+tier+' cards per deck.',cards:[]};
   const owned={...entry,season:record.season,event:record.event};
   result.push({entry:owned,card:{...record.card,season:record.season,event:record.event},code:entry.code,serial:entry.serial??entry.serialNumber,season:record.season,event:record.event});
 }
 return {ok:true,deckName:deck.name??'Deck '+slot,cards:result};
}
module.exports=getBattleDeck;
