/* Lisanga — Profils, détail d'une publication, onglet MOI (profil + paramètres de sécurité et de confidentialité) */
'use strict';

const Profile={
  async open(uid){
    if(!uid)return;
    const u=await Users.get(uid);if(!u){toast('Profil introuvable.');return}
    const me=uid===App.uid;
    const m=Modal.open('<div class="prof" data-p><p class="muted pad">Chargement…</p></div>',{sheet:true,full:true});
    const render=async()=>{
      const [counts,star,fun,pub]=await Promise.all([Social.counts(uid),DB.query('posts_star',{where:[['uid','==',uid]]}),DB.query('posts_fun',{where:[['uid','==',uid]]}),DB.query('posts_pub',{where:[['uid','==',uid]]})]);
      const st=Social.status(uid);const locked=!Social.canSee(uid);
      const by=(a)=>a.sort((x,y)=>y.at-x.at);
      const tab=m.box.dataset.tab||'star';
      const grid=list=>list.length?'<div class="grid3">'+list.map(p=>'<button class="gcell" data-o="'+p.__col+'/'+p.id+'">'+(p.mediaId?(p.mime&&p.mime.startsWith('video/')?'<video data-media="'+p.mediaId+'" muted playsinline preload="metadata"></video><i class="gbadge">'+icon('play','xs')+'</i>':'<img data-media="'+p.mediaId+'" alt="" loading="lazy">'):'<span class="gtext">'+esc((p.text||'').slice(0,90))+'</span>')+'</button>').join('')+'</div>':'<p class="empty">Rien à afficher.</p>';
      star.forEach(p=>p.__col='posts_star');fun.forEach(p=>p.__col='posts_fun');pub.forEach(p=>p.__col='posts_pub');
      m.box.querySelector('[data-p]').innerHTML=
        '<div class="prof-top"><button class="ibtn" data-close>'+icon('back')+'</button><b>@'+esc(u.username)+'</b><button class="ibtn" data-pm>'+icon('dotsh')+'</button></div>'+
        '<div class="prof-head">'+avatar(u,88,'ring')+'<div class="prof-stats"><div><b>'+(star.length+fun.length+pub.length)+'</b><small>publications</small></div><div><b>'+counts.followers+'</b><small>abonnés</small></div><div><b>'+counts.following+'</b><small>abonnements</small></div></div></div>'+
        '<div class="prof-bio"><h2>'+esc(u.name)+(u.privacy&&u.privacy.private?' '+icon('lock','xs'):'')+'</h2>'+(u.bio?'<p>'+richText(u.bio)+'</p>':'')+'<small class="muted">'+esc(Users.seenText(u)||'')+'</small></div>'+
        '<div class="prof-btns">'+(me?'<button class="btn ghost" data-edit>Modifier le profil</button><button class="btn ghost" data-share>Partager le profil</button>':
          (u.deleted?'':'<button class="btn '+(st?'ghost':'primary')+'" data-follow>'+(st==='ok'?'Abonné ✓':st==='pending'?'Demande envoyée':'Suivre')+'</button><button class="btn ghost" data-msg>Message</button><button class="btn ghost icon-only" data-call aria-label="Appeler">'+icon('phone')+'</button>'))+'</div>'+
        (locked?'<div class="empty">'+icon('lock')+'<br><b>Ce compte est privé</b><br>Suivez ce compte pour voir ses photos et vidéos.</div>':
        '<div class="seg prof-seg"><button data-t="star" class="'+(tab==='star'?'on':'')+'">'+icon('star','xs')+' Star</button><button data-t="fun" class="'+(tab==='fun'?'on':'')+'">'+icon('fun','xs')+' Fun</button><button data-t="pub" class="'+(tab==='pub'?'on':'')+'">'+icon('globe','xs')+' Publique</button></div>'+
        grid(Feed.visible(by(tab==='star'?star:tab==='fun'?fun:pub))));
      Media.hydrate(m.box);
    };
    render();
    m.box.addEventListener('click',async e=>{
      const t=e.target.closest('[data-t]');if(t){m.box.dataset.tab=t.dataset.t;render();return}
      const o=e.target.closest('[data-o]');if(o){const [c,i]=o.dataset.o.split('/');Profile.openPost(c,i);return}
      if(e.target.closest('[data-edit]')){m.close();Settings.editProfile();return}
      if(e.target.closest('[data-share]')){navigator.clipboard&&navigator.clipboard.writeText('@'+u.username);toast('Nom d\'utilisateur copié : @'+u.username);return}
      if(e.target.closest('[data-follow]')){const st=Social.status(uid);if(st){if(await confirmBox(st==='ok'?'Ne plus suivre '+u.name+' ?':'Annuler la demande ?','Confirmer'))await Social.unfollow(uid)}else await Social.follow(uid);setTimeout(render,300);return}
      if(e.target.closest('[data-msg]')){Modal.closeAll();Chat.openDirect(uid);return}
      if(e.target.closest('[data-call]')){const id='d_'+[App.uid,uid].sort().join('_');let c=Chat.get(id)||await DB.get('chats',id);if(!c){await DB.set('chats',id,{type:'direct',members:[App.uid,uid],createdAt:Date.now(),createdBy:App.uid,unread:{},reads:{}});c=await DB.get('chats',id)}Modal.closeAll();actionSheet([{icon:'phone',label:'Appel audio',fn:()=>Calls.call(c,'audio')},{icon:'video',label:'Appel vidéo',fn:()=>Calls.call(c,'video')}]);return}
      if(e.target.closest('[data-pm]')){
        actionSheet(me?[{icon:'settings',label:'Paramètres',fn:()=>{Modal.closeAll();App.go('moi')}}]:[
          {icon:'copy',label:'Copier le nom d\'utilisateur',fn:()=>{navigator.clipboard&&navigator.clipboard.writeText('@'+u.username);toast('Copié.')}},
          {icon:'block',label:Social.isBlocked(uid)?'Débloquer':'Bloquer',danger:true,fn:async()=>{if(Social.isBlocked(uid))await Social.unblock(uid);else if(await confirmBox('Bloquer '+u.name+' ?','Bloquer',true)){await Social.block(uid);m.close()}}},
          {icon:'flag',label:'Signaler',danger:true,fn:()=>Social.report('user',uid,uid)}
        ]);
      }
    });
  },
  /* Détail d'une publication (depuis une grille, un partage, etc.) */
  async openPost(col,id){
    const p=await DB.get(col,id);
    if(!p||!Social.canSee(p.uid)){toast('Publication indisponible.');return}
    const u=Users.peek(p.uid);
    const media=p.mediaId?(p.mime&&p.mime.startsWith('video/')?'<video data-media="'+p.mediaId+'" controls autoplay loop playsinline></video>':'<img data-media="'+p.mediaId+'" alt="">'):(col==='posts_fun'?'<div class="fun-textclip fun-bg'+(((p.bg||0)%5)+1)+'"><p>'+richText(p.text||'')+'</p></div>':'');
    const m=Modal.open(sheetHead(col==='posts_fun'?'Vidéo Fun':col==='posts_star'?'Publication Star':'Publication')+
      '<div class="post-detail" data-pid="'+p.id+'"><div class="row gap pad-x">'+avatar(u,38)+'<button class="pp-n" data-prof="'+p.uid+'"><b>'+esc(u.name)+'</b><br><small class="muted">'+ago(p.at)+'</small></button><span class="grow"></span><button class="ibtn" data-menu>'+icon('dotsh')+'</button></div>'+
      '<div class="pd-media">'+media+'</div>'+(p.text&&(p.mediaId||col!=='posts_fun')?'<p class="pad-x">'+richText(p.text)+'</p>':'')+
      '<div class="sp-act pad-x"><button class="ibtn'+((p.likes||{})[App.uid]?' liked':'')+'" data-like>'+icon('heart')+'</button><b>'+Feed.likeCount(p)+'</b><button class="ibtn" data-com>'+icon('comment')+'</button><b>'+(p.comments||0)+'</b><button class="ibtn" data-share>'+icon('share')+'</button><span class="grow"></span><button class="ibtn'+(Feed.saved().includes(col+':'+p.id)?' saved':'')+'" data-save>'+icon('bookmark')+'</button></div></div>',{sheet:true,full:true});
    Media.hydrate(m.box);
    m.box.addEventListener('click',async e=>{
      if(e.target.closest('[data-prof]')){Profile.open(p.uid);return}
      if(e.target.closest('[data-like]')){await Feed.react(col,p,col==='posts_pub'?'like':'love');m.close();Profile.openPost(col,id)}
      if(e.target.closest('[data-com]'))Feed.comments(col,p);
      if(e.target.closest('[data-share]'))Feed.share(col,p);
      if(e.target.closest('[data-save]')){await Feed.toggleSave(col,p);e.target.closest('[data-save]').classList.toggle('saved')}
      if(e.target.closest('[data-menu]'))Feed.postMenu(col,p);
    });
  }
};

/* =================== Onglet MOI : profil et paramètres =================== */
const Settings={
  welcome(){
    Modal.open('<div class="pad center-t"><div class="logo-mid">'+LOGO+'</div><h2>Bienvenue sur Lisanga, '+esc(App.me.name.split(' ')[0])+' !</h2><p class="muted">Cinq univers dans une seule application :</p><ul class="welcome-l"><li>'+icon('chat')+'<span><b>Chat</b> — messages, vocaux, appels audio et vidéo chiffrés</span></li><li>'+icon('star')+'<span><b>Star</b> — stories 24 h et photos avec filtres</span></li><li>'+icon('fun')+'<span><b>Fun</b> — vidéos courtes en plein écran</span></li><li>'+icon('globe')+'<span><b>Publique</b> — fil d\'actualité et réactions</span></li><li>'+icon('spark')+'<span><b>IA</b> — Lisa, votre assistante</span></li></ul>'+(DB.remote&&!Auth.verified?'<p class="small muted">Un e-mail de vérification vous a été envoyé.</p>':'')+'<div class="row center gap mt"><button class="btn ghost" data-close>Plus tard</button><button class="btn primary" data-go>Compléter mon profil</button></div></div>',{cls:'small'}).box.querySelector('[data-go]').onclick=()=>{Modal.closeAll();this.editProfile()};
  },
  editProfile(){
    let av=App.me.avatar||'';
    const m=Modal.open(sheetHead('Modifier le profil')+'<form class="pad"><div class="center-t"><button type="button" class="av-edit" data-av>'+avatar(App.me,96)+'<span>'+icon('camera')+'</span></button><br><button type="button" class="link" data-rm>Retirer la photo</button></div>'+
      '<label>Nom affiché<input class="inp" name="name" value="'+esc(App.me.name)+'" maxlength="40" required></label>'+
      '<label>Nom d\'utilisateur<input class="inp" name="username" value="'+esc(App.me.username)+'" maxlength="20" required></label>'+
      '<label>Bio<textarea class="inp" name="bio" rows="3" maxlength="160" placeholder="Quelques mots sur vous…">'+esc(App.me.bio||'')+'</textarea></label><p class="err" data-err></p><button class="btn primary block">Enregistrer</button></form>',{sheet:true,full:true});
    const f=m.box.querySelector('form');
    m.box.querySelector('[data-av]').onclick=async()=>{const x=await pickFile('image/*');if(!x)return;av=await squareThumb(x,192);m.box.querySelector('[data-av] .av').outerHTML=avatar({...App.me,avatar:av},96)};
    m.box.querySelector('[data-rm]').onclick=()=>{av='';m.box.querySelector('[data-av] .av').outerHTML=avatar({...App.me,avatar:''},96)};
    f.onsubmit=async e=>{
      e.preventDefault();const err=f.querySelector('[data-err]');
      const username=f.username.value.trim().toLowerCase().replace(/^@/,'');
      if(!Auth.USER_RE.test(username)){err.textContent='Nom d\'utilisateur : 3 à 20 caractères (a-z, 0-9, . _).';return}
      if(username!==App.me.username&&!(await Auth.usernameFree(username,App.uid))){err.textContent='Ce nom d\'utilisateur est déjà pris.';return}
      await DB.update('users',App.uid,{name:f.name.value.trim(),username,bio:f.bio.value.trim(),avatar:av});
      m.close();toast('Profil mis à jour.');
    };
  }
};

Tabs.moi=(()=>{
  let el,offs=[];
  function mount(v){
    el=v;draw();
    offs=[App.on('me',draw),Social.on(draw)];
    el.onclick=onClick;el.onchange=onChange;
  }
  function unmount(){offs.forEach(f=>f());offs=[];el=null}
  const sel=(name,val,opts)=>'<select class="sel" data-set="'+name+'">'+opts.map(([v,l])=>'<option value="'+v+'"'+(String(val)===String(v)?' selected':'')+'>'+l+'</option>').join('')+'</select>';
  const sw=(name,on)=>'<label class="sw"><input type="checkbox" data-set="'+name+'"'+(on?' checked':'')+'><i></i></label>';
  function draw(){
    if(!el)return;const me=App.me,pv=me.privacy||{},pf=App.prefs();const lock=Lock.cfg();
    const theme=jget('lsg:theme','auto');const req=Social.requests().length;
    el.innerHTML='<header class="pane-h"><h1 class="brand-t">Moi</h1><button class="ibtn" data-a="logout" aria-label="Se déconnecter">'+icon('logout')+'</button></header><div class="scroll"><div class="set-col">'+
      '<button class="me-card" data-a="profile">'+avatar(me,64)+'<span><b>'+esc(me.name)+'</b><small>@'+esc(me.username)+'</small><small class="muted">'+esc(me.bio||'Ajoutez une bio')+'</small></span>'+icon('back','flip-x')+'</button>'+
      (req?'<button class="set-alert" data-a="requests">'+icon('users')+' '+req+' demande(s) d\'abonnement en attente</button>':'')+
      (DB.remote&&!Auth.verified?'<div class="set-alert warn">'+icon('info')+' Adresse e-mail non vérifiée. <button class="link" data-a="verify">Renvoyer l\'e-mail</button></div>':'')+

      '<h3 class="set-h">'+icon('shield')+' Sécurité</h3><div class="set-card">'+
        '<div class="set-row"><span><b>Chiffrement de bout en bout</b><small>Toujours activé pour les discussions, vocaux, fichiers et appels.</small></span><button class="btn ghost sm" data-a="key">Ma clé</button></div>'+
        '<div class="set-row"><span><b>Verrouillage par code</b><small>'+(lock?'Activé · verrouille après '+(lock.delay>=60?lock.delay/60+' min':lock.delay+' s')+' en arrière-plan':'Protégez l\'application avec un code à 4 ou 6 chiffres.')+'</small></span>'+(lock?'<button class="btn ghost sm" data-a="lockoff">Désactiver</button>':'<button class="btn primary sm" data-a="lockon">Activer</button>')+'</div>'+
        (lock?'<div class="set-row"><span><b>Délai de verrouillage</b></span>'+sel('lockdelay',lock.delay,[[0,'Immédiat'],[60,'1 minute'],[300,'5 minutes'],[900,'15 minutes'],[3600,'1 heure']])+'</div>':'')+
        '<div class="set-row"><span><b>Masquer l\'écran en arrière-plan</b><small>Floute le contenu quand vous changez d\'application (avec le verrouillage).</small></span>'+sw('veil',pf.veil!==false)+'</div>'+
        '<div class="set-row"><span><b>Mot de passe</b><small>Il protège aussi la sauvegarde chiffrée de vos clés.</small></span><button class="btn ghost sm" data-a="pass">Changer</button></div>'+
        '<div class="set-row"><span><b>Appareils connectés</b><small>Voir où votre compte est ouvert.</small></span><button class="btn ghost sm" data-a="sessions">Voir</button></div>'+
      '</div>'+

      '<h3 class="set-h">'+icon('eye')+' Confidentialité</h3><div class="set-card">'+
        '<div class="set-row"><span><b>Vu à et en ligne</b></span>'+sel('p.lastSeen',pv.lastSeen||'all',[['all','Tout le monde'],['contacts','Mes contacts'],['none','Personne']])+'</div>'+
        '<div class="set-row"><span><b>Accusés de lecture</b><small>Désactivés, les autres ne voient plus quand vous avez lu leurs messages.</small></span>'+sw('p.readReceipts',pv.readReceipts!==false)+'</div>'+
        '<div class="set-row"><span><b>Compte privé</b><small>Seuls les abonnés que vous acceptez voient vos publications Star, Fun et Publique.</small></span>'+sw('p.private',!!pv.private)+'</div>'+
        '<div class="set-row"><span><b>Qui peut m\'écrire</b></span>'+sel('p.messages',pv.messages||'all',[['all','Tout le monde'],['following','Personnes que je suis']])+'</div>'+
        '<div class="set-row"><span><b>Utilisateurs bloqués</b><small>'+Social.blocked().length+' bloqué(s)</small></span><button class="btn ghost sm" data-a="blocked">Gérer</button></div>'+
      '</div>'+

      '<h3 class="set-h">'+icon('bell')+' Notifications et sons</h3><div class="set-card">'+
        '<div class="set-row"><span><b>Notifications du navigateur</b><small>'+(!('Notification' in window)?'Non prises en charge.':Notification.permission==='granted'?'Autorisées':Notification.permission==='denied'?'Bloquées dans le navigateur':'Pas encore autorisées')+'</small></span>'+('Notification' in window&&Notification.permission==='default'?'<button class="btn primary sm" data-a="notif">Autoriser</button>':sw('notif',pf.notif!==false))+'</div>'+
        '<div class="set-row"><span><b>Sons</b><small>Messages et envois.</small></span>'+sw('sounds',pf.sounds!==false)+'</div>'+
      '</div>'+

      '<h3 class="set-h">'+icon('sun')+' Apparence</h3><div class="set-card"><div class="set-row"><span><b>Thème</b></span>'+sel('theme',theme,[['auto','Automatique'],['dark','Sombre'],['light','Clair']])+'</div></div>'+

      '<h3 class="set-h">'+icon('archive')+' Stockage</h3><div class="set-card"><div class="set-row"><span><b>Médias sur cet appareil</b><small data-usage>Calcul…</small></span><button class="btn ghost sm" data-a="clear">Vider le cache</button></div></div>'+

      '<h3 class="set-h">'+icon('info')+' À propos</h3><div class="set-card">'+
        '<div class="set-row"><span><b>Lisanga V'+APP_VERSION+'</b><small>Mode '+(DB.remote?'en ligne (Firebase)':'local (ce navigateur)')+' · IA '+(AI.online?'connectée':'hors ligne')+'</small></span><button class="btn ghost sm" data-a="news">Nouveautés</button></div>'+
        '<button class="set-row link-row" data-a="logout">'+icon('logout')+' Se déconnecter</button>'+
        '<button class="set-row link-row danger-t" data-a="delete">'+icon('trash')+' Supprimer mon compte</button>'+
      '</div><p class="muted small center-t">Fait avec ❤️ à Kinshasa</p></div></div>';
    Media.usage().then(u=>{const x=el&&el.querySelector('[data-usage]');if(x)x.textContent=u.count+' fichier(s) · '+fmtSize(u.size)});
  }
  async function onChange(e){
    const t=e.target.closest('[data-set]');if(!t)return;
    const k=t.dataset.set,v=t.type==='checkbox'?t.checked:t.value;
    if(k.startsWith('p.')){await DB.update('users',App.uid,{['privacy.'+k.slice(2)]:v});toast('Confidentialité mise à jour.');if(k==='p.lastSeen'&&App._beat)App._beat()}
    else if(k==='theme'){jset('lsg:theme',v);App.theme()}
    else if(k==='lockdelay'){const c=Lock.cfg();c.delay=+v;jset(Lock.key(),c);draw()}
    else App.setPref(k,v);
  }
  async function onClick(e){
    const a=e.target.closest('[data-a]');if(!a)return;
    switch(a.dataset.a){
      case 'profile':return Profile.open(App.uid);
      case 'requests':return Tabs.star&&App.go('star');
      case 'verify':try{await firebase.auth().currentUser.sendEmailVerification();toast('E-mail envoyé.')}catch(x){toast(x.message,'bad')}return;
      case 'logout':if(await confirmBox('Se déconnecter de Lisanga sur cet appareil ?','Se déconnecter'))App.leave();return;
      case 'key':{
        const fp=await E2E.fingerprint(App.me);
        Modal.open(sheetHead('Votre clé de chiffrement')+'<div class="pad"><p>Empreinte de votre clé publique :</p><code class="safety">'+fp+'</code><p class="muted small mt">Vos messages sont chiffrés avec AES-GCM 256 bits. La clé privée reste sur vos appareils ; une copie de secours est chiffrée avec votre mot de passe. Pour vérifier un contact, comparez le « numéro de sécurité » affiché dans les infos de la discussion.</p></div>',{sheet:true});return;
      }
      case 'lockon':{
        const p1=await promptBox('Choisissez un code',{type:'password',inputmode:'numeric',placeholder:'4 ou 6 chiffres',hint:'Ce code verrouille Lisanga sur cet appareil.'});if(p1===null)return;
        if(!/^(\d{4}|\d{6})$/.test(p1)){toast('Le code doit contenir 4 ou 6 chiffres.','bad');return}
        const p2=await promptBox('Confirmez le code',{type:'password',inputmode:'numeric'});if(p2!==p1){toast('Les codes ne correspondent pas.','bad');return}
        await Lock.set(p1,60);toast('Verrouillage activé.');draw();return;
      }
      case 'lockoff':{
        const p=await promptBox('Code actuel',{type:'password',inputmode:'numeric'});if(p===null)return;
        const c=Lock.cfg();const h=await E2E.hash(p,c.salt);if(h.hash!==c.hash){toast('Code incorrect.','bad');return}
        Lock.off();toast('Verrouillage désactivé.');draw();return;
      }
      case 'pass':{
        const m=Modal.open('<form class="pad"><h3>Changer le mot de passe</h3><label>Mot de passe actuel<input class="inp" type="password" name="o" required autocomplete="current-password"></label><label>Nouveau mot de passe<input class="inp" type="password" name="n" required minlength="8" autocomplete="new-password"></label><p class="err" data-err></p><div class="row end gap"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary">Changer</button></div></form>',{cls:'small'});
        m.box.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{await Auth.changePassword(ev.target.o.value,ev.target.n.value);m.close();toast('Mot de passe changé.')}catch(x){m.box.querySelector('[data-err]').textContent=x.message}};
        return;
      }
      case 'sessions':{
        const s=(await DB.query('users/'+App.uid+'/sessions',{orderBy:['at','desc']}));
        Modal.open(sheetHead('Appareils connectés')+'<div class="pick-list">'+s.map(x=>'<div class="li">'+icon(/Android|iOS/.test(x.device)?'phone':'screen')+'<span class="li-t"><b>'+esc(x.device)+(x.id===Auth.deviceId?' · cet appareil':'')+'</b><small>Dernière connexion : '+new Date(x.at).toLocaleString('fr-FR')+(x.first?' · première : '+new Date(x.first).toLocaleDateString('fr-FR'):'')+'</small></span></div>').join('')+'</div><p class="muted small pad">Vous ne reconnaissez pas un appareil ? Changez votre mot de passe immédiatement.</p>',{sheet:true});return;
      }
      case 'blocked':{
        const b=Social.blocked();
        const m=Modal.open(sheetHead('Utilisateurs bloqués')+'<div class="pick-list">'+(b.length?b.map(u=>'<div class="li">'+avatar(Users.peek(u),40)+'<span class="li-t"><b>'+esc(Users.peek(u).name)+'</b><small>@'+esc(Users.peek(u).username)+'</small></span><button class="btn ghost sm" data-u="'+u+'">Débloquer</button></div>').join(''):'<p class="empty">Personne n\'est bloqué.</p>')+'</div>',{sheet:true});
        m.box.onclick=async ev=>{const x=ev.target.closest('[data-u]');if(x){await Social.unblock(x.dataset.u);x.closest('.li').remove()}};return;
      }
      case 'notif':{const r=await Notification.requestPermission();if(r==='granted')App.setPref('notif',true);draw();return}
      case 'clear':if(await confirmBox(DB.remote?'Vider le cache des médias ? Ils seront re-téléchargés au besoin.':'En mode local, les médias ne sont stockés que sur cet appareil : le cache ne peut pas être vidé sans les perdre.','OK')){await Media.clearCache();draw()}return;
      case 'news':Modal.open(sheetHead('Nouveautés')+'<div class="pad ai-md">'+miniMd(CHANGELOG)+'</div>',{sheet:true,full:true});return;
      case 'delete':{
        const pw=await promptBox('Supprimer définitivement votre compte',{type:'password',hint:'Vos publications, stories et abonnements seront supprimés. Saisissez votre mot de passe pour confirmer.',ok:'Supprimer'});
        if(!pw)return;
        try{await Auth.deleteAccount(pw);toast('Compte supprimé.');App.uid&&(App.offs.forEach(f=>f()),App.offs=[]);location.hash='';location.reload()}catch(x){toast(x.message,'bad')}
        return;
      }
    }
  }
  return {mount,unmount};
})();
