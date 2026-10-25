/* Lisanga — Onglet FUN (inspiré de TikTok) : fil vertical plein écran de vidéos courtes,
   lecture automatique, double-touche pour aimer, commentaires, partage, création (caméra ou galerie) et clips texte animés. */
'use strict';

Tabs.fun=(()=>{
  let el,posts=[],off=null,offSoc=null,mode='foryou',io=null,muted=true,lastSig='';
  const FUN_BG=['fun-bg1','fun-bg2','fun-bg3','fun-bg4','fun-bg5'];

  function mount(v){
    el=v;
    el.innerHTML='<div class="fun-top"><button data-m="following">Abonnements</button><span>|</span><button class="on" data-m="foryou">Pour toi</button><button class="ibtn light fun-new" data-a="create" aria-label="Créer">'+icon('plus')+'</button></div><div class="fun-feed" data-feed></div>';
    io=new IntersectionObserver(entries=>entries.forEach(en=>{
      const v=en.target.querySelector('video');
      if(en.isIntersecting&&en.intersectionRatio>.6){
        if(v){v.muted=muted;v.play().catch(()=>{});}
        const id=en.target.dataset.pid;if(!en.target.dataset.viewed){en.target.dataset.viewed=1;DB.update('posts_fun',id,{views:DB.inc(1)}).catch(()=>{})}
      }else if(v)v.pause();
    }),{threshold:[0,.6,1]});
    off=DB.watch('posts_fun',{orderBy:['at','desc'],limit:150},l=>{posts=l;draw()});
    offSoc=Social.on(()=>draw());
    el.onclick=onClick;
    el.ondblclick=e=>{const c=e.target.closest('[data-pid]');if(!c||e.target.closest('.fun-side,.fun-info'))return;burst(c,e);const p=posts.find(x=>x.id===c.dataset.pid);if(p&&!(p.likes||{})[App.uid])Feed.react('posts_fun',p,'love')};
  }
  function unmount(){if(off)off();if(offSoc)offSoc();if(io)io.disconnect();$$('video',el).forEach(v=>v.pause());el=null;lastSig=''}

  function list(){
    let l=Feed.visible(posts);
    if(mode==='following'){const f=new Set(Social.following());l=l.filter(p=>f.has(p.uid)||p.uid===App.uid)}
    else{
      /* « Pour toi » : mélange récent + populaire, sans montrer deux fois de suite la même personne si possible */
      const score=p=>Feed.likeCount(p)*3+(p.comments||0)*4+(p.shares||0)*5+(p.views||0)*.2-((Date.now()-p.at)/36e5)*.5;
      l=[...l].sort((a,b)=>score(b)-score(a));
    }
    return l;
  }
  function card(p){
    const u=Users.peek(p.uid);const liked=(p.likes||{})[App.uid];const st=Social.status(p.uid);
    const media=p.mediaId?'<video data-media="'+p.mediaId+'" loop playsinline preload="metadata"'+(muted?' muted':'')+'></video>':'<div class="fun-textclip '+FUN_BG[(p.bg||0)%FUN_BG.length]+'"><p>'+richText(p.text||'')+'</p></div>';
    return '<section class="fun-card" data-pid="'+p.id+'">'+media+
      '<span class="big-heart">'+icon('heart')+'</span>'+
      '<div class="fun-side">'+
        '<button class="fs-av" data-prof="'+p.uid+'">'+avatar(u,48)+(p.uid!==App.uid&&st!=='ok'?'<i class="fs-follow" data-follow="'+p.uid+'">'+(st==='pending'?icon('clock'):icon('plus'))+'</i>':'')+'</button>'+
        '<button class="fs-b'+(liked?' liked':'')+'" data-like>'+icon('heart')+'<small>'+kfmt(Feed.likeCount(p))+'</small></button>'+
        '<button class="fs-b" data-com>'+icon('comment')+'<small>'+kfmt(p.comments||0)+'</small></button>'+
        '<button class="fs-b" data-save>'+icon('bookmark')+'<small>'+(Feed.saved().includes('posts_fun:'+p.id)?'Enreg.':'Garder')+'</small></button>'+
        '<button class="fs-b" data-share>'+icon('share')+'<small>'+kfmt(p.shares||0)+'</small></button>'+
        (p.mediaId?'<button class="fs-b" data-mute>'+icon(muted?'mute':'volume')+'</button>':'')+
        '<span class="fs-disc">'+avatar(u,28)+'</span>'+
      '</div>'+
      '<div class="fun-info"><b data-prof="'+p.uid+'">@'+esc(u.username)+'</b> <small>· '+ago(p.at)+'</small>'+(p.mediaId&&p.text?'<p>'+richText(p.text)+'</p>':'')+'<div class="fun-music">'+icon('music','xs')+'<span><i>Son original — '+esc(u.name)+'</i></span></div><small class="muted-l">'+icon('eye','xs')+' '+kfmt(p.views||0)+' vues</small></div>'+
      '<button class="fun-dots" data-menu>'+icon('dotsh')+'</button>'+
    '</section>';
  }
  function draw(){
    if(!el)return;
    const feed=el.querySelector('[data-feed]');const l=list();
    const sig=l.map(p=>p.id).sort().join(',')+mode;
    if(sig!==lastSig){
      /* Nouvel ordre : reconstruire en gardant la vidéo en cours visible */
      const curId=(()=>{const r=feed.getBoundingClientRect();const c=$$('.fun-card',feed).find(x=>{const b=x.getBoundingClientRect();return b.top>=r.top-10&&b.top<r.top+r.height/2});return c&&c.dataset.pid})();
      io.disconnect();
      feed.innerHTML=l.length?l.map(card).join(''):'<div class="fun-empty">'+icon('fun')+'<h3>'+(mode==='following'?'Aucune vidéo de vos abonnements':'Aucune vidéo pour l\'instant')+'</h3><p>Soyez le premier à créer quelque chose de fun !</p><button class="btn primary" data-a="create">Créer une vidéo</button></div>';
      $$('.fun-card',feed).forEach(c=>io.observe(c));
      Media.hydrate(feed);
      if(curId){const c=feed.querySelector('[data-pid="'+curId+'"]');if(c)feed.scrollTop=c.offsetTop}
      lastSig=sig;
    }else{
      /* Mise à jour légère des compteurs */
      l.forEach(p=>{
        const c=feed.querySelector('[data-pid="'+p.id+'"]');if(!c)return;
        const lk=c.querySelector('[data-like]');lk.classList.toggle('liked',!!(p.likes||{})[App.uid]);lk.querySelector('small').textContent=kfmt(Feed.likeCount(p));
        c.querySelector('[data-com] small').textContent=kfmt(p.comments||0);c.querySelector('[data-share] small').textContent=kfmt(p.shares||0);
        c.querySelector('[data-save] small').textContent=Feed.saved().includes('posts_fun:'+p.id)?'Enreg.':'Garder';
        const st=Social.status(p.uid);const fo=c.querySelector('.fs-follow');if(fo&&st==='ok')fo.remove();
      });
    }
  }
  function burst(c,e){
    const h=c.querySelector('.big-heart');const r=c.getBoundingClientRect();
    h.style.left=(e.clientX-r.left)+'px';h.style.top=(e.clientY-r.top)+'px';
    h.classList.remove('pop');void h.offsetWidth;h.classList.add('pop');
  }
  async function onClick(e){
    const m=e.target.closest('[data-m]');if(m){mode=m.dataset.m;$$('.fun-top [data-m]',el).forEach(b=>b.classList.toggle('on',b===m));lastSig='';draw();el.querySelector('[data-feed]').scrollTop=0;return}
    if(e.target.closest('[data-a=create]'))return create();
    const c=e.target.closest('[data-pid]');if(!c)return;
    const p=posts.find(x=>x.id===c.dataset.pid);if(!p)return;
    const fo=e.target.closest('[data-follow]');if(fo){e.stopPropagation();return Social.follow(fo.dataset.follow)}
    if(e.target.closest('[data-prof]'))return Profile.open(p.uid);
    if(e.target.closest('[data-like]'))return Feed.react('posts_fun',p,'love');
    if(e.target.closest('[data-com]'))return Feed.comments('posts_fun',p);
    if(e.target.closest('[data-share]'))return Feed.share('posts_fun',p);
    if(e.target.closest('[data-save]'))return Feed.toggleSave('posts_fun',p).then(()=>{lastSig+='x';draw()});
    if(e.target.closest('[data-menu]'))return Feed.postMenu('posts_fun',p);
    if(e.target.closest('[data-mute]')){muted=!muted;$$('video',el).forEach(v=>v.muted=muted);$$('[data-mute]',el).forEach(b=>b.innerHTML=icon(muted?'mute':'volume'));return}
    /* Toucher la vidéo = pause / lecture */
    const v=c.querySelector('video');if(v&&!e.target.closest('.fun-side,.fun-info')){if(v.paused){v.play()}else v.pause();c.classList.toggle('paused',v.paused)}
  }

  /* ---------- Création ---------- */
  function create(){
    actionSheet([
      {icon:'record',label:'Filmer avec la caméra',fn:recordVideo},
      {icon:'image',label:'Importer une vidéo',fn:async()=>{const f=await pickFile('video/*');if(f)publish(f)}},
      {icon:'text',label:'Clip texte animé',fn:textClip}
    ],'Créer sur Fun');
  }
  async function recordVideo(){
    if(!window.MediaRecorder){toast('Enregistrement vidéo non pris en charge ici : importez une vidéo.','bad');return}
    let stream,facing='user';
    const get=async()=>navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:720},height:{ideal:1280}},audio:true});
    try{stream=await get()}catch(e){toast('Autorisez la caméra et le micro.','bad');return}
    let mr=null,chunks=[],t0=0,timer=null;
    const m=Modal.open('<div class="rec-v"><video autoplay playsinline muted></video><div class="rec-top"><button class="ibtn light" data-x>'+icon('close')+'</button><b class="rec-time">0:00 / 1:00</b><button class="ibtn light" data-flip>'+icon('flip')+'</button></div><div class="rec-prog"><i></i></div><button class="rec-btn" data-rec aria-label="Enregistrer"></button></div>',{full:true,cls:'dark',onClose:()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop())}});
    const v=m.box.querySelector('video');v.srcObject=stream;
    const stop=()=>{if(mr&&mr.state!=='inactive')mr.stop()};
    m.box.onclick=async e=>{
      if(e.target.closest('[data-x]'))return m.close();
      if(e.target.closest('[data-flip]')&&!mr){stream.getTracks().forEach(t=>t.stop());facing=facing==='user'?'environment':'user';try{stream=await get();v.srcObject=stream}catch(x){}return}
      if(e.target.closest('[data-rec]')){
        if(mr){stop();return}
        const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
        mr=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:1800000}:undefined);chunks=[];
        mr.ondataavailable=x=>{if(x.data.size)chunks.push(x.data)};
        mr.onstop=()=>{const blob=new Blob(chunks,{type:mr.mimeType||'video/webm'});m.close();publish(new File([blob],'fun.'+(blob.type.includes('mp4')?'mp4':'webm'),{type:blob.type}))};
        mr.start(500);t0=Date.now();m.box.querySelector('[data-rec]').classList.add('on');
        timer=setInterval(()=>{const s=(Date.now()-t0)/1000;m.box.querySelector('.rec-time').textContent=fmtDur(s)+' / 1:00';m.box.querySelector('.rec-prog i').style.width=Math.min(100,s/60*100)+'%';if(s>=60)stop()},200);
      }
    };
  }
  function publish(file){
    const url=URL.createObjectURL(file);
    const m=Modal.open(sheetHead('Publier sur Fun')+'<div class="np-prev tall"><video src="'+url+'" autoplay loop muted playsinline></video></div><form class="pad"><textarea class="inp" name="t" rows="2" maxlength="300" placeholder="Décrivez votre vidéo… #fun #kinshasa"></textarea><label class="check mt"><input type="checkbox" name="f"> Visible uniquement par mes abonnés</label><button class="btn primary block mt">Publier</button></form>',{sheet:true,full:true,onClose:()=>URL.revokeObjectURL(url)});
    m.box.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;b.textContent='Envoi…';
      try{const mid=await Media.put(file);await Feed.create('posts_fun',{mediaId:mid,mime:file.type,text:e.target.t.value.trim(),visibility:e.target.f.checked?'followers':'public'});m.close();toast('Vidéo publiée sur Fun 🎬');lastSig='';}
      catch(x){toast(x.message,'bad');b.disabled=false;b.textContent='Publier'}
    };
  }
  function textClip(){
    let bg=0;
    const m=Modal.open('<div class="fun-textclip edit '+FUN_BG[0]+'"><button class="ibtn light" data-close>'+icon('close')+'</button><textarea maxlength="220" placeholder="Votre texte fun…" autofocus></textarea><div class="se-bar"><button class="pill light" data-bg>🎨 Style</button><button class="btn primary" data-pub>Publier</button></div></div>',{full:true,cls:'dark'});
    const box=m.box.querySelector('.fun-textclip');
    m.box.querySelector('[data-bg]').onclick=()=>{box.classList.remove(FUN_BG[bg]);bg=(bg+1)%FUN_BG.length;box.classList.add(FUN_BG[bg])};
    m.box.querySelector('[data-pub]').onclick=async()=>{const t=box.querySelector('textarea').value.trim();if(!t)return;await Feed.create('posts_fun',{text:t,bg,visibility:'public'});m.close();toast('Clip publié 🎉')};
  }
  return {mount,unmount};
})();
