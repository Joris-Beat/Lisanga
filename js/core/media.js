/* Lisanga — Stockage des médias (photos, vidéos, vocaux, fichiers).
   Mode local : IndexedDB du navigateur.
   Mode Firebase : découpage en morceaux de 700 Ko dans Firestore (fonctionne avec le plan gratuit, sans carte bancaire).
   Les médias des discussions sont chiffrés AVANT l'envoi ; ceux de Star, Fun et Publique sont publics. */
'use strict';

const Media=(()=>{
  const CHUNK=700*1024;
  const urls=new Map();
  const pending=new Map();
  const LIMIT=(window.LISANGA_CONFIG||{}).maxUploadMB||25;

  async function put(blob,chat){
    if(blob.size>LIMIT*1048576)throw new Error('Fichier trop lourd (maximum '+LIMIT+' Mo).');
    const id=newId();
    let buf=await blob.arrayBuffer();
    const enc=!!chat;
    if(enc)buf=(await E2E.encryptBytes(chat,buf)).buffer;
    const rec={mime:blob.type||'application/octet-stream',data:buf,enc,size:blob.size};
    await IDB.put('media',id,rec);
    if(DB.remote){
      const bytes=new Uint8Array(buf),n=Math.max(1,Math.ceil(bytes.length/CHUNK));
      for(let i=0;i<n;i++)await DB.set('media/'+id+'/c',pad(i).padStart(4,'0'),{d:b64(bytes.subarray(i*CHUNK,(i+1)*CHUNK))});
      await DB.set('media',id,{owner:App.uid,mime:rec.mime,size:blob.size,n,enc,at:Date.now()});
    }
    return id;
  }
  async function fetchRec(id){
    let rec=await IDB.get('media',id).catch(()=>null);
    if(rec)return rec;
    if(!DB.remote)return null;
    const meta=await DB.get('media',id);if(!meta)return null;
    const parts=await DB.query('media/'+id+'/c',{});
    parts.sort((a,b)=>a.id<b.id?-1:1);
    const arrs=parts.map(p=>unb64(p.d));const total=arrs.reduce((s,a)=>s+a.length,0);
    const out=new Uint8Array(total);let o=0;arrs.forEach(a=>{out.set(a,o);o+=a.length});
    rec={mime:meta.mime,data:out.buffer,enc:meta.enc,size:meta.size};
    IDB.put('media',id,rec).catch(()=>{});
    return rec;
  }
  /* Renvoie une adresse blob: utilisable dans <img>, <video>, <audio> */
  async function url(id,chat){
    if(!id)return '';
    if(urls.has(id))return urls.get(id);
    if(pending.has(id))return pending.get(id);
    const p=(async()=>{
      const rec=await fetchRec(id);if(!rec)return '';
      let data=rec.data;
      if(rec.enc){if(!chat)return '';data=await E2E.decryptBytes(chat,data)}
      const u=URL.createObjectURL(new Blob([data],{type:rec.mime}));
      urls.set(id,u);return u;
    })().catch(e=>{console.warn('media',e);return ''}).finally(()=>pending.delete(id));
    pending.set(id,p);return p;
  }
  async function blob(id,chat){const u=await url(id,chat);if(!u)return null;return (await fetch(u)).blob()}
  async function remove(id){
    await IDB.del('media',id);
    if(DB.remote){try{const parts=await DB.query('media/'+id+'/c',{});for(const p of parts)await DB.del('media/'+id+'/c',p.id);await DB.del('media',id)}catch(e){}}
  }
  /* Remplit automatiquement les éléments [data-media] visibles */
  function hydrate(root,chatResolver){
    $$('[data-media]:not([data-ready])',root).forEach(async el=>{
      el.dataset.ready='1';
      const chat=el.dataset.chat&&chatResolver?chatResolver(el.dataset.chat):null;
      const u=await url(el.dataset.media,chat);
      if(!u){el.classList.add('media-missing');return}
      if(el.tagName==='A'){el.href=u}else el.src=u;
      el.classList.add('media-on');
    });
  }
  async function usage(){const ks=await IDB.keys('media');let size=0;for(const k of ks){const r=await IDB.get('media',k);size+=r&&r.data?r.data.byteLength:0}return {count:ks.length,size}}
  async function clearCache(){urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();if(DB.remote)await IDB.clear('media')}
  return {put,url,blob,remove,hydrate,usage,clearCache};
})();
