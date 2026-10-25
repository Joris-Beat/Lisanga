/* Lisanga — Comptes, connexion et annuaire des utilisateurs */
'use strict';

/* Annuaire : tous les profils, tenus à jour en direct */
const Users=(()=>{
  const map=new Map();const subs=new Set();let unwatch=null;
  return {
    map,
    start(){if(unwatch)return;unwatch=DB.watch('users',{orderBy:['createdAt','desc'],limit:2000},list=>{map.clear();list.forEach(u=>map.set(u.id,{...u,uid:u.id}));subs.forEach(f=>f())})},
    stop(){if(unwatch)unwatch();unwatch=null;map.clear()},
    async get(uid){if(map.has(uid))return map.get(uid);const u=await DB.get('users',uid);if(u){u.uid=u.id;map.set(uid,u)}return u},
    peek(uid){return map.get(uid)||{uid,name:'Utilisateur',username:'inconnu'}},
    list(){return [...map.values()]},
    on(f){subs.add(f);return ()=>subs.delete(f)},
    online(u){return u&&u.lastSeen&&Date.now()-u.lastSeen<75000},
    /* Texte « en ligne / vu à » en respectant la confidentialité de la personne */
    seenText(u){
      if(!u)return '';
      const p=(u.privacy||{}).lastSeen||'all';
      if(p==='none'||!u.lastSeen)return '';
      if(p==='contacts'&&!Social.isContactOf(u.uid))return '';
      if(this.online(u))return 'en ligne';
      const d=new Date(u.lastSeen);
      return 'vu '+(sameDay(d,new Date())?"aujourd'hui":fmtDay(u.lastSeen).toLowerCase())+' à '+fmtTime(u.lastSeen);
    }
  };
})();

const Auth=(()=>{
  const remote=DB.remote;
  const USER_RE=/^[a-z0-9._]{3,20}$/;
  const deviceId=lsGet('lsg:device')||(lsSet('lsg:device',newId()),lsGet('lsg:device'));

  function deviceName(){
    const ua=navigator.userAgent;
    const os=/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Appareil';
    const br=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Navigateur';
    return br+' sur '+os;
  }
  function checkPassword(p){
    if(!p||p.length<8)return 'Le mot de passe doit contenir au moins 8 caractères.';
    if(!/[A-Za-z]/.test(p)||!/\d/.test(p))return 'Utilisez des lettres et au moins un chiffre.';
    return '';
  }
  function frErr(e){
    const c=(e&&e.code)||'';
    if(c.includes('email-already'))return 'Cette adresse e-mail est déjà utilisée.';
    if(c.includes('invalid-email'))return 'Adresse e-mail invalide.';
    if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('user-not-found'))return 'E-mail ou mot de passe incorrect.';
    if(c.includes('too-many'))return 'Trop de tentatives. Réessayez dans quelques minutes.';
    if(c.includes('network'))return 'Pas de connexion Internet.';
    return (e&&e.message)||'Erreur inconnue.';
  }
  /* Protection contre les essais répétés (mode local) */
  function throttle(email){
    const t=jget('lsg:fails:'+norm(email),{n:0,until:0});
    if(t.until>Date.now())throw new Error('Trop de tentatives. Réessayez dans '+Math.ceil((t.until-Date.now())/1000)+' s.');
    return t;
  }
  function fail(email,t){t.n++;if(t.n>=5){t.until=Date.now()+60000*Math.min(10,t.n-4);}jset('lsg:fails:'+norm(email),t)}

  async function recordSession(uid){
    const known=await DB.get('users/'+uid+'/sessions',deviceId).catch(()=>null);
    const d={device:deviceName(),at:Date.now()};if(!known)d.first=Date.now();
    await DB.set('users/'+uid+'/sessions',deviceId,d,true).catch(()=>{});
  }

  return {
    USER_RE,checkPassword,deviceId,deviceName,
    async usernameFree(username,exceptUid){const l=await DB.query('users',{where:[['username','==',username]]});return !l.some(u=>u.id!==exceptUid)},
    async signup({name,username,email,password}){
      name=String(name||'').trim();username=String(username||'').trim().toLowerCase().replace(/^@/,'');email=String(email||'').trim().toLowerCase();
      if(name.length<2)throw new Error('Indiquez votre nom.');
      if(!USER_RE.test(username))throw new Error("Nom d'utilisateur : 3 à 20 caractères (lettres minuscules, chiffres, point, tiret bas).");
      if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Adresse e-mail invalide.');
      const pe=checkPassword(password);if(pe)throw new Error(pe);
      let uid;
      if(remote){
        try{uid=(await firebase.auth().createUserWithEmailAndPassword(email,password)).user.uid}catch(e){throw new Error(frErr(e))}
        if(!(await this.usernameFree(username))){username=username+Math.floor(Math.random()*900+100)}
      }else{
        if(!(await this.usernameFree(username)))throw new Error("Ce nom d'utilisateur est déjà pris.");
        if(await DB.get('accounts',norm(email)))throw new Error('Cette adresse e-mail est déjà utilisée.');
        uid=newId();
        const h=await E2E.hash(password);
        await DB.set('accounts',norm(email),{uid,...h});
      }
      const k=await E2E.create(uid,password);
      await DB.set('keys',uid,{backup:k.backup,at:Date.now()});
      await DB.set('users',uid,{
        name,username,bio:'',avatar:'',publicKey:k.publicKey,createdAt:Date.now(),lastSeen:Date.now(),
        privacy:{lastSeen:'all',readReceipts:true,private:false,messages:'all',ephemeral:0}
      });
      if(remote){try{await firebase.auth().currentUser.sendEmailVerification()}catch(e){}}
      else ssSet('lsg:session',uid);
      await recordSession(uid);
      return uid;
    },
    async login(email,password){
      email=String(email||'').trim().toLowerCase();
      let uid;
      if(remote){
        try{uid=(await firebase.auth().signInWithEmailAndPassword(email,password)).user.uid}catch(e){throw new Error(frErr(e))}
      }else{
        const t=throttle(email);
        const acc=await DB.get('accounts',norm(email));
        if(!acc){fail(email,t);throw new Error('E-mail ou mot de passe incorrect.')}
        const h=await E2E.hash(password,acc.salt);
        if(h.hash!==acc.hash){fail(email,t);throw new Error('E-mail ou mot de passe incorrect.')}
        lsDel('lsg:fails:'+norm(email));
        uid=acc.uid;ssSet('lsg:session',uid);
      }
      await this.unlockKeys(uid,password);
      await recordSession(uid);
      return uid;
    },
    /* Déverrouille la clé privée (nouvel appareil) ; si la sauvegarde est illisible, propose de nouvelles clés */
    async unlockKeys(uid,password,forceNew){
      if(!forceNew&&await E2E.load(uid))return true;
      const k=await DB.get('keys',uid);
      if(k&&k.backup&&!forceNew){
        try{await E2E.restore(uid,k.backup,password);return true}
        catch(e){throw Object.assign(new Error('Impossible de déchiffrer vos clés avec ce mot de passe.'),{code:'keys'})}
      }
      const n=await E2E.create(uid,password);
      await DB.set('keys',uid,{backup:n.backup,at:Date.now()});
      await DB.update('users',uid,{publicKey:n.publicKey});
      return true;
    },
    async logout(){
      try{if(App.uid)await DB.update('users',App.uid,{lastSeen:Date.now()-120000})}catch(e){}
      E2E.forget();
      if(remote)await firebase.auth().signOut();else ssDel('lsg:session');
    },
    async changePassword(oldP,newP){
      const pe=checkPassword(newP);if(pe)throw new Error(pe);
      const uid=App.uid;const k=await DB.get('keys',uid);
      let nb;try{nb=await E2E.rewrap(k.backup,oldP,newP)}catch(e){throw new Error('Mot de passe actuel incorrect.')}
      if(remote){
        const u=firebase.auth().currentUser;
        try{await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,oldP));await u.updatePassword(newP)}catch(e){throw new Error(frErr(e))}
      }else{
        const acc=(await DB.query('accounts',{where:[['uid','==',uid]]}))[0];
        const h=await E2E.hash(oldP,acc.salt);if(h.hash!==acc.hash)throw new Error('Mot de passe actuel incorrect.');
        await DB.set('accounts',acc.id,{uid,...(await E2E.hash(newP))});
      }
      await DB.set('keys',uid,{backup:nb,at:Date.now()});
    },
    async resetPassword(email){
      if(!remote)throw new Error('En mode local, il n\'y a pas de récupération par e-mail. Créez un nouveau compte.');
      try{await firebase.auth().sendPasswordResetEmail(String(email).trim())}catch(e){throw new Error(frErr(e))}
    },
    async deleteAccount(password){
      const uid=App.uid;
      if(remote){
        const u=firebase.auth().currentUser;
        try{await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,password))}catch(e){throw new Error(frErr(e))}
      }else{
        const acc=(await DB.query('accounts',{where:[['uid','==',uid]]}))[0];
        const h=await E2E.hash(password,acc.salt);if(h.hash!==acc.hash)throw new Error('Mot de passe incorrect.');
        await DB.del('accounts',acc.id);
      }
      for(const col of ['posts_pub','posts_star','posts_fun','stories']){
        const mine=await DB.query(col,{where:[['uid','==',uid]]});for(const p of mine)await DB.del(col,p.id);
      }
      const f=await DB.query('follows',{where:[['from','==',uid]]});for(const x of f)await DB.del('follows',x.id);
      const g=await DB.query('follows',{where:[['to','==',uid]]});for(const x of g)await DB.del('follows',x.id).catch(()=>{});
      await DB.set('users',uid,{name:'Compte supprimé',username:'supprime_'+uid.slice(0,6),deleted:true,createdAt:0,privacy:{lastSeen:'none'}});
      await DB.del('keys',uid);
      await E2E.wipe(uid);
      if(remote)await firebase.auth().currentUser.delete();else ssDel('lsg:session');
    },
    /* Session existante au démarrage : renvoie uid ou null */
    restore(){
      return new Promise(res=>{
        if(!remote){res(ssGet('lsg:session'));return}
        const off=firebase.auth().onAuthStateChanged(u=>{off();res(u?u.uid:null)});
      });
    },
    get email(){return remote?(firebase.auth().currentUser||{}).email:''},
    get verified(){return remote?!!(firebase.auth().currentUser||{}).emailVerified:true},
    recordSession
  };
})();
