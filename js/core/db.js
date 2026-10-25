/* Lisanga — Base de données.
   Deux moteurs avec la même interface :
   - « local »    : données dans ce navigateur (localStorage), synchronisées en direct entre onglets.
                    Idéal pour essayer : ouvrez deux onglets, connectez deux comptes, discutez et appelez-vous.
   - « firebase » : Cloud Firestore, pour que des personnes sur des appareils différents communiquent.
   Chemins de collection : "users", "chats/ID/messages", etc. Toutes les dates sont des nombres (millisecondes). */
'use strict';

const DB=(()=>{
  const CFG=(window.LISANGA_CONFIG||{}).firebase||{};
  const remote=!!(CFG.apiKey&&CFG.projectId&&window.firebase);

  /* Valeurs spéciales pour les mises à jour partielles */
  const DEL={__op:'del'};
  const union=(...v)=>({__op:'union',v});
  const remove=(...v)=>({__op:'remove',v});
  const inc=n=>({__op:'inc',n});

  const getPath=(o,p)=>p.split('.').reduce((a,k)=>a==null?a:a[k],o);
  function match(doc,w){
    const v=getPath(doc,w[0]),x=w[2];
    switch(w[1]){
      case '==':return v===x;
      case '!=':return v!==x;
      case '>':return v>x;
      case '>=':return v>=x;
      case '<':return v<x;
      case '<=':return v<=x;
      case 'array-contains':return Array.isArray(v)&&v.includes(x);
      case 'in':return x.includes(v);
    }
    return false;
  }
  /* Filtre, tri et limite appliqués côté navigateur (sert aussi au moteur Firebase pour éviter les index composés) */
  function finish(list,q){
    q=q||{};
    (q.where||[]).forEach(w=>{list=list.filter(d=>match(d,w))});
    if(q.orderBy){
      const [f,dir]=q.orderBy;const s=dir==='desc'?-1:1;
      list.sort((a,b)=>((getPath(a,f)||0)>(getPath(b,f)||0)?1:(getPath(a,f)||0)<(getPath(b,f)||0)?-1:0)*s);
    }
    if(q.limit)list=list.slice(0,q.limit);
    return list;
  }

  /* ================= Moteur local ================= */
  const Local=(()=>{
    const P='lsg:db:';
    const ch=('BroadcastChannel' in window)?new BroadcastChannel('lisanga-db'):null;
    const subs=new Map();
    const cache=new Map();
    const read=path=>{if(cache.has(path))return cache.get(path);const v=jget(P+path,{});cache.set(path,v);return v};
    function emit(path){(subs.get(path)||new Set()).forEach(fn=>{try{fn()}catch(e){console.error(e)}})}
    function write(path,obj){
      cache.set(path,obj);
      if(!jset(P+path,obj)){toast('Mémoire du navigateur pleine : supprimez des anciens médias dans Paramètres > Stockage.','bad');}
      emit(path);if(ch)ch.postMessage(path);
    }
    if(ch)ch.onmessage=e=>{cache.delete(e.data);emit(e.data)};
    window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith(P)){const p=e.key.slice(P.length);cache.delete(p);if(!ch)emit(p)}});
    function applyPatch(doc,patch){
      for(const k in patch){
        const v=patch[k],parts=k.split('.');let o=doc;
        for(let i=0;i<parts.length-1;i++){if(typeof o[parts[i]]!=='object'||o[parts[i]]===null)o[parts[i]]={};o=o[parts[i]]}
        const last=parts[parts.length-1];
        if(v&&v.__op==='del')delete o[last];
        else if(v&&v.__op==='union'){const a=Array.isArray(o[last])?o[last]:[];v.v.forEach(x=>{if(!a.includes(x))a.push(x)});o[last]=a}
        else if(v&&v.__op==='remove'){o[last]=(Array.isArray(o[last])?o[last]:[]).filter(x=>!v.v.includes(x))}
        else if(v&&v.__op==='inc'){o[last]=(+o[last]||0)+v.n}
        else o[last]=v;
      }
      return doc;
    }
    return {
      async get(path,id){const d=read(path)[id];return d?{...d,id}:null},
      async set(path,id,data,merge){const all={...read(path)};all[id]=merge?applyPatch({...(all[id]||{})},data):applyPatch({},data);write(path,all);return id},
      async update(path,id,patch){const all={...read(path)};if(!all[id])throw new Error('Document introuvable');all[id]=applyPatch(JSON.parse(JSON.stringify(all[id])),patch);write(path,all)},
      async del(path,id){const all={...read(path)};delete all[id];write(path,all)},
      async query(path,q){const all=read(path);return finish(Object.keys(all).map(id=>({...all[id],id})),q)},
      watch(path,q,cb){
        const run=()=>this.query(path,q).then(cb);
        if(!subs.has(path))subs.set(path,new Set());
        subs.get(path).add(run);run();
        return ()=>subs.get(path).delete(run);
      },
      watchDoc(path,id,cb){
        const run=()=>this.get(path,id).then(cb);
        if(!subs.has(path))subs.set(path,new Set());
        subs.get(path).add(run);run();
        return ()=>subs.get(path).delete(run);
      },
      async delCollection(path){lsDel(P+path);cache.delete(path);emit(path);if(ch)ch.postMessage(path)},
      paths(prefix){const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(P+prefix))out.push(k.slice(P.length))}return out}
    };
  })();

  /* ================= Moteur Firebase ================= */
  const Remote=remote?(()=>{
    if(!firebase.apps.length)firebase.initializeApp(CFG);
    const fs=firebase.firestore();
    try{fs.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){}
    const FV=firebase.firestore.FieldValue;
    function conv(data){
      const out={};
      for(const k in data){
        const v=data[k];
        if(v&&v.__op==='del')out[k]=FV.delete();
        else if(v&&v.__op==='union')out[k]=FV.arrayUnion(...v.v);
        else if(v&&v.__op==='remove')out[k]=FV.arrayRemove(...v.v);
        else if(v&&v.__op==='inc')out[k]=FV.increment(v.n);
        else out[k]=v;
      }
      return out;
    }
    /* Pour un set complet, les clés « a.b » doivent devenir des objets imbriqués */
    function nest(data){
      const out={};
      for(const k in data){
        const parts=k.split('.');let o=out;
        for(let i=0;i<parts.length-1;i++){o[parts[i]]=o[parts[i]]||{};o=o[parts[i]]}
        o[parts[parts.length-1]]=data[k];
      }
      return out;
    }
    /* Une seule clause côté serveur : pas besoin d'index composé. Le reste est fait dans le navigateur. */
    function build(path,q){
      q=q||{};let r=fs.collection(path);const w=q.where||[];
      if(w.length){r=r.where(w[0][0],w[0][1],w[0][2])}
      else if(q.orderBy){r=r.orderBy(q.orderBy[0],q.orderBy[1]||'asc');if(q.limit)r=r.limit(q.limit)}
      if(w.length&&q.serverLimit)r=r.limit(q.serverLimit);
      return r;
    }
    const docs=snap=>snap.docs.map(d=>({...d.data(),id:d.id}));
    return {
      async get(path,id){const s=await fs.collection(path).doc(id).get();return s.exists?{...s.data(),id:s.id}:null},
      async set(path,id,data,merge){
        if(merge){const hasDot=Object.keys(data).some(k=>k.includes('.'));
          if(hasDot){try{await fs.collection(path).doc(id).update(conv(data));return id}catch(e){}}
          await fs.collection(path).doc(id).set(nest(conv(data)),{merge:true});}
        else await fs.collection(path).doc(id).set(nest(conv(data)));
        return id;
      },
      async update(path,id,patch){await fs.collection(path).doc(id).update(conv(patch))},
      async del(path,id){await fs.collection(path).doc(id).delete()},
      async query(path,q){return finish(docs(await build(path,q).get()),q)},
      watch(path,q,cb){return build(path,q).onSnapshot(s=>cb(finish(docs(s),q)),e=>console.warn('watch',path,e.message))},
      watchDoc(path,id,cb){return fs.collection(path).doc(id).onSnapshot(s=>cb(s.exists?{...s.data(),id:s.id}:null),e=>console.warn('watchDoc',path,e.message))},
      async delCollection(path){const s=await fs.collection(path).limit(400).get();const b=fs.batch();s.docs.forEach(d=>b.delete(d.ref));await b.commit()},
      paths(){return []}
    };
  })():null;

  const E=Remote||Local;
  return {
    remote,DEL,union,remove,inc,
    id:newId,
    get:(p,id)=>E.get(p,id),
    set:(p,id,d,merge)=>E.set(p,id,d,merge),
    add:(p,d)=>{const id=newId();return E.set(p,id,d).then(()=>id)},
    update:(p,id,d)=>E.update(p,id,d),
    del:(p,id)=>E.del(p,id),
    query:(p,q)=>E.query(p,q),
    watch:(p,q,cb)=>E.watch(p,q,cb),
    watchDoc:(p,id,cb)=>E.watchDoc(p,id,cb),
    delCollection:p=>E.delCollection(p),
    localPaths:pre=>Local.paths(pre)
  };
})();
