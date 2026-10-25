/* Lisanga — Chiffrement de bout en bout (WebCrypto, intégré au navigateur).
   - Chaque compte possède une paire de clés ECDH P-256. La clé publique est publiée dans le profil.
   - La clé privée ne quitte jamais l'appareil en clair : une copie de secours est chiffrée avec une clé
     dérivée du mot de passe (PBKDF2, 310 000 tours) pour pouvoir se reconnecter sur un autre appareil.
   - Discussion à deux : clé AES-GCM 256 bits dérivée par ECDH entre les deux comptes.
   - Groupe : une clé AES aléatoire, « emballée » pour chaque membre avec la clé ECDH (créateur → membre).
   Le serveur ne voit que des données chiffrées : textes, vocaux, photos, vidéos et fichiers des discussions. */
'use strict';

const IDB={
  db:null,
  open(){
    if(this.db)return Promise.resolve(this.db);
    return new Promise((res,rej)=>{
      const r=indexedDB.open('lisanga',2);
      r.onupgradeneeded=()=>{const d=r.result;['keys','media','kv'].forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s)})};
      r.onsuccess=()=>{this.db=r.result;res(this.db)};r.onerror=()=>rej(r.error);
    });
  },
  async get(store,k){const d=await this.open();return new Promise((res,rej)=>{const r=d.transaction(store).objectStore(store).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
  async put(store,k,v){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})},
  async del(store,k){const d=await this.open();return new Promise(res=>{const t=d.transaction(store,'readwrite');t.objectStore(store).delete(k);t.oncomplete=()=>res();t.onerror=()=>res()})},
  async clear(store){const d=await this.open();return new Promise(res=>{const t=d.transaction(store,'readwrite');t.objectStore(store).clear();t.oncomplete=()=>res()})},
  async keys(store){const d=await this.open();return new Promise(res=>{const r=d.transaction(store).objectStore(store).getAllKeys();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>res([])})}
};

const E2E=(()=>{
  const S=crypto.subtle,te=new TextEncoder(),td=new TextDecoder();
  const EC={name:'ECDH',namedCurve:'P-256'};
  let priv=null,myUid=null;
  const chatKeys=new Map();

  async function passKey(password,salt){
    const base=await S.importKey('raw',te.encode(password),'PBKDF2',false,['deriveKey']);
    return S.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function aesEnc(key,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await S.encrypt({name:'AES-GCM',iv},key,bytes);return {iv:b64(iv),ct:b64(ct)}}
  async function aesDec(key,o){return new Uint8Array(await S.decrypt({name:'AES-GCM',iv:unb64(o.iv)},key,unb64(o.ct)))}
  const pubOf=u=>u&&u.publicKey?S.importKey('jwk',u.publicKey,EC,true,[]):Promise.reject(new Error('Clé publique absente'));

  return {
    get ready(){return !!priv},
    /* Création des clés à l'inscription : renvoie la clé publique et la sauvegarde chiffrée */
    async create(uid,password){
      const kp=await S.generateKey(EC,true,['deriveKey','deriveBits']);
      const pub=await S.exportKey('jwk',kp.publicKey);
      const jwk=await S.exportKey('jwk',kp.privateKey);
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const backup=await aesEnc(await passKey(password,salt),te.encode(JSON.stringify(jwk)));
      backup.salt=b64(salt);
      await this.install(uid,jwk);
      return {publicKey:{kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y},backup};
    },
    /* Restaure la clé privée à partir de la sauvegarde chiffrée et du mot de passe */
    async restore(uid,backup,password){
      const raw=await aesDec(await passKey(password,unb64(backup.salt)),backup);
      await this.install(uid,JSON.parse(td.decode(raw)));
    },
    /* Ré-emballe la sauvegarde avec un nouveau mot de passe (changement de mot de passe) */
    async rewrap(backup,oldPass,newPass){
      const raw=await aesDec(await passKey(oldPass,unb64(backup.salt)),backup);
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const nb=await aesEnc(await passKey(newPass,salt),raw);nb.salt=b64(salt);return nb;
    },
    async install(uid,jwk){
      const k=await S.importKey('jwk',jwk,EC,false,['deriveKey','deriveBits']);
      await IDB.put('keys',uid,k);priv=k;myUid=uid;chatKeys.clear();
    },
    async load(uid){const k=await IDB.get('keys',uid).catch(()=>null);if(k){priv=k;myUid=uid;chatKeys.clear()}return !!k},
    forget(){priv=null;myUid=null;chatKeys.clear()},
    async wipe(uid){await IDB.del('keys',uid);this.forget()},

    /* Clé d'une discussion (mise en cache) */
    async chatKey(chat){
      if(!priv)throw new Error('Clés non déverrouillées');
      const ver=chat.type==='group'?JSON.stringify((chat.keys||{})[myUid]||null):chat.id+(chat.kv||'');
      const c=chatKeys.get(chat.id);if(c&&c.ver===ver)return c.key;
      let key;
      if(chat.type==='group'){
        const w=(chat.keys||{})[myUid];if(!w)throw new Error('Pas de clé pour ce groupe');
        const by=await Users.get(w.by);
        const kek=await S.deriveKey({name:'ECDH',public:await pubOf(by)},priv,{name:'AES-GCM',length:256},false,['decrypt']);
        const raw=await aesDec(kek,w);
        key=await S.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
      }else{
        const other=chat.members.find(m=>m!==myUid)||myUid;
        const u=await Users.get(other);
        key=await S.deriveKey({name:'ECDH',public:await pubOf(u)},priv,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      }
      chatKeys.set(chat.id,{ver,key});
      return key;
    },
    /* Clé de groupe : génère et emballe pour chaque membre */
    async groupKeys(memberUids,existingRaw){
      const raw=existingRaw||crypto.getRandomValues(new Uint8Array(32));
      const out={};
      for(const m of memberUids){
        const u=await Users.get(m);
        const kek=await S.deriveKey({name:'ECDH',public:await pubOf(u)},priv,{name:'AES-GCM',length:256},false,['encrypt']);
        out[m]={...(await aesEnc(kek,raw)),by:myUid};
      }
      return {keys:out,raw};
    },
    async groupRaw(chat){
      const w=(chat.keys||{})[myUid];const by=await Users.get(w.by);
      const kek=await S.deriveKey({name:'ECDH',public:await pubOf(by)},priv,{name:'AES-GCM',length:256},false,['decrypt']);
      return aesDec(kek,w);
    },
    async encrypt(chat,obj){return aesEnc(await this.chatKey(chat),te.encode(JSON.stringify(obj)))},
    async decrypt(chat,o){return JSON.parse(td.decode(await aesDec(await this.chatKey(chat),o)))},
    async encryptBytes(chat,buf){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await S.encrypt({name:'AES-GCM',iv},await this.chatKey(chat),buf);const out=new Uint8Array(12+ct.byteLength);out.set(iv);out.set(new Uint8Array(ct),12);return out},
    async decryptBytes(chat,buf){const a=new Uint8Array(buf);return S.decrypt({name:'AES-GCM',iv:a.slice(0,12)},await this.chatKey(chat),a.slice(12))},
    /* Numéro de sécurité : à comparer de vive voix pour vérifier qu'il n'y a pas d'intermédiaire */
    async safetyNumber(a,b){
      const parts=[a,b].filter(Boolean).map(u=>u.uid+':'+(u.publicKey?u.publicKey.x+u.publicKey.y:'')).sort();
      const h=new Uint8Array(await S.digest('SHA-256',te.encode(parts.join('|'))));
      let digits='';for(let i=0;i<30;i++)digits+=pad(h[i]%100);
      return digits.match(/.{5}/g).join(' ');
    },
    async fingerprint(u){
      const h=new Uint8Array(await S.digest('SHA-256',te.encode(u.publicKey?u.publicKey.x+u.publicKey.y:'')));
      return [...h.slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{4}/g).join(' ');
    },
    /* Hachage de mot de passe pour le mode local et du code de verrouillage */
    async hash(secret,saltB64){
      const salt=saltB64?unb64(saltB64):crypto.getRandomValues(new Uint8Array(16));
      const base=await S.importKey('raw',te.encode(secret),'PBKDF2',false,['deriveBits']);
      const bits=await S.deriveBits({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},base,256);
      return {salt:b64(salt),hash:b64(bits)};
    }
  };
})();
