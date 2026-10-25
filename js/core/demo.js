/* Lisanga — Comptes de démonstration (mode local uniquement) */
'use strict';

const Demo={
  async seed(){
    if(DB.remote)throw new Error('La démonstration est réservée au mode local.');
    if(await DB.get('accounts','amani@demo.cd'))throw new Error('Les comptes de démonstration existent déjà.');
    const people=[
      {name:'Amani Mukendi',username:'amani.m',email:'amani@demo.cd',bio:'Photographe 📷 · Kinshasa'},
      {name:'Grâce Ilunga',username:'grace.i',email:'grace@demo.cd',bio:'Cuisine, musique et bonne humeur ✨'},
      {name:'Kevin Mbuyi',username:'kevin.mb',email:'kevin@demo.cd',bio:'Développeur · fan de foot ⚽'}
    ];
    const ids=[];const t0=Date.now()-3*3600e3;
    for(const p of people){
      const uid=newId();ids.push(uid);
      await DB.set('accounts',norm(p.email),{uid,...(await E2E.hash('demo1234'))});
      const k=await E2E.create(uid,'demo1234');
      await DB.set('keys',uid,{backup:k.backup,at:Date.now()});
      await DB.set('users',uid,{name:p.name,username:p.username,bio:p.bio,avatar:'',publicKey:k.publicKey,createdAt:Date.now(),lastSeen:0,privacy:{lastSeen:'all',readReceipts:true,private:false,messages:'all',ephemeral:0}});
    }
    const [a,g,k]=ids;
    for(const x of ids)for(const y of ids)if(x!==y)await DB.set('follows',x+'_'+y,{from:x,to:y,status:'ok',at:t0});
    const prevUid=App.uid;
    const as=async(uid,fn)=>{App.uid=uid;await E2E.load(uid);await fn()};
    try{
      /* Discussion privée Amani ↔ Grâce */
      const dId='d_'+[a,g].sort().join('_');
      await DB.set('chats',dId,{type:'direct',members:[a,g],createdAt:t0,createdBy:a,unread:{},reads:{}});
      const dc={id:dId,type:'direct',members:[a,g]};
      await as(a,()=>Chat.send(dc,{kind:'text',t:'Mbote Grâce ! Tu viens samedi au concert ? 🎶'}));
      await as(g,()=>Chat.send(dc,{kind:'text',t:'Oui bien sûr 😍 On se retrouve devant l\'entrée à 18 h ?'}));
      await as(a,()=>Chat.send(dc,{kind:'text',t:'Parfait, à samedi ! 🙌'}));
      /* Groupe */
      await as(k,async()=>{
        const gid=await Chat.createGroup('Les amis de Kin 🇨🇩',[a,g],'');
        const gc=await DB.get('chats',gid);
        await Chat.send(gc,{kind:'text',t:'Bienvenue dans le groupe ! Ici on partage les bons plans 😎'});
      });
      /* Publique */
      await as(g,()=>Feed.create('posts_pub',{text:'Bonne semaine à tous ! Que la joie soit avec vous ☀️',bg:2,visibility:'public',mood:'heureux·se 😊',likes:{[a]:'love',[k]:'like'}}));
      await as(k,()=>Feed.create('posts_pub',{text:'Qui regarde le match ce soir ? ⚽🔥 #Léopards',visibility:'public',likes:{[a]:'haha'}}));
      /* Star : images générées */
      await as(a,async()=>{
        for(const [i,cap] of [[0,'Coucher de soleil sur le fleuve 🌅 #Kinshasa'],[1,'Les couleurs du marché 🎨']]){
          const blob=await Demo.art(i);const mid=await Media.put(blob);
          await Feed.create('posts_star',{mediaId:mid,mime:'image/jpeg',text:cap,place:'Kinshasa',likes:{[g]:'love'}});
        }
      });
      /* Stories */
      await as(g,()=>DB.add('stories',{uid:g,kind:'text',text:'Journée magnifique ! 💛',bg:0,at:Date.now()-3600e3,exp:Date.now()+20*3600e3,views:{},likes:{}}));
      await as(k,async()=>{const mid=await Media.put(await Demo.art(2));await DB.add('stories',{uid:k,kind:'image',mediaId:mid,mime:'image/jpeg',at:Date.now()-1800e3,exp:Date.now()+22*3600e3,views:{},likes:{}})});
      /* Fun */
      await as(k,()=>Feed.create('posts_fun',{text:'Quand le prof dit « petite interro surprise » 😱😂',bg:0,visibility:'public',views:42,likes:{[a]:'love',[g]:'love'}}));
      await as(g,()=>Feed.create('posts_fun',{text:'POV : tu goûtes le pondu de maman après 6 mois loin de la maison 🥹🍲',bg:2,visibility:'public',views:87,likes:{[a]:'love'}}));
    }finally{App.uid=prevUid;E2E.forget()}
  },
  /* Illustrations générées (aucune image à télécharger) */
  art(n){
    const c=document.createElement('canvas');c.width=c.height=1080;const x=c.getContext('2d');
    const pal=[['#FF9A3C','#FF5E62','#3A1C71'],['#2EC4B6','#F2A541','#E56399'],['#9B6BFF','#2EC4B6','#0F0E17']][n%3];
    const gr=x.createLinearGradient(0,0,0,1080);gr.addColorStop(0,pal[0]);gr.addColorStop(.6,pal[1]);gr.addColorStop(1,pal[2]);x.fillStyle=gr;x.fillRect(0,0,1080,1080);
    if(n===0){x.fillStyle='rgba(255,240,200,.9)';x.beginPath();x.arc(540,560,170,0,7);x.fill();x.fillStyle='rgba(20,10,40,.75)';x.fillRect(0,700,1080,380);for(let i=0;i<14;i++){x.fillStyle='rgba(255,200,120,'+(0.5-i*.03)+')';x.fillRect(540-150+i*8,720+i*24,300-i*16,6)}}
    if(n===1){for(let i=0;i<40;i++){x.fillStyle=['#F4D35E','#EE964B','#F95738','#0D3B66','#2EC4B6'][i%5];x.globalAlpha=.85;x.beginPath();x.arc(80+(i*197)%1000,120+(i*131)%900,40+(i*17)%90,0,7);x.fill()}x.globalAlpha=1}
    if(n===2){x.fillStyle='rgba(255,255,255,.12)';for(let i=0;i<8;i++){x.beginPath();x.arc(540,540,80+i*60,0,7);x.lineWidth=14;x.strokeStyle='rgba(255,255,255,'+(.25-i*.025)+')';x.stroke()}x.font='bold 120px sans-serif';x.fillStyle='#fff';x.textAlign='center';x.fillText('⚽',540,580)}
    return new Promise(r=>c.toBlob(r,'image/jpeg',.85));
  }
};
