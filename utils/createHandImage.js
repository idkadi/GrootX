'use strict';
const {createCanvas,loadImage}=require('canvas');
const renderCard=require('./renderCard');
// Cards already contain their printed labels. No hand title, energy badge,
// slot bar or second serial is drawn over them.
module.exports=async function createHandImage(hand=[]){
 const width=180,height=Math.round(width*1492/1054),gap=12,pad=16;
 const columns=Math.min(6,Math.max(1,hand.length)),rows=Math.max(1,Math.ceil(hand.length/columns));
 const canvas=createCanvas(columns*width+(columns-1)*gap+pad*2,rows*height+(rows-1)*gap+pad*2);
 const ctx=canvas.getContext('2d');ctx.fillStyle='#10111b';ctx.fillRect(0,0,canvas.width,canvas.height);
 for(let i=0;i<hand.length;i++){
  const item=hand[i];if(!item?.card)continue;
  const owned={...(item.entry??{}),...item};delete owned.entry;delete owned.card;
  const season=item.season??item.entry?.season??item.card.season;
  const event=item.event??item.entry?.event??item.card.event;
  const card={...item.card};if(season!=null){card.season=season;owned.season=season;}if(event!=null){card.event=event;owned.event=event;}
  const x=pad+(i%columns)*(width+gap),y=pad+Math.floor(i/columns)*(height+gap);
  try{
   const image=await renderCard.thumbnail(card,item.serial??item.entry?.serial??item.entry?.serialNumber??'?',owned,width,height);ctx.drawImage(image,x,y,width,height);
  }catch(error){console.error('[HAND CARD]',item.code??item.card.id,error);ctx.fillStyle='#282a36';ctx.fillRect(x,y,width,height);}
 }
 return renderCard.encodePNG(canvas);
};
