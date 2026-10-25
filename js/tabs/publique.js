/* Lisanga — Onglet PUBLIQUE (inspiré de Facebook) : fil d'actualité, statuts colorés, humeurs,
   photos/vidéos, 6 réactions, commentaires, partages et republications, suggestions d'amis. */
'use strict';

Tabs.publique=(()=>{
  let el,posts=[],off=null,offSoc=null,offMe=null;
  const ORIG=new Map();
  const BGS=['','pb-1','pb-2','pb-3','pb-4','pb-5','pb-6'];
  const MOODS=[['😊','heureux·se'],['🥳','en fête'],['😍','amoureux·se'],['😎','au top'],['🙏','reconnaissant·e'],['😴','fatigué·e'],['😢','triste'],['🤒','malade'],['💪','motivé·e'],['🤔','pensif·ve']];
  const RLABEL={like:'J\'aime',love:'J\'adore',haha:'Haha',wow:'Waouh',sad:'Triste',angry:'Grrr'};

  function mount(v){
    el=v;
    el.innerHTML='<header class="pane-h"><h1 class="brand-t">Publique</h1><div class="row"><button class="ibtn" data-a="search" aria-label="Rechercher">'+icon('search')+'</button><button class="ibtn" data-a="friends" aria-label="Demandes">'+icon('users')+'<b class="dot-b" data-req hidden></b></button></div></header>'+
      '<div class="scroll pub-scroll" data-scroll><div class="pub-col">'+
      '<div class="pcard composer-card">'+avatar(App.me,40)+'<button class="whats" data-a="compose">Quoi de neuf, '+esc(App.me.name.split(' ')[0])+' ?</button>'+
      '<div class="cc-row"><button data-a="photo">'+icon('image')+' Photo/vidéo</button><button data-a="mood">'+icon('smile')+' Humeur</button><button data-a="color">'+icon('text')+' Fond coloré</button></div></div>'+
      '<div data-feed></div></div></div>';
    off=DB.watch('posts_pub',{orderBy:['at','desc'],limit:200},l=>{posts=l;draw()});
    offSoc=Social.on(()=>{draw();const r=el&&el.querySelector('[data-req]');if(r)r.hidden=!Social.requests().length});
    offMe=App.on('priv',()=>draw());
    el.onclick=onClick;
    el.addEventListener('contextmenu',e=>{const b=e.target.closest('[data-like]');if(b){e.preventDefault();picker(b)}});
    let t=null;
    el.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-like]');if(!b)return;t=setTimeout(()=>{t=null;el.dataset.lp=Date.now();picker(b)},420)});
    el.addEventListener('pointerup',()=>{clearTimeout(t)});el.addEventListener('pointerleave',()=>clearTimeout(t),true);
    el.addEventListener('mouseover',e=>{const b=e.target.closest('[data-like]');if(b&&matchMedia('(hover:hover)').matches){clearTimeout(b._h);b._h=setTimeout(()=>{if(b.matches(':hover'))picker(b)},650)}});
  }
  function unmount(){if(off)off();if(offSoc)offSoc();if(offMe)offMe();el=null}

  function reactSummary(p){
    const vals=Object.values(p.likes||{});if(!vals.length)return '';
    const cnt={};vals.forEach(v=>cnt[v]=(cnt[v]||0)+1);
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>'<i>'+(Feed.REACTIONS[k]||'👍')+'</i>').join('');
    const mine=(p.likes||{})[App.uid];
    return '<span class="rx-sum">'+top+' '+(mine?(vals.length>1?'Vous et '+(vals.length-1)+' autre'+(vals.length>2?'s':''):'Vous'):kfmt(vals.length))+'</span>';
  }
  function card(p){
    const u=Users.peek(p.uid);const mine=(p.likes||{})[App.uid];
    const short=p.bg&&!p.mediaId&&(p.text||'').length<=140;
    let body='';
    if(p.text)body+='<div class="pp-text'+(short?' pp-bg '+BGS[p.bg]:'')+'">'+richText(p.text)+'</div>';
    if(p.mediaId)body+=p.mime&&p.mime.startsWith('video/')?'<video class="pp-media" data-media="'+p.mediaId+'" controls playsinline preload="metadata"></video>':'<img class="pp-media" data-media="'+p.mediaId+'" alt="" loading="lazy" data-view>';
    if(p.repost)body+='<div class="pp-repost" data-orig="'+p.repost.col+'/'+p.repost.id+'"><div class="muted small pad">Chargement…</div></div>';
    return '<article class="pcard ppost" data-pid="'+p.id+'">'+
      '<header>'+avatar(u,42)+'<div class="grow"><button class="pp-n" data-prof="'+p.uid+'"><b>'+esc(u.name)+'</b></button>'+(p.mood?' <span class="muted">se sent '+esc(p.mood)+'</span>':'')+(p.repost?' <span class="muted">a partagé une publication</span>':'')+'<small class="muted">'+ago(p.at)+' · '+icon(p.visibility==='followers'?'users':'public','xs')+'</small></div><button class="ibtn" data-menu>'+icon('dotsh')+'</button></header>'+
      body+
      '<div class="pp-stats">'+reactSummary(p)+'<span class="grow"></span>'+(p.comments?'<button data-com>'+p.comments+' commentaire'+(p.comments>1?'s':'')+'</button>':'')+(p.shares?'<span>'+p.shares+' partage'+(p.shares>1?'s':'')+'</span>':'')+'</div>'+
      '<div class="pp-act"><button data-like class="'+(mine?'on r-'+mine:'')+'">'+(mine?'<span class="em">'+Feed.REACTIONS[mine]+'</span> '+RLABEL[mine]:icon('heart')+' J\'aime')+'</button><button data-com>'+icon('comment')+' Commenter</button><button data-share>'+icon('share')+' Partager</button></div>'+
    '</article>';
  }
  function suggestions(){
    const ppl=Users.list().filter(u=>!u.deleted&&u.uid!==App.uid&&!Social.status(u.uid)&&!Social.isBlocked(u.uid)).slice(0,10);
    if(!ppl.length)return '';
    return '<div class="pcard"><div class="sec-t">Personnes que vous pourriez connaître</div><div class="sugg-row">'+ppl.map(u=>'<div class="sugg">'+avatar(u,64)+'<b data-prof="'+u.uid+'">'+esc(u.name)+'</b><small>'+(Social.followers().includes(u.uid)?'Vous suit':'@'+esc(u.username))+'</small><button class="btn primary sm" data-follow="'+u.uid+'">Suivre</button></div>').join('')+'</div></div>';
  }
  function draw(){
    if(!el)return;const box=el.querySelector('[data-feed]');
    const l=Feed.visible(posts);
    const scroll=el.querySelector('[data-scroll]').scrollTop;
    const items=[];const sg=suggestions();
    const sug={key:'sugg',sig:sg,html:sg||'<div hidden></div>'};
    l.forEach((p,i)=>{items.push({key:p.id,sig:JSON.stringify(p)+((p.likes||{})[App.uid]||''),html:card(p)});if(i===1)items.push(sug)});
    if(l.length<2)items.push(sug);
    if(!l.length)items.push({key:'empty',sig:'e',html:'<div class="pcard empty"><b>Le fil est vide.</b><br>Partagez votre premier statut !</div>'});
    reconcile(box,items);
    Media.hydrate(box);fillReposts(box);
    el.querySelector('[data-scroll]').scrollTop=scroll;
  }
  async function fillReposts(box){
    for(const r of $$('[data-orig]',box)){
      if(r.dataset.filled)continue;r.dataset.filled=1;
      const k=r.dataset.orig;const [col,id]=k.split('/');
      let o=ORIG.get(k);if(o===undefined){o=await DB.get(col,id).catch(()=>null);ORIG.set(k,o)}
      if(!o||!Social.canSee(o.uid)){r.innerHTML='<div class="muted small pad">Cette publication n\'est plus disponible.</div>';continue}
      const u=Users.peek(o.uid);
      r.innerHTML='<button class="pr-in" data-open="'+k+'">'+(o.mediaId?(o.mime&&o.mime.startsWith('video/')?'<video data-media="'+o.mediaId+'" muted preload="metadata"></video>':'<img data-media="'+o.mediaId+'" alt="">'):'')+'<div class="pad"><div class="row gap-s">'+avatar(u,28)+'<b>'+esc(u.name)+'</b><small class="muted">· '+(col==='posts_fun'?'Fun':col==='posts_star'?'Star':'Publique')+'</small></div>'+(o.text?'<p>'+richText(o.text.slice(0,300))+'</p>':'')+'</div></button>';
      Media.hydrate(r);
    }
  }
  function picker(btn){
    const card=btn.closest('[data-pid]');const p=posts.find(x=>x.id===card.dataset.pid);if(!p)return;
    $$('.rx-pick').forEach(x=>x.remove());
    const pk=document.createElement('div');pk.className='rx-pick';
    pk.innerHTML=Object.entries(Feed.REACTIONS).map(([k,e])=>'<button data-r="'+k+'" title="'+RLABEL[k]+'">'+e+'</button>').join('');
    card.appendChild(pk);
    const close=ev=>{if(!pk.contains(ev.target)){pk.remove();document.removeEventListener('pointerdown',close,true)}};
    setTimeout(()=>document.addEventListener('pointerdown',close,true),10);
    pk.onclick=e=>{e.stopPropagation();const b=e.target.closest('[data-r]');if(b){Feed.react('posts_pub',p,b.dataset.r);pk.remove();document.removeEventListener('pointerdown',close,true)}};
  }
  async function onClick(e){
    if(Date.now()-(+el.dataset.lp||0)<600)return;
    const a=e.target.closest('[data-a]');
    if(a){const x=a.dataset.a;if(x==='compose')compose();if(x==='photo')compose({photo:true});if(x==='mood')compose({mood:true});if(x==='color')compose({bg:1});if(x==='search')search();if(x==='friends')friends();return}
    const fo=e.target.closest('[data-follow]');if(fo){await Social.follow(fo.dataset.follow);return}
    const pr=e.target.closest('[data-prof]');if(pr)return Profile.open(pr.dataset.prof);
    const op=e.target.closest('[data-open]');if(op){const [c,i]=op.dataset.open.split('/');return Profile.openPost(c,i)}
    const vw=e.target.closest('[data-view]');if(vw&&vw.src)return Tabs.chat.viewer(vw.src);
    const c=e.target.closest('[data-pid]');if(!c)return;const p=posts.find(x=>x.id===c.dataset.pid);if(!p)return;
    if(e.target.closest('[data-like]')){if(e.target.closest('.rx-pick'))return;return Feed.react('posts_pub',p,(p.likes||{})[App.uid]||'like')}
    if(e.target.closest('[data-com]'))return Feed.comments('posts_pub',p);
    if(e.target.closest('[data-share]'))return Feed.share('posts_pub',p);
    if(e.target.closest('[data-menu]'))return Feed.postMenu('posts_pub',p);
  }

  /* ---------- Rédaction d'une publication ---------- */
  function compose(opt){
    opt=opt||{};let bg=opt.bg||0,mood='',file=null,fileUrl='';
    const m=Modal.open(sheetHead('Créer une publication')+'<form class="pad compose">'+
      '<div class="row gap">'+avatar(App.me,42)+'<div><b>'+esc(App.me.name)+'</b><span class="muted" data-moodl></span><br><select class="sel sm" name="vis"><option value="public">🌍 Public</option><option value="followers">👥 Abonnés</option></select></div></div>'+
      '<div class="cmp-area '+BGS[bg]+'" data-area><textarea name="t" rows="5" maxlength="5000" placeholder="Quoi de neuf, '+esc(App.me.name.split(' ')[0])+' ?" autofocus></textarea></div>'+
      '<div class="cmp-media" data-media hidden></div>'+
      '<div class="bg-row">'+BGS.map((c,i)=>'<button type="button" class="bgd '+(c||'pb-0')+(i===bg?' on':'')+'" data-bg="'+i+'" aria-label="Fond '+i+'"></button>').join('')+'</div>'+
      '<div class="cmp-tools"><span>Ajouter :</span><button type="button" class="ibtn" data-t="photo" aria-label="Photo ou vidéo">'+icon('image')+'</button><button type="button" class="ibtn" data-t="mood" aria-label="Humeur">'+icon('smile')+'</button><button type="button" class="ibtn" data-t="ai" aria-label="Rédiger avec l\'IA">'+icon('spark')+'</button></div>'+
      '<button class="btn primary block">Publier</button></form>',{sheet:true,full:true,onClose:()=>{if(fileUrl)URL.revokeObjectURL(fileUrl)}});
    const f=m.box.querySelector('form'),area=m.box.querySelector('[data-area]');
    const setFile=async x=>{file=x;if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=URL.createObjectURL(x);const box=m.box.querySelector('[data-media]');box.hidden=false;box.innerHTML=(x.type.startsWith('video/')?'<video src="'+fileUrl+'" controls playsinline></video>':'<img src="'+fileUrl+'" alt="">')+'<button type="button" class="ibtn sm" data-rm>'+icon('close')+'</button>';setBg(0)};
    const setBg=i=>{area.className='cmp-area '+BGS[i];bg=i;$$('[data-bg]',m.box).forEach(b=>b.classList.toggle('on',+b.dataset.bg===i))};
    const pickMood=()=>actionSheet(MOODS.map(([e,l])=>({icon:'smile',label:e+' '+l,fn:()=>{mood=l+' '+e;m.box.querySelector('[data-moodl]').textContent=' se sent '+mood}})),'Comment vous sentez-vous ?');
    m.box.addEventListener('click',async e=>{
      const b=e.target.closest('[data-bg]');if(b&&!file)setBg(+b.dataset.bg);
      const t=e.target.closest('[data-t]');
      if(t&&t.dataset.t==='photo'){const x=await pickFile('image/*,video/*');if(x)setFile(x)}
      if(t&&t.dataset.t==='mood')pickMood();
      if(t&&t.dataset.t==='ai'){
        const idea=f.t.value.trim()||await promptBox('Sujet de la publication',{placeholder:'ex. : ouverture de mon restaurant samedi'});if(!idea)return;
        if(!(await AI.consent()))return;
        t.disabled=true;try{f.t.value=(await AI.ask([{role:'user',content:'Rédige une publication de réseau social courte, vivante et engageante (avec quelques émojis) sur : '+idea}],'Réponds uniquement avec le texte de la publication.')).trim()}catch(x){toast(x.message,'bad')}t.disabled=false;
      }
      if(e.target.closest('[data-rm]')){file=null;const box=m.box.querySelector('[data-media]');box.hidden=true;box.innerHTML=''}
    });
    if(opt.photo)setTimeout(async()=>{const x=await pickFile('image/*,video/*');if(x)setFile(x)},50);
    if(opt.mood)setTimeout(pickMood,50);
    f.onsubmit=async e=>{
      e.preventDefault();const t=f.t.value.trim();if(!t&&!file){toast('Écrivez quelque chose ou ajoutez une photo.');return}
      const btn=f.querySelector('.btn.primary');btn.disabled=true;btn.textContent='Publication…';
      try{
        const d={text:t,visibility:f.vis.value};if(mood)d.mood=mood;if(bg&&!file)d.bg=bg;
        if(file){const blob=file.type.startsWith('image/')?await compressImage(file,1600,.85):file;d.mediaId=await Media.put(blob);d.mime=blob.type}
        await Feed.create('posts_pub',d);m.close();toast('Publié sur Publique 🌍');
        const s=el&&el.querySelector('[data-scroll]');if(s)s.scrollTop=0;
      }catch(x){toast(x.message,'bad');btn.disabled=false;btn.textContent='Publier'}
    };
  }
  function search(){
    const m=Modal.open(sheetHead('Rechercher')+'<div class="pad-x"><label class="search">'+icon('search')+'<input placeholder="Personnes, publications, #hashtags" data-q autofocus autocomplete="off"></label></div><div class="pick-list" data-r></div>',{sheet:true,full:true});
    const r=m.box.querySelector('[data-r]');
    m.box.querySelector('[data-q]').oninput=e=>{
      const q=norm(e.target.value.trim());if(!q){r.innerHTML='';return}
      const ppl=Users.list().filter(u=>!u.deleted&&norm(u.name+' '+u.username).includes(q.replace(/^@/,''))).slice(0,15);
      const ps=Feed.visible(posts).filter(p=>norm(p.text).includes(q)).slice(0,20);
      r.innerHTML=(ppl.length?'<div class="sec-t">Personnes</div>'+ppl.map(u=>'<button class="li" data-u="'+u.uid+'">'+avatar(u,42)+'<span class="li-t"><b>'+esc(u.name)+'</b><small>@'+esc(u.username)+'</small></span></button>').join(''):'')+
        (ps.length?'<div class="sec-t">Publications</div>'+ps.map(p=>'<button class="li" data-p="'+p.id+'">'+avatar(Users.peek(p.uid),36)+'<span class="li-t"><b>'+esc(Users.peek(p.uid).name)+'</b><small>'+esc(p.text.slice(0,100))+'</small></span></button>').join(''):'')||'<p class="empty">Aucun résultat.</p>';
    };
    r.onclick=e=>{const u=e.target.closest('[data-u]');if(u){m.close();Profile.open(u.dataset.u)}const p=e.target.closest('[data-p]');if(p){m.close();Profile.openPost('posts_pub',p.dataset.p)}};
  }
  function friends(){
    const req=Social.requests();
    const m=Modal.open(sheetHead('Abonnements')+'<div class="pick-list">'+(req.length?'<div class="sec-t">Demandes ('+req.length+')</div>'+req.map(r=>{const u=Users.peek(r.from);return '<div class="li">'+avatar(u,48)+'<span class="li-t"><b>'+esc(u.name)+'</b><small>'+ago(r.at)+'</small></span><button class="btn primary sm" data-ok="'+r.from+'">Confirmer</button><button class="btn ghost sm" data-no="'+r.from+'">Supprimer</button></div>'}).join(''):'<p class="empty small">Aucune demande en attente.</p>')+
      '<div class="sec-t">Vos abonnés ('+Social.followers().length+')</div>'+Social.followers().map(uid=>{const u=Users.peek(uid);return '<button class="li" data-u="'+uid+'">'+avatar(u,42)+'<span class="li-t"><b>'+esc(u.name)+'</b><small>@'+esc(u.username)+'</small></span></button>'}).join('')+
      '<div class="sec-t">Vous suivez ('+Social.following().length+')</div>'+Social.following().map(uid=>{const u=Users.peek(uid);return '<button class="li" data-u="'+uid+'">'+avatar(u,42)+'<span class="li-t"><b>'+esc(u.name)+'</b><small>@'+esc(u.username)+'</small></span></button>'}).join('')+'</div>',{sheet:true,full:true});
    m.box.onclick=async e=>{const o=e.target.closest('[data-ok]');if(o){await Social.accept(o.dataset.ok);m.close();friends()}const n=e.target.closest('[data-no]');if(n){await Social.decline(n.dataset.no);m.close();friends()}const u=e.target.closest('[data-u]');if(u){m.close();Profile.open(u.dataset.u)}};
  }
  return {mount,unmount};
})();
