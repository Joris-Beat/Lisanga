/* Lisanga — Démarrage, écrans de connexion, navigation, présence, verrouillage */
'use strict';

const Tabs={};
const TAB_LIST=[
  {id:'chat',label:'Chat',icon:'chat'},
  {id:'star',label:'Star',icon:'star'},
  {id:'fun',label:'Fun',icon:'fun',big:true},
  {id:'publique',label:'Publique',icon:'globe'},
  {id:'ia',label:'IA',icon:'spark'}
];

const App={
  uid:null,me:null,priv:{},tab:null,arg:null,
  subs:{},offs:[],
  on(ev,fn){(this.subs[ev]=this.subs[ev]||new Set()).add(fn);return ()=>this.subs[ev].delete(fn)},
  emit(ev,x){(this.subs[ev]||[]).forEach(f=>{try{f(x)}catch(e){console.error(e)}})},
  prefs(){return jget('lsg:prefs:'+(this.uid||'_'),{})},
  setPref(k,v){const p=this.prefs();p[k]=v;jset('lsg:prefs:'+(this.uid||'_'),p);this.emit('prefs',p)},

  theme(){const t=jget('lsg:theme','auto');if(t==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',t)},

  async boot(){
    this.theme();
    if(!window.crypto||!crypto.subtle){$('#app').innerHTML='<div class="boot">Ouvrez Lisanga via une adresse <b>https://</b> (ou localhost) : le chiffrement l\'exige.</div>';return}
    if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
    const uid=await Auth.restore();
    if(!uid)return this.authScreen();
    if(!(await E2E.load(uid)))return this.unlockScreen(uid);
    this.enter(uid);
  },

  /* ---------- Connexion / inscription ---------- */
  authScreen(mode){
    mode=mode||'login';
    const local=!DB.remote;
    $('#app').innerHTML='<div class="auth">'+
      '<section class="auth-brand"><div class="auth-orbs"><i></i><i></i><i></i></div>'+
        '<div class="logo-big">'+LOGO+'</div><h1>Lisanga</h1><p>Discutez, appelez, partagez et créez.<br>Une seule application, cinq univers.</p>'+
        '<ul class="auth-feat"><li>'+icon('chat')+'<span><b>Chat</b> messages, vocaux, appels audio et vidéo</span></li><li>'+icon('star')+'<span><b>Star</b> stories et photos</span></li><li>'+icon('fun')+'<span><b>Fun</b> vidéos courtes</span></li><li>'+icon('globe')+'<span><b>Publique</b> fil d\'actualité et réactions</span></li><li>'+icon('spark')+'<span><b>IA</b> assistant intégré</span></li></ul>'+
        '<div class="auth-e2e">'+icon('shield')+' Messages chiffrés de bout en bout</div>'+
      '</section>'+
      '<section class="auth-form">'+
        (mode==='login'?
          '<form data-f="login" class="card-f"><h2>Connexion</h2><label>E-mail<input class="inp" name="email" type="email" autocomplete="email" required></label><label>Mot de passe<input class="inp" name="password" type="password" autocomplete="current-password" required></label><p class="err" data-err></p><button class="btn primary block">Se connecter</button>'+
          '<div class="row between mt"><button type="button" class="link" data-m="signup">Créer un compte</button>'+(local?'':'<button type="button" class="link" data-m="forgot">Mot de passe oublié ?</button>')+'</div></form>'
        :mode==='signup'?
          '<form data-f="signup" class="card-f"><h2>Créer un compte</h2><label>Nom affiché<input class="inp" name="name" autocomplete="name" required maxlength="40"></label><label>Nom d\'utilisateur<input class="inp" name="username" autocomplete="username" required maxlength="20" placeholder="ex. : amani.k"></label><label>E-mail<input class="inp" name="email" type="email" autocomplete="email" required></label><label>Mot de passe<input class="inp" name="password" type="password" autocomplete="new-password" required minlength="8"><small class="muted">8 caractères minimum, avec des lettres et un chiffre. Il protège aussi vos clés de chiffrement.</small></label><p class="err" data-err></p><button class="btn primary block">Créer mon compte</button><div class="row mt"><button type="button" class="link" data-m="login">J\'ai déjà un compte</button></div></form>'
        :
          '<form data-f="forgot" class="card-f"><h2>Mot de passe oublié</h2><p class="muted small">Vous recevrez un lien par e-mail. Attention : vos anciens messages chiffrés ne pourront pas être relus avec un nouveau mot de passe.</p><label>E-mail<input class="inp" name="email" type="email" required></label><p class="err" data-err></p><button class="btn primary block">Envoyer le lien</button><div class="row mt"><button type="button" class="link" data-m="login">Retour</button></div></form>')+
        (local?'<div class="local-note">'+icon('info')+'<div><b>Mode local</b> : les comptes et messages restent dans ce navigateur. Pour essayer à deux, ouvrez un <b>deuxième onglet</b> et connectez-vous avec un autre compte. Pour communiquer entre appareils, suivez le GUIDE (Firebase).<br><button class="btn ghost sm mt" data-demo>Créer les comptes de démonstration</button></div></div>':'')+
        '<div class="ver">Lisanga V'+APP_VERSION+'</div>'+
      '</section></div>';
    const app=$('#app');
    app.onclick=async e=>{
      const m=e.target.closest('[data-m]');if(m)return this.authScreen(m.dataset.m);
      if(e.target.closest('[data-demo]')){const b=e.target.closest('[data-demo]');b.disabled=true;b.textContent='Création…';try{await Demo.seed();this.authScreen('login');toast('Comptes créés : amani@demo.cd, grace@demo.cd, kevin@demo.cd — mot de passe : demo1234')}catch(err){toast(err.message,'bad');b.disabled=false}}
    };
    const f=app.querySelector('form');
    f.onsubmit=async e=>{
      e.preventDefault();
      const btn=f.querySelector('button.primary'),err=f.querySelector('[data-err]');err.textContent='';btn.disabled=true;
      const v=Object.fromEntries(new FormData(f));
      try{
        if(f.dataset.f==='login'){const uid=await Auth.login(v.email,v.password);this.enter(uid)}
        else if(f.dataset.f==='signup'){const uid=await Auth.signup(v);this.enter(uid,true)}
        else{await Auth.resetPassword(v.email);toast('Lien envoyé. Vérifiez votre boîte e-mail.');this.authScreen('login')}
      }catch(x){
        if(x.code==='keys'){this.unlockScreen(null,v.password);return}
        err.textContent=x.message;btn.disabled=false;
      }
    };
  },

  /* Nouvel appareil (ou données effacées) : il faut le mot de passe pour déchiffrer les clés */
  async unlockScreen(uid,triedPw){
    uid=uid||(await Auth.restore());
    $('#app').innerHTML='<div class="center-screen"><form class="card-f narrow"><div class="logo-mid">'+LOGO+'</div><h2>Déverrouiller vos messages</h2><p class="muted small">Vos clés de chiffrement ne sont pas encore sur cet appareil. Saisissez votre mot de passe pour les récupérer.</p><label>Mot de passe<input class="inp" type="password" name="p" autocomplete="current-password" required autofocus></label><p class="err" data-err>'+(triedPw?'Le mot de passe actuel ne déchiffre pas vos anciennes clés (mot de passe réinitialisé ?). Essayez l\'ancien mot de passe, ou créez de nouvelles clés.':'')+'</p><button class="btn primary block">Déverrouiller</button><button type="button" class="btn ghost block mt" data-new>Créer de nouvelles clés</button><button type="button" class="link mt" data-out>Se déconnecter</button></form></div>';
    const f=$('#app form');
    f.onsubmit=async e=>{e.preventDefault();try{await Auth.unlockKeys(uid,f.p.value);this.enter(uid)}catch(x){f.querySelector('[data-err]').textContent=x.message}};
    f.querySelector('[data-out]').onclick=async()=>{await Auth.logout();this.authScreen()};
    f.querySelector('[data-new]').onclick=async()=>{
      const pw=f.p.value||triedPw;if(!pw){f.querySelector('[data-err]').textContent='Saisissez votre mot de passe actuel.';return}
      if(!(await confirmBox('Vos anciens messages chiffrés deviendront illisibles sur ce compte. Continuer ?','Créer de nouvelles clés',true)))return;
      await Auth.unlockKeys(uid,pw,true);this.enter(uid);
    };
  },

  /* ---------- Entrée dans l'application ---------- */
  async enter(uid,isNew){
    this.uid=uid;
    $('#app').innerHTML='<div class="boot">'+LOGO_SMALL+'</div>';
    Users.start();
    this.me=await Users.get(uid);
    if(!this.me){await Auth.logout();return this.authScreen()}
    this.offs.push(DB.watchDoc('users',uid,u=>{if(u){this.me={...u,uid};Users.map.set(uid,this.me);this.emit('me',this.me)}}));
    this.offs.push(DB.watchDoc('private',uid,d=>{this.priv=d||{};this.emit('priv',this.priv)}));
    Social.start(uid);
    Chat.start(uid);
    Calls.listen(uid);
    this.presence();
    this.shell();
    const h=location.hash.slice(1).split('/');
    this.go(TAB_LIST.some(t=>t.id===h[0])||h[0]==='moi'?h[0]:'chat',h[1]);
    if(Lock.enabled())Lock.show();
    if(isNew)setTimeout(()=>Settings.welcome(),400);
  },
  async leave(){
    Calls.stop();if(Calls.active)Calls.end();
    Chat.stop();Social.stop();Users.stop();
    this.offs.forEach(f=>f());this.offs=[];
    clearInterval(this.presTimer);
    if(this.tab&&Tabs[this.tab]&&Tabs[this.tab].unmount)Tabs[this.tab].unmount();
    this.tab=null;Modal.closeAll();
    await Auth.logout();
    this.uid=null;this.me=null;this.priv={};location.hash='';
    this.authScreen();
  },

  presence(){
    const beat=()=>{if(!this.uid||document.hidden)return;const p=(this.me.privacy||{}).lastSeen;DB.update('users',this.uid,{lastSeen:p==='none'?0:Date.now()}).catch(()=>{})};
    beat();clearInterval(this.presTimer);this.presTimer=setInterval(beat,45000);
    if(!this._presBound){this._presBound=true;document.addEventListener('visibilitychange',()=>this._beat&&this._beat())}
    this._beat=beat;
  },

  shell(){
    const nav=cls=>TAB_LIST.map(t=>'<button class="'+cls+(t.big?' big':'')+'" data-tab="'+t.id+'" aria-label="'+t.label+'">'+icon(t.icon)+'<span>'+t.label+'</span><b class="badge" data-badge="'+t.id+'" hidden></b></button>').join('');
    $('#app').innerHTML='<div class="shell">'+
      '<nav class="rail"><div class="rail-logo" title="Lisanga">'+LOGO_SMALL+'</div>'+nav('rnav')+'<div class="grow"></div><button class="rnav" data-tab="moi" aria-label="Moi">'+avatar(this.me,30)+'<span>Moi</span><b class="badge" data-badge="moi" hidden></b></button></nav>'+
      '<main id="view"></main>'+
      '<nav class="tabbar">'+nav('tnav')+'</nav></div>';
    $('#app').onclick=e=>{const b=e.target.closest('[data-tab]');if(b&&b.closest('nav'))this.go(b.dataset.tab)};
    this.offs.push(this.on('me',()=>{const r=$('.rail [data-tab=moi] .av');if(r)r.outerHTML=avatar(this.me,30)}));
    this.offs.push(Social.on(()=>this.badge('moi',Social.requests().length)));
  },
  badge(tab,n){$$('[data-badge="'+tab+'"]').forEach(b=>{b.hidden=!n;b.textContent=n>99?'99+':n})},

  go(tab,arg){
    if(!Tabs[tab])tab='chat';
    if(this.tab&&Tabs[this.tab].unmount)Tabs[this.tab].unmount();
    this.tab=tab;this.arg=arg;
    $$('[data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
    document.body.dataset.tab=tab;
    const v=$('#view');v.innerHTML='';v.className='view v-'+tab;
    Tabs[tab].mount(v,arg);
    const h='#'+tab+(arg?'/'+arg:'');if(location.hash!==h)history.replaceState(null,'',h);
  },

  /* Notification système quand l'onglet est caché */
  notify(title,body,tag){
    if(!document.hidden||this.prefs().notif===false)return;
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    try{const n=new Notification(title,{body,tag:tag||'lisanga',icon:'img/icon.svg',silent:false});n.onclick=()=>{window.focus();n.close()}}catch(e){}
  }
};

/* ---------- Verrouillage par code (sur cet appareil) ---------- */
const Lock={
  key(){return 'lsg:lock:'+App.uid},
  cfg(){return jget(this.key(),null)},
  enabled(){return !!this.cfg()},
  async set(pin,delay){const h=await E2E.hash(pin);jset(this.key(),{...h,delay:delay||60,len:pin.length})},
  off(){lsDel(this.key())},
  hiddenAt:0,
  show(){
    if($('.lock-screen'))return;
    const el=document.createElement('div');el.className='lock-screen';const cfg=this.cfg();
    el.innerHTML='<div class="lock-box">'+LOGO_SMALL+'<h2>Lisanga est verrouillé</h2><p class="muted">Saisissez votre code</p><div class="pin-dots">'+'<i></i>'.repeat(cfg.len||4)+'</div><p class="err" data-err></p><div class="pin-pad">'+[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k=>k===''?'<span></span>':'<button data-k="'+k+'">'+k+'</button>').join('')+'</div><button class="link" data-out>Se déconnecter</button></div>';
    document.body.appendChild(el);
    let pin='';let fails=+(ssGet('lsg:lockfails')||0);
    const dots=()=>$$('.pin-dots i',el).forEach((d,i)=>d.classList.toggle('on',i<pin.length));
    const tryPin=async()=>{
      const h=await E2E.hash(pin,cfg.salt);
      if(h.hash===cfg.hash){ssDel('lsg:lockfails');el.remove();return}
      fails++;ssSet('lsg:lockfails',fails);pin='';dots();
      el.querySelector('.pin-dots').classList.add('shake');setTimeout(()=>el.querySelector('.pin-dots').classList.remove('shake'),400);
      el.querySelector('[data-err]').textContent='Code incorrect'+(fails>=7?' — encore '+(10-fails)+' essai(s) avant déconnexion.':'.');
      if(fails>=10){ssDel('lsg:lockfails');el.remove();App.leave()}
    };
    el.onclick=e=>{
      if(e.target.closest('[data-out]')){el.remove();App.leave();return}
      const b=e.target.closest('[data-k]');if(!b)return;
      if(b.dataset.k==='⌫')pin=pin.slice(0,-1);else if(pin.length<6)pin+=b.dataset.k;
      dots();
      if(pin.length===(cfg.len||4))tryPin();
    };
    el.addEventListener('keydown',e=>{if(/^\d$/.test(e.key)&&pin.length<6){pin+=e.key;dots();if(pin.length===(cfg.len||4))tryPin()}if(e.key==='Backspace'){pin=pin.slice(0,-1);dots()}});
    el.tabIndex=-1;el.focus();
  }
};
document.addEventListener('visibilitychange',()=>{
  if(!App.uid)return;
  const veil=App.prefs().veil!==false;
  if(document.hidden){Lock.hiddenAt=Date.now();if(veil&&Lock.enabled())document.body.classList.add('veil')}
  else{
    document.body.classList.remove('veil');
    const c=Lock.cfg();if(c&&Lock.hiddenAt&&Date.now()-Lock.hiddenAt>c.delay*1000)Lock.show();
  }
});

window.addEventListener('hashchange',()=>{
  if(!App.uid)return;
  const h=location.hash.slice(1).split('/');
  if(h[0]&&h[0]!==App.tab&&Tabs[h[0]])App.go(h[0],h[1]);
});
