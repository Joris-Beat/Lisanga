/* Lisanga — Onglet STAR (inspiré d'Instagram) : stories 24 h, photos avec filtres, explorer, enregistrements */
'use strict';

const FILTERS=[
  ['Normal',''],
  ['Ambre','sepia(.35) saturate(1.35) contrast(1.05) brightness(1.05)'],
  ['Fleuve','saturate(1.2) hue-rotate(-12deg) contrast(1.05)'],
  ['Nuit','brightness(.9) contrast(1.25) saturate(.85) hue-rotate(195deg) sepia(.12)'],
  ['Kin','contrast(1.2) saturate(1.5)'],
  ['Pastel','brightness(1.1) saturate(.75) contrast(.9)'],
  ['Mémoire','sepia(.6) contrast(.95) brightness(1.05)'],
  ['N&B','grayscale(1) contrast(1.15)']
];
const STORY_BG=['linear-gradient(135deg,#F2A541,#FF6B57)','linear-gradient(135deg,#2EC4B6,#3D5AFE)','linear-gradient(135deg,#9B6BFF,#FF6B9A)','linear-gradient(135deg,#0F0E17,#3A2E5C)','linear-gradient(135deg,#7BC950,#2EC4B6)','linear-gradient(135deg,#FF6B57,#9B6BFF)'];

/* ---------- Stories (utilisées par Star) ---------- */
const Stories={
  list:[],off:null,subs:new Set(),
  start(){if(this.off)return;this.off=DB.watch('stories',{where:[['exp','>',Date.now()]]},l=>{this.list=l.filter(s=>s.exp>Date.now()&&Social.canSee(s.uid));this.subs.forEach(f=>f())})},
  stop(){if(this.off)this.off();this.off=null},
  on(f){this.subs.add(f);return ()=>this.subs.delete(f)},
  groups(){
    const by=new Map();
    this.list.sort((a,b)=>a.at-b.at).forEach(s=>{if(!by.has(s.uid))by.set(s.uid,[]);by.get(s.uid).push(s)});
    const seen=uid=>by.get(uid).every(s=>(s.views||{})[App.uid]);
    return [...by.keys()].sort((a,b)=>(a===App.uid?-1:b===App.uid?1:0)||(seen(a)-seen(b))||(Math.max(...by.get(b).map(s=>s.at))-Math.max(...by.get(a).map(s=>s.at)))).map(uid=>({uid,items:by.get(uid),seen:seen(uid)}));
  },
  async create(){
    actionSheet([
      {icon:'image',label:'Photo ou vidéo',fn:async()=>{const f=await pickFile('image/*,video/*');if(f)this.publishMedia(f)}},
      {icon:'camera',label:'Appareil photo',fn:async()=>{const f=await pickFile('image/*','user');if(f)this.publishMedia(f)}},
      {icon:'text',label:'Texte',fn:()=>this.textStory()}
    ],'Nouvelle story');
  },
  async publishMedia(f){
    const isV=f.type.startsWith('video/');
    try{
      toast('Publication de la story…');
      const blob=isV?f:await compressImage(f,1440,.85);
      const mid=await Media.put(blob);
      await DB.add('stories',{uid:App.uid,kind:isV?'video':'image',mediaId:mid,mime:blob.type,at:Date.now(),exp:Date.now()+864e5,views:{},likes:{}});
      toast('Story publiée pour 24 h.');
    }catch(e){toast(e.message,'bad')}
  },
  textStory(){
    let bg=0;
    const m=Modal.open('<div class="story-edit" style="background:'+STORY_BG[0]+'"><button class="ibtn light" data-close>'+icon('close')+'</button><textarea maxlength="300" placeholder="Écrivez quelque chose…" autofocus></textarea><div class="se-bar"><button class="pill light" data-bg>🎨 Couleur</button><button class="btn primary" data-pub>Publier</button></div></div>',{full:true,cls:'dark'});
    const box=m.box.querySelector('.story-edit');
    m.box.querySelector('[data-bg]').onclick=()=>{bg=(bg+1)%STORY_BG.length;box.style.background=STORY_BG[bg]};
    m.box.querySelector('[data-pub]').onclick=async()=>{const t=box.querySelector('textarea').value.trim();if(!t)return;await DB.add('stories',{uid:App.uid,kind:'text',text:t,bg,at:Date.now(),exp:Date.now()+864e5,views:{},likes:{}});m.close();toast('Story publiée pour 24 h.')};
  },
  /* Lecteur plein écran */
  view(startUid){
    const groups=this.groups();let gi=groups.findIndex(g=>g.uid===startUid);if(gi<0)return;
    let si=0,timer=null,t0=0,elapsed=0,dur=5000,paused=false;
    const firstUnseen=groups[gi].items.findIndex(s=>!(s.views||{})[App.uid]);si=firstUnseen>0?firstUnseen:0;
    const m=Modal.open('<div class="story-v"></div>',{full:true,cls:'dark story-modal',onClose:()=>{clearInterval(timer)}});
    const root=m.box.querySelector('.story-v');
    const show=async()=>{
      clearInterval(timer);
      const g=groups[gi];if(!g){m.close();return}
      const s=g.items[si];if(!s){gi++;si=0;return show()}
      const u=Users.peek(g.uid);const mine=g.uid===App.uid;
      if(!mine&&!(s.views||{})[App.uid])DB.update('stories',s.id,{['views.'+App.uid]:Date.now()}).catch(()=>{});
      root.innerHTML='<div class="sv-bars">'+g.items.map((x,i)=>'<i><b style="width:'+(i<si?100:0)+'%"></b></i>').join('')+'</div>'+
        '<div class="sv-head">'+avatar(u,34)+'<b data-prof>'+esc(mine?'Votre story':u.name)+'</b><small>'+ago(s.at)+'</small><span class="grow"></span>'+(mine?'<button class="ibtn light" data-del>'+icon('trash')+'</button>':'<button class="ibtn light" data-more>'+icon('dotsh')+'</button>')+'<button class="ibtn light" data-x>'+icon('close')+'</button></div>'+
        '<div class="sv-media">'+(s.kind==='text'?'<div class="sv-text" style="background:'+STORY_BG[s.bg||0]+'"><p>'+richText(s.text)+'</p></div>':s.kind==='video'?'<video data-media="'+s.mediaId+'" autoplay playsinline></video>':'<img data-media="'+s.mediaId+'" alt="">')+'</div>'+
        '<div class="sv-nav"><button data-prev aria-label="Précédente"></button><button data-next aria-label="Suivante"></button></div>'+
        (mine?'<button class="sv-views" data-views>'+icon('eye')+' Vu par '+Object.keys(s.views||{}).length+(Object.keys(s.likes||{}).length?' · ❤️ '+Object.keys(s.likes).length:'')+'</button>':
        '<form class="sv-reply"><input class="inp" name="r" placeholder="Répondre à '+esc(u.name.split(' ')[0])+'…" autocomplete="off"><button type="button" class="ibtn light'+((s.likes||{})[App.uid]?' liked':'')+'" data-like>'+icon('heart')+'</button><button class="ibtn light">'+icon('send')+'</button></form>');
      Media.hydrate(root);
      const bar=root.querySelectorAll('.sv-bars b')[si];
      elapsed=0;t0=Date.now();dur=5000;
      const v=root.querySelector('video');if(v)v.onloadedmetadata=()=>{dur=Math.min(60000,(v.duration||5)*1000)};
      timer=setInterval(()=>{if(paused)return;const p=elapsed+(Date.now()-t0);bar.style.width=Math.min(100,p/dur*100)+'%';if(p>=dur)next()},50);
    };
    const next=()=>{si++;if(si>=groups[gi].items.length){gi++;si=0}if(gi>=groups.length){m.close();return}show()};
    const prev=()=>{if(si>0)si--;else if(gi>0){gi--;si=0}show()};
    const pause=on=>{if(on&&!paused){paused=true;elapsed+=Date.now()-t0;const v=root.querySelector('video');v&&v.pause()}if(!on&&paused){paused=false;t0=Date.now();const v=root.querySelector('video');v&&v.play()}};
    root.addEventListener('pointerdown',e=>{if(e.target.closest('.sv-nav'))root._hold=setTimeout(()=>{root._held=true;pause(true)},250)});
    root.addEventListener('pointerup',()=>{clearTimeout(root._hold);if(root._held){setTimeout(()=>root._held=false,50);pause(false)}});
    root.addEventListener('focusin',e=>{if(e.target.name==='r')pause(true)});
    root.addEventListener('focusout',e=>{if(e.target.name==='r')pause(false)});
    root.onclick=async e=>{
      if(root._held)return;
      const g=groups[gi],s=g&&g.items[si];if(!s)return;
      if(e.target.closest('[data-x]'))return m.close();
      if(e.target.closest('[data-next]'))return next();
      if(e.target.closest('[data-prev]'))return prev();
      if(e.target.closest('[data-prof]')){m.close();return Profile.open(g.uid)}
      if(e.target.closest('[data-del]')){pause(true);if(await confirmBox('Supprimer cette story ?','Supprimer',true)){await DB.del('stories',s.id);if(s.mediaId)Media.remove(s.mediaId);g.items.splice(si,1);if(!g.items.length){m.close();return}if(si>=g.items.length)si=g.items.length-1;show()}else pause(false);return}
      if(e.target.closest('[data-more]')){pause(true);actionSheet([{icon:'flag',label:'Signaler',danger:true,fn:()=>Social.report('story',s.id,s.uid)},{icon:'block',label:'Bloquer',danger:true,fn:()=>{Social.block(s.uid);m.close()}}]);return}
      if(e.target.closest('[data-views]')){pause(true);const mm=Modal.open(sheetHead('Vues de la story')+'<div class="pick-list">'+(Object.entries(s.views||{}).sort((a,b)=>b[1]-a[1]).map(([u,t])=>'<div class="li">'+avatar(Users.peek(u),40)+'<span class="li-t"><b>'+esc(Users.peek(u).name)+'</b><small>'+ago(t)+'</small></span>'+((s.likes||{})[u]?'<span>❤️</span>':'')+'</div>').join('')||'<p class="empty">Personne pour le moment.</p>')+'</div>',{sheet:true,onClose:()=>pause(false)});return}
      if(e.target.closest('[data-like]')){
        const on=!(s.likes||{})[App.uid];s.likes=s.likes||{};if(on)s.likes[App.uid]=1;else delete s.likes[App.uid];
        e.target.closest('[data-like]').classList.toggle('liked',on);
        await DB.update('stories',s.id,{['likes.'+App.uid]:on?1:DB.DEL});
        if(on)dm(g.uid,'❤️ A aimé votre story');
      }
    };
    root.addEventListener('submit',async e=>{
      e.preventDefault();const t=e.target.r.value.trim();if(!t)return;e.target.r.value='';e.target.r.blur();
      const s=groups[gi].items[si];await dm(groups[gi].uid,'↩️ Réponse à votre story'+(s.kind==='text'?' « '+s.text.slice(0,60)+' »':'')+' : '+t);toast('Réponse envoyée.');
    });
    async function dm(uid,t){
      if(Social.isBlocked(uid)||Social.blockedMe(uid))return;
      const id='d_'+[App.uid,uid].sort().join('_');
      let c=Chat.get(id)||await DB.get('chats',id);
      if(!c){await DB.set('chats',id,{type:'direct',members:[App.uid,uid],createdAt:Date.now(),createdBy:App.uid,unread:{},reads:{}});c=await DB.get('chats',id)}
      await Chat.send(c,{kind:'text',t});
    }
    show();
  }
};

/* ---------- Carte de publication Star ---------- */
function starCard(p){
  const u=Users.peek(p.uid);const liked=(p.likes||{})[App.uid];const n=Feed.likeCount(p);
  const saved=Feed.saved().includes('posts_star:'+p.id);
  const likers=Object.keys(p.likes||{}).filter(x=>x!==App.uid);
  return '<article class="spost" data-pid="'+p.id+'">'+
    '<header>'+avatar(u,34,'ring')+'<button class="sp-n" data-prof="'+p.uid+'"><b>'+esc(u.username||u.name)+'</b>'+(p.place?'<small>'+esc(p.place)+'</small>':'')+'</button><button class="ibtn" data-menu>'+icon('dotsh')+'</button></header>'+
    '<div class="sp-media" data-dbl>'+(p.mime&&p.mime.startsWith('video/')?'<video data-media="'+p.mediaId+'" playsinline loop muted autoplay></video>':'<img data-media="'+p.mediaId+'" alt="" loading="lazy">')+'<span class="big-heart">'+icon('heart')+'</span></div>'+
    '<div class="sp-act"><button class="ibtn'+(liked?' liked':'')+'" data-like>'+icon('heart')+'</button><button class="ibtn" data-com>'+icon('comment')+'</button><button class="ibtn" data-share>'+icon('share')+'</button><span class="grow"></span><button class="ibtn'+(saved?' saved':'')+'" data-save>'+icon('bookmark')+'</button></div>'+
    '<div class="sp-txt">'+(n?'<b>'+(likers.length&&n>1?'Aimé par '+esc(Users.peek(likers[0]).username)+' et '+(n-1)+' autre'+(n>2?'s':''):kfmt(n)+' j\'aime')+'</b>':'')+
    (p.text?'<p><b data-prof="'+p.uid+'">'+esc(u.username)+'</b> '+richText(p.text)+'</p>':'')+
    (p.comments?'<button class="muted" data-com>Voir '+(p.comments>1?'les '+p.comments+' commentaires':'le commentaire')+'</button>':'')+
    '<small class="muted up">'+ago(p.at)+'</small></div></article>';
}
function bindPostActions(root,col,getPost,rerender){
  root.addEventListener('click',async e=>{
    const card=e.target.closest('[data-pid]');if(!card)return;
    const p=getPost(card.dataset.pid);if(!p)return;
    if(e.target.closest('[data-prof]'))return Profile.open(e.target.closest('[data-prof]').dataset.prof);
    if(e.target.closest('[data-like]'))return Feed.react(col,p,'love');
    if(e.target.closest('[data-com]'))return Feed.comments(col,p);
    if(e.target.closest('[data-share]'))return Feed.share(col,p);
    if(e.target.closest('[data-save]'))return Feed.toggleSave(col,p).then(()=>rerender&&rerender());
    if(e.target.closest('[data-menu]'))return Feed.postMenu(col,p);
  });
  root.addEventListener('dblclick',e=>{
    const d=e.target.closest('[data-dbl]');if(!d)return;
    const card=d.closest('[data-pid]');const p=getPost(card.dataset.pid);if(!p)return;
    const h=d.querySelector('.big-heart');h.classList.remove('pop');void h.offsetWidth;h.classList.add('pop');
    if(!(p.likes||{})[App.uid])Feed.react(col,p,'love');
  });
}

/* ---------- Nouvelle publication avec filtres ---------- */
async function newStarPost(){
  const f=await pickFile('image/*,video/*');if(!f)return;
  const isV=f.type.startsWith('video/');const url=URL.createObjectURL(f);let fi=0;
  const m=Modal.open(sheetHead('Nouvelle publication Star')+
    '<div class="np-prev">'+(isV?'<video src="'+url+'" autoplay muted loop playsinline></video>':'<img src="'+url+'" alt="">')+'</div>'+
    (isV?'':'<div class="filters">'+FILTERS.map((x,i)=>'<button class="'+(i?'':'on')+'" data-fi="'+i+'"><img src="'+url+'" style="filter:'+x[1]+'" alt=""><span>'+x[0]+'</span></button>').join('')+'</div>')+
    '<form class="pad"><textarea class="inp" name="t" rows="3" placeholder="Écrivez une légende… #hashtags @mentions" maxlength="2200"></textarea><input class="inp mt" name="place" placeholder="Ajouter un lieu (facultatif)" maxlength="60"><button class="btn primary block mt">Partager</button></form>',{sheet:true,full:true,onClose:()=>URL.revokeObjectURL(url)});
  m.box.addEventListener('click',e=>{const b=e.target.closest('[data-fi]');if(!b)return;fi=+b.dataset.fi;$$('[data-fi]',m.box).forEach(x=>x.classList.toggle('on',x===b));m.box.querySelector('.np-prev img').style.filter=FILTERS[fi][1]});
  m.box.querySelector('form').onsubmit=async e=>{
    e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Publication…';
    try{
      const blob=isV?f:await compressImage(f,1440,.86,FILTERS[fi][1]||'none');
      const mid=await Media.put(blob);
      await Feed.create('posts_star',{mediaId:mid,mime:blob.type,text:e.target.t.value.trim(),place:e.target.place.value.trim(),filter:FILTERS[fi][0]});
      m.close();toast('Publié sur Star ⭐');
    }catch(x){toast(x.message,'bad');btn.disabled=false;btn.textContent='Partager'}
  };
}

Tabs.star=(()=>{
  let el,posts=[],off=null,offS=null,offSoc=null,mode='all';
  function mount(v){
    el=v;
    Stories.start();
    el.innerHTML='<header class="pane-h"><h1 class="brand-t star-t">Star</h1><div class="row"><button class="ibtn" data-a="new" aria-label="Publier">'+icon('plus')+'</button><button class="ibtn" data-a="act" aria-label="Activité">'+icon('heart')+'<b class="dot-b" data-act-dot hidden></b></button><button class="ibtn" data-a="saved" aria-label="Enregistrements">'+icon('bookmark')+'</button></div></header>'+
      '<div class="scroll" data-scroll><div class="stories" data-stories></div><div class="seg"><button class="on" data-m="all">Pour vous</button><button data-m="following">Abonnements</button><button data-m="explore">Explorer</button></div><div data-feed></div></div>';
    off=DB.watch('posts_star',{orderBy:['at','desc'],limit:200},l=>{posts=l;draw()});
    offS=Stories.on(drawStories);drawStories();
    offSoc=Social.on(()=>{draw();const d=el&&el.querySelector('[data-act-dot]');if(d)d.hidden=!Social.requests().length});
    el.onclick=e=>{
      const a=e.target.closest('[data-a]');
      if(a){if(a.dataset.a==='new')newStarPost();if(a.dataset.a==='act')activity();if(a.dataset.a==='saved')savedView()}
      const mm=e.target.closest('[data-m]');if(mm){mode=mm.dataset.m;$$('.seg button',el).forEach(b=>b.classList.toggle('on',b===mm));draw()}
      const s=e.target.closest('[data-story]');if(s){if(s.dataset.story==='me-new')Stories.create();else Stories.view(s.dataset.story)}
      const g=e.target.closest('[data-open]');if(g)Profile.openPost('posts_star',g.dataset.open);
      const pu=e.target.closest('[data-puser]');if(pu)Profile.open(pu.dataset.puser);
    };
    bindPostActions(el,'posts_star',id=>posts.find(p=>p.id===id),draw);
  }
  function unmount(){if(off)off();if(offS)offS();if(offSoc)offSoc();el=null}
  function drawStories(){
    if(!el)return;const box=el.querySelector('[data-stories]');
    const gs=Stories.groups();const mine=gs.find(g=>g.uid===App.uid);
    box.innerHTML='<button class="st" data-story="'+(mine?App.uid:'me-new')+'"><span class="st-ring'+(mine?'':' none')+'">'+avatar(App.me,62)+'</span>'+(mine?'':'<i class="st-plus">'+icon('plus')+'</i>')+'<small>Votre story</small></button>'+(mine?'<button class="st" data-story="me-new"><span class="st-ring none add">'+icon('plus')+'</span><small>Ajouter</small></button>':'')+
      gs.filter(g=>g.uid!==App.uid).map(g=>{const u=Users.peek(g.uid);return '<button class="st" data-story="'+g.uid+'"><span class="st-ring'+(g.seen?' seen':'')+'">'+avatar(u,62)+'</span><small>'+esc(u.username||u.name)+'</small></button>'}).join('');
  }
  function draw(){
    if(!el)return;const box=el.querySelector('[data-feed]');
    let list=Feed.visible(posts);
    if(mode==='following'){const f=new Set(Social.following());list=list.filter(p=>f.has(p.uid)||p.uid===App.uid)}
    if(mode==='explore'){
      const ppl=Users.list().filter(u=>!u.deleted&&u.uid!==App.uid&&Social.status(u.uid)!=='ok'&&!Social.isBlocked(u.uid)).slice(0,12);
      box.dataset.mode='explore';
      box.innerHTML=(ppl.length?'<div class="sec-t">Suggestions pour vous</div><div class="sugg-row">'+ppl.map(u=>'<div class="sugg">'+avatar(u,56)+'<b>'+esc(u.name)+'</b><small>@'+esc(u.username)+'</small><button class="btn primary sm" data-follow="'+u.uid+'">'+(Social.status(u.uid)==='pending'?'Demandé':'Suivre')+'</button></div>').join('')+'</div>':'')+
        '<div class="grid3">'+list.map(p=>'<button class="gcell" data-open="'+p.id+'">'+(p.mime&&p.mime.startsWith('video/')?'<video data-media="'+p.mediaId+'" muted playsinline preload="metadata"></video><i class="gbadge">'+icon('play','xs')+'</i>':'<img data-media="'+p.mediaId+'" alt="" loading="lazy">')+'<span class="gstat">'+icon('heart','xs')+' '+Feed.likeCount(p)+'</span></button>').join('')+'</div>'+(list.length?'':'<div class="empty">Rien à explorer pour l\'instant.</div>');
      box.querySelectorAll('[data-follow]').forEach(b=>b.onclick=e=>{e.stopPropagation();Social.follow(b.dataset.follow)});
    }else{
      if(box.dataset.mode!=='list'){box.innerHTML='';box.dataset.mode='list'}
      const sv=Feed.saved().join();
      reconcile(box,list.length?list.map(p=>({key:p.id,sig:JSON.stringify(p)+sv,html:starCard(p)})):[{key:'empty'+mode,sig:'e',html:'<div class="empty"><b>'+(mode==='following'?'Suivez des personnes pour voir leurs photos ici.':'Aucune publication pour l\'instant.')+'</b><br><button class="btn primary mt" data-a="new">Publier une photo</button></div>'}]);
    }
    Media.hydrate(box);
  }
  function activity(){
    const req=Social.requests();
    const myPosts=posts.filter(p=>p.uid===App.uid);
    const likes=[];myPosts.forEach(p=>Object.keys(p.likes||{}).forEach(u=>{if(u!==App.uid)likes.push({u,p})}));
    const foll=Social.followers();
    const m=Modal.open(sheetHead('Activité')+'<div class="pick-list">'+
      (req.length?'<div class="sec-t">Demandes d\'abonnement</div>'+req.map(r=>{const u=Users.peek(r.from);return '<div class="li">'+avatar(u,42)+'<span class="li-t"><b>'+esc(u.name)+'</b><small>@'+esc(u.username)+'</small></span><button class="btn primary sm" data-ok="'+r.from+'">Accepter</button><button class="btn ghost sm" data-no="'+r.from+'">Refuser</button></div>'}).join(''):'')+
      '<div class="sec-t">Récent</div>'+(likes.slice(0,30).map(x=>'<div class="li">'+avatar(Users.peek(x.u),42)+'<span class="li-t"><b>'+esc(Users.peek(x.u).username)+'</b><small>a aimé votre publication</small></span><img class="li-thumb" data-media="'+x.p.mediaId+'" alt=""></div>').join('')+foll.slice(0,20).map(u=>'<div class="li" data-puser="'+u+'">'+avatar(Users.peek(u),42)+'<span class="li-t"><b>'+esc(Users.peek(u).username)+'</b><small>vous suit</small></span></div>').join('')||'<p class="empty">Aucune activité récente.</p>')+'</div>',{sheet:true});
    Media.hydrate(m.box);
    m.box.onclick=async e=>{const o=e.target.closest('[data-ok]');if(o){await Social.accept(o.dataset.ok);m.close();activity()}const n=e.target.closest('[data-no]');if(n){await Social.decline(n.dataset.no);m.close();activity()}const pu=e.target.closest('[data-puser]');if(pu){m.close();Profile.open(pu.dataset.puser)}};
  }
  async function savedView(){
    const keys=Feed.saved();
    const items=(await Promise.all(keys.map(async k=>{const [col,id]=k.split(':');const p=await DB.get(col,id);return p?{...p,col}:null}))).filter(Boolean);
    const m=Modal.open(sheetHead('Enregistrements')+(items.length?'<div class="grid3">'+items.map(p=>'<button class="gcell" data-o="'+p.col+'/'+p.id+'">'+(p.mediaId?(p.mime&&p.mime.startsWith('video/')?'<video data-media="'+p.mediaId+'" muted preload="metadata"></video>':'<img data-media="'+p.mediaId+'" alt="">'):'<span class="gtext">'+esc((p.text||'').slice(0,80))+'</span>')+'</button>').join('')+'</div>':'<p class="empty">Rien d\'enregistré. Touchez '+icon('bookmark','xs')+' sur une publication.</p>'),{sheet:true,full:true});
    Media.hydrate(m.box);
    m.box.onclick=e=>{const o=e.target.closest('[data-o]');if(o){const [c,i]=o.dataset.o.split('/');Profile.openPost(c,i)}};
  }
  return {mount,unmount};
})();
