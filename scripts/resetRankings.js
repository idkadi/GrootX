'use strict';
const {randomUUID}=require('node:crypto');
// Run manually on the VPS while GrootX is stopped. Never loaded as a command.
async function resetRankings(db){
 const ranked=db.collection('rankedProfiles');
 const profiles=await ranked.find({}).toArray();
 const resetId=randomUUID(),resetAt=new Date();
 // Preserve every original field before any rank is changed.
 const backup=db.collection('rankedProfilesResetBackup');
 for(let offset=0;offset<profiles.length;offset+=500){
  await backup.insertMany(profiles.slice(offset,offset+500).map(profile=>({resetId,resetAt,profile})));
 }
 const result=await ranked.updateMany({},{$set:{trophies:0,wins:0,losses:0,streak:0,highestTrophies:0}});
 const remaining=await ranked.countDocuments({$or:[{trophies:{$ne:0}},{wins:{$ne:0}},{losses:{$ne:0}},{streak:{$ne:0}},{highestTrophies:{$ne:0}}]});
 if(remaining)throw new Error(`${remaining} profiles changed during the reset. Keep the bot stopped and inspect rankedProfiles. Backup resetId: ${resetId}`);
 return {resetId,backedUp:profiles.length,matched:result.matchedCount,modified:result.modifiedCount};
}
module.exports={resetRankings};
if(require.main===module){
 require('dotenv').config();
 const connectDB=require('../database');
 (async()=>{
  const result=await resetRankings(await connectDB());
  console.log(`Rank reset complete: ${result.matched} players now have 0 trophies (Rookie I).`);
  console.log(`Backed up ${result.backedUp} profiles. Backup resetId: ${result.resetId}`);
  console.log('Reward claims and all collections/balances were preserved.');
 })().then(()=>process.exit(0)).catch(error=>{console.error('Rank reset failed:',error.message);process.exit(1);});
}
