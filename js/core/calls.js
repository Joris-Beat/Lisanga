/* Lisanga — Appels audio et vidéo (WebRTC, de pair à pair, chiffrés DTLS-SRTP par le navigateur).
   La base de données sert seulement de « signalisation » : offre, réponse et candidats réseau. */
'use strict';

const Calls=(()=>{
  const CFG=window.LISANGA_CONFIG||{};
  const ICE=CFG.iceServers&&CFG.iceServers.length?CFG.iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
  let cur=null,offIncoming=null;const handled=new Set();

  const root=()=>$('#call-root');
  function ui(html){root().innerHTML=html;root().hidden=false;document.body.classList.add('in-call')}
  function closeUI(){root().innerHTML='';root().hidden=true;document.body.classList.remove('in-call')}

  async function media(type,facing){
    return navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:type==='video'?{facingMode:facing||'user',width:{ideal:1280},height:{ideal:720}}:false
    });
  }
  function mediaError(e){
    const n=e&&e.name;
    toast(n==='NotAllowedError'?'Autorisez le micro et la caméra pour appeler.':n==='NotFoundError'?'Aucun micro ou caméra détecté.':'Impossible d\'accéder au micro ou à la caméra.','bad');
  }

  function makePC(c){
    const pc=new RTCPeerConnection({iceServers:ICE});
    c.pc=pc;c.queue=[];c.seen=new Set();
    c.local.getTracks().forEach(t=>pc.addTrack(t,c.local));
    pc.onicecandidate=e=>{if(e.candidate)DB.add('calls/'+c.id+'/ice',{from:App.uid,c:e.candidate.toJSON(),at:Date.now()}).catch(()=>{})};
    pc.ontrack=e=>{c.remote=e.streams[0];attach()};
    pc.onconnectionstatechange=()=>{
      const s=pc.connectionState;
      if(s==='connected'){if(!c.startedAt){c.startedAt=Date.now();Sound.ring(false);tick()}setStatus('')}
      if(s==='disconnected')setStatus('Reconnexion…');
      if(s==='failed')end('Connexion perdue.');
    };
    return pc;
  }
  /* Candidats réseau de l'autre personne (à lancer une fois la fiche d'appel créée) */
  function watchIce(c){
    c.offs.push(DB.watch('calls/'+c.id+'/ice',{},list=>{
      list.forEach(x=>{
        if(x.from===App.uid||c.seen.has(x.id))return;c.seen.add(x.id);
        if(c.pc.remoteDescription)c.pc.addIceCandidate(x.c).catch(()=>{});else c.queue.push(x.c);
      });
    }));
  }
  function flush(c){c.queue.forEach(x=>c.pc.addIceCandidate(x).catch(()=>{}));c.queue=[]}

  function attach(){
    if(!cur)return;
    const rv=$('#call-remote'),lv=$('#call-local'),ra=$('#call-audio');
    if(lv&&lv.srcObject!==cur.local)lv.srcObject=cur.local;
    if(cur.remote){
      if(rv&&rv.srcObject!==cur.remote)rv.srcObject=cur.remote;
      if(ra&&ra.srcObject!==cur.remote)ra.srcObject=cur.remote;
    }
  }
  function setStatus(t){const s=$('#call-status');if(s&&!cur.startedAt)s.textContent=t||'';else if(s&&t)s.textContent=t}
  function tick(){
    clearInterval(cur.timer);
    cur.timer=setInterval(()=>{const s=$('#call-status');if(s&&cur&&cur.startedAt)s.textContent=fmtDur((Date.now()-cur.startedAt)/1000)},1000);
  }

  function callScreen(peer,type,status){
    const v=type==='video';
    ui('<div class="call '+(v?'is-video':'is-audio')+'">'+
      (v?'<video id="call-remote" autoplay playsinline></video><video id="call-local" autoplay playsinline muted></video>':'<audio id="call-audio" autoplay></audio>')+
      '<div class="call-top"><div class="call-e2e">'+icon('lock')+' Chiffré de bout en bout</div></div>'+
      '<div class="call-id">'+avatar(peer,v?56:120,'pulse')+'<h2>'+esc(peer.name)+'</h2><div id="call-status">'+esc(status)+'</div></div>'+
      '<div class="call-ctl">'+
        '<button class="cbtn" data-c="mute" aria-label="Micro">'+icon('mic')+'</button>'+
        (v?'<button class="cbtn" data-c="cam" aria-label="Caméra">'+icon('video')+'</button><button class="cbtn" data-c="flip" aria-label="Changer de caméra">'+icon('flip')+'</button>':'')+
        (navigator.mediaDevices&&navigator.mediaDevices.getDisplayMedia&&v?'<button class="cbtn" data-c="screen" aria-label="Partager l\'écran">'+icon('screen')+'</button>':'')+
        '<button class="cbtn end" data-c="end" aria-label="Raccrocher">'+icon('hangup')+'</button>'+
      '</div></div>');
    root().onclick=onCtl;
    attach();
  }
  async function onCtl(e){
    const b=e.target.closest('[data-c]');
    if(!b){if(e.target.id==='call-local'){root().querySelector('.call').classList.toggle('swap')}return}
    if(!cur)return;
    const a=b.dataset.c;
    if(a==='end')return end();
    if(a==='mute'){const t=cur.local.getAudioTracks()[0];if(t){t.enabled=!t.enabled;b.classList.toggle('off',!t.enabled);b.innerHTML=icon(t.enabled?'mic':'micoff')}}
    if(a==='cam'){const t=cur.local.getVideoTracks()[0];if(t){t.enabled=!t.enabled;b.classList.toggle('off',!t.enabled);b.innerHTML=icon(t.enabled?'video':'videooff')}}
    if(a==='flip'){
      try{
        cur.facing=cur.facing==='environment'?'user':'environment';
        const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:cur.facing}});
        swapVideo(s.getVideoTracks()[0]);
      }catch(err){toast('Une seule caméra disponible.')}
    }
    if(a==='screen'){
      if(cur.screen){stopScreen();return}
      try{
        const s=await navigator.mediaDevices.getDisplayMedia({video:true});
        const t=s.getVideoTracks()[0];cur.screen=t;cur.camTrack=cur.local.getVideoTracks()[0];
        replaceSender(t);t.onended=stopScreen;b.classList.add('on');
        const lv=$('#call-local');if(lv)lv.srcObject=s;
      }catch(err){}
    }
  }
  function replaceSender(track){const s=cur.pc.getSenders().find(x=>x.track&&x.track.kind==='video');if(s)s.replaceTrack(track)}
  function swapVideo(track){
    const old=cur.local.getVideoTracks()[0];
    if(old){cur.local.removeTrack(old);old.stop()}
    cur.local.addTrack(track);replaceSender(track);
    const lv=$('#call-local');if(lv){lv.srcObject=null;lv.srcObject=cur.local}
  }
  function stopScreen(){
    if(!cur||!cur.screen)return;
    cur.screen.stop();cur.screen=null;
    if(cur.camTrack)replaceSender(cur.camTrack);
    const lv=$('#call-local');if(lv)lv.srcObject=cur.local;
    const b=root().querySelector('[data-c=screen]');if(b)b.classList.remove('on');
  }

  /* ---------- Appel sortant ---------- */
  async function call(chat,type){
    if(cur){toast('Un appel est déjà en cours.');return}
    if(chat.type==='group'){toast('Les appels de groupe arrivent dans une prochaine version.');return}
    const peerId=chat.members.find(m=>m!==App.uid);
    if(!peerId){toast('Impossible de s\'appeler soi-même.');return}
    if(Social.isBlocked(peerId)||Social.blockedMe(peerId)){toast('Appel impossible avec cet utilisateur.');return}
    if(!window.RTCPeerConnection||!navigator.mediaDevices){toast('Votre navigateur ne gère pas les appels.','bad');return}
    const peer=await Users.get(peerId);
    let local;try{local=await media(type)}catch(e){mediaError(e);return}
    const id=newId();
    cur={id,role:'caller',peer,type,local,chatId:chat.id,chat,offs:[],facing:'user'};
    callScreen(peer,type,'Appel en cours…');
    Sound.ring(true,true);
    const pc=makePC(cur);
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await DB.set('calls',id,{from:App.uid,to:peerId,chatId:chat.id,type,state:'ringing',offer:{type:offer.type,sdp:offer.sdp},at:Date.now()});
    const c=cur;
    watchIce(c);
    c.offs.push(DB.watchDoc('calls',id,async d=>{
      if(!d||cur!==c)return;
      if(d.state==='ringing'&&!c.rang){c.rang=true;setStatus('Ça sonne…')}
      if(d.answer&&pc.signalingState==='have-local-offer'){await pc.setRemoteDescription(d.answer);flush(c);setStatus('Connexion…')}
      if(d.state==='rejected')end('Appel refusé.',true);
      if(d.state==='busy')end('Occupé : la personne est déjà en appel.',true);
      if(d.state==='ended')end('',true);
    }));
    c.noAnswer=setTimeout(()=>{if(cur===c&&!c.startedAt){DB.update('calls',id,{state:'missed'}).catch(()=>{});end('Pas de réponse.',true,'missed')}},45000);
  }

  /* ---------- Appel entrant ---------- */
  function listen(uid){
    stop();
    offIncoming=DB.watch('calls',{where:[['to','==',uid]]},list=>{
      list.forEach(d=>{
        if(d.state!=='ringing'||handled.has(d.id)||Date.now()-d.at>40000)return;
        handled.add(d.id);incoming(d);
      });
    });
  }
  function stop(){if(offIncoming)offIncoming();offIncoming=null}

  async function incoming(d){
    if(cur){DB.update('calls',d.id,{state:'busy'}).catch(()=>{});return}
    if(Social.isBlocked(d.from)){DB.update('calls',d.id,{state:'rejected'}).catch(()=>{});return}
    const peer=await Users.get(d.from);
    const v=d.type==='video';
    cur={id:d.id,role:'callee',peer,type:d.type,chatId:d.chatId,offs:[],ringing:true,facing:'user',doc:d};
    ui('<div class="call ringing"><div class="call-top"><div class="call-e2e">'+icon('lock')+' Chiffré de bout en bout</div></div><div class="call-id">'+avatar(peer,120,'pulse')+'<h2>'+esc(peer.name)+'</h2><div>'+(v?'Appel vidéo entrant…':'Appel audio entrant…')+'</div></div>'+
      '<div class="call-ctl ring"><div class="ring-b"><button class="cbtn end" data-r="no" aria-label="Refuser">'+icon('hangup')+'</button><small>Refuser</small></div>'+
      (v?'<div class="ring-b"><button class="cbtn" data-r="audio" aria-label="Répondre sans vidéo">'+icon('phone')+'</button><small>Audio seul</small></div>':'')+
      '<div class="ring-b"><button class="cbtn ok" data-r="yes" aria-label="Répondre">'+icon(v?'video':'phone')+'</button><small>Répondre</small></div></div></div>');
    Sound.ring(true);
    App.notify(peer.name,v?'Appel vidéo entrant':'Appel audio entrant','call');
    const c=cur;
    c.offs.push(DB.watchDoc('calls',d.id,x=>{if(cur===c&&c.ringing&&(!x||['ended','missed'].includes(x.state))){end('Appel manqué.');}}));
    root().onclick=async e=>{
      const b=e.target.closest('[data-r]');if(!b||cur!==c)return;
      if(b.dataset.r==='no'){DB.update('calls',d.id,{state:'rejected'}).catch(()=>{});end();return}
      c.ringing=false;Sound.ring(false);
      const type=b.dataset.r==='audio'?'audio':d.type;
      try{c.local=await media(type)}catch(err){mediaError(err);DB.update('calls',d.id,{state:'rejected'}).catch(()=>{});end();return}
      c.type=type;
      callScreen(peer,type,'Connexion…');
      const pc=makePC(c);watchIce(c);
      await pc.setRemoteDescription(d.offer);flush(c);
      const ans=await pc.createAnswer();await pc.setLocalDescription(ans);
      await DB.update('calls',d.id,{answer:{type:ans.type,sdp:ans.sdp},state:'accepted',acceptedAt:Date.now()});
      c.offs.push(DB.watchDoc('calls',d.id,x=>{if(cur===c&&x&&x.state==='ended')end('',true)}));
    };
  }

  /* ---------- Fin d'appel ---------- */
  async function end(msg,remoteEnded,status){
    const c=cur;if(!c)return;cur=null;
    Sound.ring(false);clearInterval(c.timer);clearTimeout(c.noAnswer);
    c.offs.forEach(f=>{try{f()}catch(e){}});
    if(c.local)c.local.getTracks().forEach(t=>t.stop());
    if(c.screen)c.screen.stop();
    if(c.pc)try{c.pc.close()}catch(e){}
    if(!remoteEnded)DB.update('calls',c.id,{state:'ended',endedAt:Date.now()}).catch(()=>{});
    closeUI();
    if(msg)toast(msg);
    if(c.role==='caller'&&c.chat){
      const dur=c.startedAt?Math.round((Date.now()-c.startedAt)/1000):0;
      const st=status||(dur?'done':msg==='Appel refusé.'?'rejected':'missed');
      Chat.send(c.chat,{kind:'call',call:{type:c.type,dur,status:st}}).catch(()=>{});
    }
  }
  window.addEventListener('beforeunload',()=>{if(cur)DB.update('calls',cur.id,{state:'ended'})});

  return {call,listen,stop,end,get active(){return !!cur}};
})();
