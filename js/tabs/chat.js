/* Lisanga — Onglet CHAT (base de l'application, inspiré de WhatsApp) :
   discussions privées et groupes chiffrés, vocaux, photos, vidéos, fichiers, position, réponses,
   réactions, transfert, modification, suppression pour tous, messages éphémères, accusés de lecture,
   « écrit… », appels audio/vidéo, assistant IA dans la zone de saisie. */
'use strict';

const Chat=(()=>{
  let chats=[],off=null;const subs=new Set();const seenLast=new Map();let first=true;
  const previews=new Map();

  function preview(p,kind){
    switch(kind){
      case 'voice':return '🎤 Message vocal';
      case 'image':return '📷 '+(p.t||'Photo');
      case 'video':return '🎬 '+(p.t||'Vidéo');
      case 'file':return '📄 '+(p.name||'Fichier');
      case 'loc':return '📍 Position';
      case 'post':return '🔗 Publication partagée';
      case 'call':return (p.call&&p.call.type==='video'?'🎥 ':'📞 ')+(p.call&&p.call.status==='done'?'Appel':'Appel manqué');
      case 'system':return p.t||'';
      default:return p.t||'';
    }
  }
  const prefsOf=id=>((App.priv.chatPrefs||{})[id])||{};

  const api={
    start(uid){
      this.stop();first=true;
      off=DB.watch('chats',{where:[['members','array-contains',uid]]},list=>{
        chats=list.sort((a,b)=>(b.lastAt||b.createdAt||0)-(a.lastAt||a.createdAt||0));
        let unread=0;
        chats.forEach(c=>{
          const n=(c.unread||{})[uid]||0;const pr=prefsOf(c.id);
          if(!api.hidden(c))unread+=n?1:0;
          const prev=seenLast.get(c.id);
          if(!first&&c.lastAt&&c.lastAt!==prev&&c.last&&c.last.from!==uid&&!(App.tab==='chat'&&Tabs.chat.openId===c.id&&!document.hidden)){
            if(!pr.mute){Sound.message();api.title(c).then(t=>App.notify(t,'Nouveau message','chat-'+c.id))}
          }
          seenLast.set(c.id,c.lastAt);
        });
        first=false;
        App.badge('chat',unread);
        subs.forEach(f=>f(chats));
      });
    },
    stop(){if(off)off();off=null;chats=[];seenLast.clear();previews.clear()},
    on(f){subs.add(f);return ()=>subs.delete(f)},
    list(){return chats},
    get(id){return chats.find(c=>c.id===id)},
    hasDirect(uid){return chats.some(c=>c.type==='direct'&&c.members.includes(uid)&&c.lastAt)},
    hidden(c){const p=prefsOf(c.id);return !!(p.clearedAt&&(c.lastAt||0)<=p.clearedAt)||(c.type==='direct'&&!c.lastAt&&c.createdBy!==App.uid)},
    peer(c){return c.type==='direct'?Users.peek(c.members.find(m=>m!==App.uid)||App.uid):null},
    async title(c){if(c.type==='group')return c.name||'Groupe';const p=api.peer(c);return p.uid===App.uid?p.name+' (vous)':p.name},
    titleSync(c){if(c.type==='group')return c.name||'Groupe';const p=api.peer(c);return p.uid===App.uid?p.name+' (vous)':p.name},
    async lastText(c){
      if(!c.last)return '';
      const k=c.id+':'+c.last.at;if(previews.has(k))return previews.get(k);
      let t='';
      try{t=(await E2E.decrypt(c,c.last.enc)).p}catch(e){t='🔒 Message chiffré'}
      previews.set(k,t);return t;
    },
    /* Ouvre (ou crée) la discussion privée avec quelqu'un */
    async openDirect(uid){
      if(Social.isBlocked(uid)){toast('Débloquez cette personne pour lui écrire.');return}
      const id='d_'+[App.uid,uid].sort().join('_');
      let c=api.get(id)||await DB.get('chats',id).catch(()=>null);
      if(!c){
        await DB.set('chats',id,{type:'direct',members:uid===App.uid?[App.uid]:[App.uid,uid],createdAt:Date.now(),createdBy:App.uid,unread:{},reads:{}});
      }
      if(prefsOf(id).clearedAt)await DB.set('private',App.uid,{['chatPrefs.'+id+'.clearedAt']:DB.DEL},true);
      App.go('chat',id);
    },
    async createGroup(name,members,avatarUrl){
      const all=[App.uid,...members.filter(m=>m!==App.uid)];
      const {keys}=await E2E.groupKeys(all);
      const id='g_'+newId();
      await DB.set('chats',id,{type:'group',name,avatar:avatarUrl||'',members:all,admins:[App.uid],keys,createdAt:Date.now(),createdBy:App.uid,unread:{},reads:{},ephemeral:0});
      const c={id,type:'group',name,members:all,keys};
      await api.send(c,{kind:'system',t:(await Users.get(App.uid)).name+' a créé le groupe « '+name+' »'});
      return id;
    },
    /* Envoi d'un message chiffré */
    async send(chat,p){
      const kind=p.kind||'text';const body={...p};delete body.kind;
      const at=Date.now();const mid=at.toString(36)+Math.random().toString(36).slice(2,7);
      const enc=await E2E.encrypt(chat,body);
      const msg={from:App.uid,at,kind,enc};
      const eph=(chat.ephemeral||0)*1000;if(eph&&kind!=='system')msg.exp=at+eph;
      await DB.set('chats/'+chat.id+'/messages',mid,msg);
      const last={from:App.uid,at,kind,enc:await E2E.encrypt(chat,{p:preview(body,kind)})};
      const patch={last,lastAt:at,['typing.'+App.uid]:0};
      chat.members.forEach(m=>{if(m!==App.uid)patch['unread.'+m]=DB.inc(1)});
      await DB.update('chats',chat.id,patch);
      if(kind!=='system'&&kind!=='call')Sound.sent();
      return mid;
    },
    /* Choisir une discussion (transfert, partage) */
    pickChat(title){
      return new Promise(res=>{
        let done=false;
        const list=chats.filter(c=>!api.hidden(c));
        const m=Modal.open(sheetHead(title||'Choisir une discussion')+'<div class="pad-x"><input class="inp" placeholder="Rechercher…" data-q></div><div class="pick-list">'+
          (list.length?list.map(c=>'<button class="li" data-id="'+c.id+'">'+(c.type==='group'?avatar({name:c.name,avatar:c.avatar,uid:c.id},40):avatar(api.peer(c),40))+'<span class="li-t"><b>'+esc(api.titleSync(c))+'</b></span></button>').join(''):'<p class="empty">Aucune discussion. Commencez-en une depuis l\'onglet Chat.</p>')+'</div>',{sheet:true,onClose:()=>{if(!done)res(null)}});
        m.box.querySelector('[data-q]').oninput=e=>{const q=norm(e.target.value);$$('.pick-list .li',m.box).forEach(b=>b.hidden=!norm(b.textContent).includes(q))};
        m.box.onclick=e=>{const b=e.target.closest('[data-id]');if(b){done=true;m.close();res(api.get(b.dataset.id))}};
      });
    },
    preview
  };
  return api;
})();

/* =================== Interface de l'onglet Chat =================== */
Tabs.chat=(()=>{
  let el,openId=null,offList=null,offMsgs=null,offChatDoc=null,offMe=null,filter='all',query='';
  let msgs=[],chat=null,reply=null,editing=null,rec=null,typingSent=0,searchQ='';
  const dec=new Map();

  function mount(v,arg){
    el=v;openId=null;
    el.innerHTML='<div class="chat-layout"><section class="chat-list-pane"></section><section class="chat-conv-pane"><div class="conv-empty">'+LOGO_SMALL+'<h3>Lisanga Chat</h3><p class="muted">Choisissez une discussion ou commencez-en une nouvelle.<br>'+icon('lock')+' Vos messages personnels sont chiffrés de bout en bout.</p></div></section></div>';
    renderListShell();
    offList=Chat.on(()=>{renderList();if(chat){const c=Chat.get(chat.id);if(c){chat=c;renderHeader();refreshTicks()}}});
    offMe=App.on('priv',()=>renderList());
    renderList();
    if(arg)openChat(arg);
  }
  function unmount(){closeConv();if(offList)offList();if(offMe)offMe();offList=offMe=null;el=null}

  /* ---------- Liste des discussions ---------- */
  function renderListShell(){
    const p=$('.chat-list-pane',el);
    p.innerHTML='<header class="pane-h"><h1 class="brand-t">Chat</h1><div class="row gap-s"><button class="ibtn" data-a="group" aria-label="Nouveau groupe">'+icon('users')+'</button><button class="ibtn" data-a="calls" aria-label="Appels">'+icon('phone')+'</button></div></header>'+
      '<div class="pad-x"><label class="search">'+icon('search')+'<input placeholder="Rechercher une discussion ou une personne" data-q autocomplete="off"></label></div>'+
      '<div class="chips"><button class="chipb on" data-f="all">Toutes</button><button class="chipb" data-f="unread">Non lues</button><button class="chipb" data-f="groups">Groupes</button><button class="chipb" data-f="pinned">Épinglées</button></div>'+
      '<div class="chat-items" data-items></div><button class="fab" data-a="new" aria-label="Nouvelle discussion">'+icon('plus')+'</button>';
    p.querySelector('[data-q]').oninput=e=>{query=e.target.value;renderList()};
    p.onclick=e=>{
      if(Date.now()-(+p.dataset.lp||0)<700)return;
      const f=e.target.closest('[data-f]');if(f){filter=f.dataset.f;$$('.chipb',p).forEach(b=>b.classList.toggle('on',b===f));renderList();return}
      const a=e.target.closest('[data-a]');
      if(a){if(a.dataset.a==='new')newChat();if(a.dataset.a==='group')newGroup();if(a.dataset.a==='calls')callHistory();return}
      const it=e.target.closest('[data-chat]');if(it)App.go('chat',it.dataset.chat);
      const u=e.target.closest('[data-user]');if(u)Chat.openDirect(u.dataset.user);
    };
    p.oncontextmenu=e=>{const it=e.target.closest('[data-chat]');if(!it)return;e.preventDefault();chatMenu(Chat.get(it.dataset.chat))};
    longPress(p,'[data-chat]',it=>chatMenu(Chat.get(it.dataset.chat)));
  }
  async function renderList(){
    if(!el)return;const box=$('[data-items]',el);if(!box)return;
    const prefs=App.priv.chatPrefs||{};
    let list=Chat.list().filter(c=>!Chat.hidden(c));
    if(filter==='unread')list=list.filter(c=>(c.unread||{})[App.uid]);
    if(filter==='groups')list=list.filter(c=>c.type==='group');
    if(filter==='pinned')list=list.filter(c=>(prefs[c.id]||{}).pin);
    if(query)list=list.filter(c=>norm(Chat.titleSync(c)).includes(norm(query)));
    list.sort((a,b)=>((prefs[b.id]||{}).pin?1:0)-((prefs[a.id]||{}).pin?1:0));
    const texts=await Promise.all(list.map(c=>Chat.lastText(c)));
    let html=list.map((c,i)=>{
      const pr=prefs[c.id]||{};const n=(c.unread||{})[App.uid]||0;
      const peer=Chat.peer(c);
      const typing=Object.entries(c.typing||{}).some(([u,t])=>u!==App.uid&&Date.now()-t<5000);
      const mine=c.last&&c.last.from===App.uid;
      const av=c.type==='group'?avatar({name:c.name,avatar:c.avatar,uid:c.id},50):avatar(peer,50,Users.online(peer)&&Users.seenText(peer)==='en ligne'?'online':'');
      return '<button class="ci'+(c.id===openId?' on':'')+'" data-chat="'+c.id+'">'+av+
        '<span class="ci-m"><span class="ci-r1"><b>'+esc(Chat.titleSync(c))+'</b><small class="'+(n?'brand':'')+'">'+fmtListTime(c.lastAt||c.createdAt)+'</small></span>'+
        '<span class="ci-r2"><span class="ci-last">'+(typing?'<i class="brand">écrit…</i>':(mine?'<span class="tk">'+icon('check2')+'</span>':'')+(c.type==='group'&&c.last&&!mine&&c.last.kind!=='system'?esc(Users.peek(c.last.from).name.split(' ')[0])+' : ':'')+esc(texts[i]))+'</span>'+
        '<span class="ci-ic">'+(c.ephemeral?icon('timer','xs'):'')+(pr.mute?icon('mute','xs'):'')+(pr.pin?icon('pin','xs'):'')+(n?'<b class="cnt">'+n+'</b>':'')+'</span></span></span></button>';
    }).join('');
    if(query){
      const ids=new Set(Chat.list().filter(c=>c.type==='direct').map(c=>c.members.find(m=>m!==App.uid)));
      const ppl=Users.list().filter(u=>!u.deleted&&u.uid!==App.uid&&!ids.has(u.uid)&&(norm(u.name).includes(norm(query))||norm(u.username).includes(norm(query)))).slice(0,20);
      if(ppl.length)html+='<div class="sec-t">Personnes</div>'+ppl.map(u=>'<button class="ci" data-user="'+u.uid+'">'+avatar(u,50)+'<span class="ci-m"><b>'+esc(u.name)+'</b><span class="ci-last">@'+esc(u.username)+'</span></span></button>').join('');
    }
    box.innerHTML=html||'<div class="empty">'+(query?'Aucun résultat.':'<b>Aucune discussion</b><br>Appuyez sur + pour écrire à quelqu\'un.')+'</div>';
  }
  function chatMenu(c){
    if(!c)return;const pr=(App.priv.chatPrefs||{})[c.id]||{};
    actionSheet([
      {icon:'pin',label:pr.pin?'Désépingler':'Épingler',fn:()=>setPref(c.id,'pin',!pr.pin)},
      {icon:pr.mute?'volume':'mute',label:pr.mute?'Réactiver les notifications':'Mettre en sourdine',fn:()=>setPref(c.id,'mute',!pr.mute)},
      {icon:'check2',label:'Marquer comme lue',fn:()=>DB.update('chats',c.id,{['unread.'+App.uid]:0})},
      {icon:'trash',label:'Supprimer la discussion',danger:true,fn:async()=>{if(await confirmBox('Supprimer cette discussion de votre liste ? Les messages seront effacés de votre côté.','Supprimer',true)){await setPref(c.id,'clearedAt',Date.now());await DB.update('chats',c.id,{['unread.'+App.uid]:0});if(openId===c.id)App.go('chat')}}}
    ],Chat.titleSync(c));
  }
  const setPref=(id,k,v)=>DB.set('private',App.uid,{['chatPrefs.'+id+'.'+k]:v===false?DB.DEL:v},true);

  function userPicker(title,multi,exclude){
    return new Promise(res=>{
      let done=false;const sel=new Set();
      const ppl=()=>Users.list().filter(u=>!u.deleted&&!(exclude||[]).includes(u.uid)&&!Social.isBlocked(u.uid)).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
      const m=Modal.open(sheetHead(title)+'<div class="pad-x"><label class="search">'+icon('search')+'<input placeholder="Nom ou @utilisateur" data-q autocomplete="off"></label></div><div class="pick-list" data-l></div>'+(multi?'<div class="pad"><button class="btn primary block" data-ok disabled>Suivant</button></div>':''),{sheet:true,full:true,onClose:()=>{if(!done)res(null)}});
      const draw=q=>{m.box.querySelector('[data-l]').innerHTML=(multi?'':'<button class="li" data-u="'+App.uid+'">'+avatar(App.me,42)+'<span class="li-t"><b>'+esc(App.me.name)+' (vous)</b><small>Notes personnelles</small></span></button>')+ppl().filter(u=>u.uid!==App.uid&&(!q||norm(u.name+' '+u.username).includes(norm(q)))).map(u=>'<button class="li'+(sel.has(u.uid)?' sel':'')+'" data-u="'+u.uid+'">'+avatar(u,42)+'<span class="li-t"><b>'+esc(u.name)+'</b><small>@'+esc(u.username)+(u.bio?' · '+esc(u.bio.slice(0,40)):'')+'</small></span>'+(multi?'<i class="tick">'+icon('check')+'</i>':'')+'</button>').join('')||'<p class="empty">Personne pour l\'instant. Invitez vos proches à créer un compte !</p>'};
      draw('');
      m.box.querySelector('[data-q]').oninput=e=>draw(e.target.value);
      m.box.onclick=e=>{
        const b=e.target.closest('[data-u]');
        if(b){if(!multi){done=true;m.close();res(b.dataset.u);return}const u=b.dataset.u;sel.has(u)?sel.delete(u):sel.add(u);b.classList.toggle('sel');m.box.querySelector('[data-ok]').disabled=!sel.size;m.box.querySelector('[data-ok]').textContent=sel.size?'Suivant ('+sel.size+')':'Suivant'}
        if(e.target.closest('[data-ok]')){done=true;m.close();res([...sel])}
      };
    });
  }
  async function newChat(){const u=await userPicker('Nouvelle discussion');if(u)Chat.openDirect(u)}
  async function newGroup(){
    const members=await userPicker('Nouveau groupe : participants',true,[App.uid]);if(!members||!members.length)return;
    const missing=members.filter(u=>!Users.peek(u).publicKey);if(missing.length){toast('Certains comptes n\'ont pas encore de clé de chiffrement.','bad');return}
    let av='';
    const m=Modal.open('<form class="pad"><h3>Nouveau groupe</h3><div class="row gap mt"><button type="button" class="av-pick" data-av>'+icon('camera')+'</button><input class="inp" name="n" placeholder="Nom du groupe" required maxlength="50" autofocus></div><p class="muted small mt">'+members.length+' participant(s) + vous · chiffré de bout en bout</p><div class="row end gap mt"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary">Créer</button></div></form>',{cls:'small'});
    m.box.querySelector('[data-av]').onclick=async e=>{const f=await pickFile('image/*');if(!f)return;av=await squareThumb(f,160);e.target.closest('[data-av]').innerHTML='<img src="'+av+'" alt="">'};
    m.box.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('.primary');b.disabled=true;try{const id=await Chat.createGroup(e.target.n.value.trim(),members,av);m.close();App.go('chat',id)}catch(x){toast(x.message,'bad');b.disabled=false}};
  }
  async function callHistory(){
    const m=Modal.open(sheetHead('Appels récents')+'<div class="pick-list" data-l><p class="muted pad">Chargement…</p></div>',{sheet:true});
    const [a,b]=await Promise.all([DB.query('calls',{where:[['from','==',App.uid]]}),DB.query('calls',{where:[['to','==',App.uid]]})]);
    const all=[...a,...b].sort((x,y)=>y.at-x.at).slice(0,50);
    m.box.querySelector('[data-l]').innerHTML=all.length?all.map(c=>{
      const out=c.from===App.uid;const peer=Users.peek(out?c.to:c.from);const missed=!c.acceptedAt;
      return '<div class="li">'+avatar(peer,42)+'<span class="li-t"><b class="'+(missed&&!out?'bad':'')+'">'+esc(peer.name)+'</b><small>'+(out?'↗ Sortant':'↙ Entrant')+(missed?' · manqué':'')+' · '+fmtDay(c.at)+' '+fmtTime(c.at)+'</small></span><button class="ibtn brand" data-call="'+peer.uid+'" data-type="'+c.type+'">'+icon(c.type==='video'?'video':'phone')+'</button></div>'}).join(''):'<p class="empty">Aucun appel pour le moment.</p>';
    m.box.onclick=async e=>{const b=e.target.closest('[data-call]');if(!b)return;m.close();const id='d_'+[App.uid,b.dataset.call].sort().join('_');const c=Chat.get(id)||await DB.get('chats',id);if(c)Calls.call(c,b.dataset.type);else toast('Discussion introuvable.')}
  }

  /* ---------- Conversation ---------- */
  async function openChat(id){
    closeConv();
    openId=id;Tabs.chat.openId=id;
    chat=Chat.get(id)||await DB.get('chats',id).catch(()=>null);
    if(!chat||!chat.members.includes(App.uid)){toast('Discussion introuvable.');App.go('chat');return}
    el.querySelector('.chat-layout').classList.add('has-conv');document.body.classList.add('in-chat');
    $$('.ci',el).forEach(b=>b.classList.toggle('on',b.dataset.chat===id));
    const pane=$('.chat-conv-pane',el);
    pane.innerHTML='<header class="conv-h" data-h></header><div class="conv-body" data-body><div class="e2e-note">'+icon('lock')+' Les messages et appels sont chiffrés de bout en bout. Personne en dehors de cette discussion, pas même Lisanga, ne peut les lire ou les écouter.</div><div data-msgs></div></div><button class="to-bottom" data-bottom hidden>'+icon('back')+'</button><footer class="composer-wrap" data-comp></footer>';
    renderHeader();renderComposer();
    const body=pane.querySelector('[data-body]');
    body.addEventListener('scroll',()=>{pane.querySelector('[data-bottom]').hidden=body.scrollHeight-body.scrollTop-body.clientHeight<200});
    pane.querySelector('[data-bottom]').onclick=()=>body.scrollTo({top:body.scrollHeight,behavior:'smooth'});
    pane.onclick=onConvClick;
    pane.oncontextmenu=e=>{const m=e.target.closest('.msg[data-id]');if(m&&!e.target.closest('a,video,audio')){e.preventDefault();msgMenu(m.dataset.id)}};
    longPress(pane,'.msg[data-id]',m=>msgMenu(m.dataset.id));
    pane.addEventListener('dblclick',e=>{const m=e.target.closest('.msg[data-id]');if(m&&!e.target.closest('video,a'))react(m.dataset.id,'❤️')});
    first=true;
    offMsgs=DB.watch('chats/'+id+'/messages',{orderBy:['at','desc'],limit:400},list=>{msgs=list.reverse();renderMsgs()});
    offChatDoc=DB.watchDoc('chats',id,c=>{if(c&&chat&&c.id===chat.id){chat=c;renderHeader();refreshTicks()}});
  }
  let first=true;
  function closeConv(){
    if(offMsgs)offMsgs();if(offChatDoc)offChatDoc();offMsgs=offChatDoc=null;
    if(rec)stopRec(true);
    chat=null;openId=null;Tabs.chat.openId=null;msgs=[];reply=null;editing=null;searchQ='';
    document.body.classList.remove('in-chat');
    if(el){const l=el.querySelector('.chat-layout');if(l)l.classList.remove('has-conv')}
  }

  function renderHeader(){
    const h=el&&$('[data-h]',el);if(!h||!chat)return;
    const g=chat.type==='group';const peer=Chat.peer(chat);
    const typers=Object.entries(chat.typing||{}).filter(([u,t])=>u!==App.uid&&Date.now()-t<5000).map(([u])=>Users.peek(u).name.split(' ')[0]);
    let sub=typers.length?(g?typers.join(', ')+' écrit…':'écrit…'):g?chat.members.map(m=>m===App.uid?'Vous':Users.peek(m).name.split(' ')[0]).join(', '):(peer.uid===App.uid?'Message à vous-même':Users.seenText(peer));
    h.innerHTML='<button class="ibtn back-btn" data-act="back" aria-label="Retour">'+icon('back')+'</button><button class="conv-id" data-act="info">'+(g?avatar({name:chat.name,avatar:chat.avatar,uid:chat.id},40):avatar(peer,40))+'<span><b>'+esc(Chat.titleSync(chat))+'</b><small class="'+(typers.length?'brand':'')+'">'+esc(sub||'')+'</small></span></button>'+
      '<div class="row">'+(g||peer.uid===App.uid?'':'<button class="ibtn" data-act="video" aria-label="Appel vidéo">'+icon('video')+'</button><button class="ibtn" data-act="audio" aria-label="Appel audio">'+icon('phone')+'</button>')+'<button class="ibtn" data-act="menu" aria-label="Options">'+icon('dots')+'</button></div>';
    clearTimeout(renderHeader.t);if(typers.length)renderHeader.t=setTimeout(renderHeader,5200);
  }

  function blockedState(){
    if(!chat||chat.type!=='direct')return '';
    const pid=chat.members.find(m=>m!==App.uid);if(!pid)return '';
    if(Social.isBlocked(pid))return 'me';
    const u=Users.peek(pid);
    if(u.deleted)return 'deleted';
    if(Social.blockedMe(pid))return 'them';
    if(u.privacy&&u.privacy.messages==='following'&&!Social.followers().includes(pid)&&!msgs.some(m=>m.from===pid))return 'restricted';
    return '';
  }
  function renderComposer(){
    const c=el&&$('[data-comp]',el);if(!c)return;
    const b=blockedState();
    if(b){c.innerHTML='<div class="comp-block">'+(b==='me'?'Vous avez bloqué ce contact. <button class="link" data-act="unblock">Débloquer</button>':b==='deleted'?'Ce compte a été supprimé.':b==='them'?'Vous ne pouvez pas envoyer de message à ce contact.':'Cette personne n\'accepte que les messages des personnes qu\'elle suit.')+'</div>';return}
    c.innerHTML=(chat.ephemeral?'<div class="eph-bar">'+icon('timer','xs')+' Messages éphémères : '+ephLabel(chat.ephemeral)+'</div>':'')+
      '<div class="reply-bar" data-reply hidden></div>'+
      '<div class="composer" data-cbox><button class="ibtn" data-act="emoji" aria-label="Émojis">'+icon('smile')+'</button>'+
      '<textarea rows="1" placeholder="Message" data-input maxlength="6000"></textarea>'+
      '<button class="ibtn" data-act="ai" aria-label="Assistant IA" title="Assistant IA">'+icon('spark')+'</button>'+
      '<button class="ibtn" data-act="attach" aria-label="Joindre">'+icon('clip')+'</button>'+
      '<button class="ibtn hide-typing" data-act="camera" aria-label="Caméra">'+icon('camera')+'</button>'+
      '<button class="send-btn" data-act="sendmic" aria-label="Envoyer ou enregistrer">'+icon('mic')+'</button></div>';
    const ta=c.querySelector('[data-input]');
    const draftKey='lsg:draft:'+App.uid+':'+chat.id;ta.value=ssGet(draftKey)||'';
    const sync=()=>{ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight)+'px';const has=!!ta.value.trim();c.querySelector('[data-act=sendmic]').innerHTML=icon(has||editing?'send':'mic');c.querySelector('[data-cbox]').classList.toggle('typing',has);ssSet(draftKey,ta.value)};
    ta.oninput=()=>{sync();if(Date.now()-typingSent>2500&&ta.value){typingSent=Date.now();DB.update('chats',chat.id,{['typing.'+App.uid]:Date.now()}).catch(()=>{})}};
    ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&matchMedia('(pointer:fine)').matches){e.preventDefault();sendText()}};
    sync();
  }
  const ephLabel=s=>s>=7776000?'90 jours':s>=604800?'7 jours':s>=86400?'24 heures':s>=3600?'1 heure':s+' s';

  async function sendText(){
    const ta=$('[data-input]',el);const t=ta.value.trim();if(!t)return;
    ta.value='';ta.dispatchEvent(new Event('input'));ta.focus();
    if(editing){const id=editing;editing=null;setReply(null);await DB.update('chats/'+chat.id+'/messages',id,{enc:await E2E.encrypt(chat,{...dec.get(id),t}),edited:Date.now()});dec.delete(id);return}
    const p={kind:'text',t};if(reply)p.reply=replyRef();setReply(null);
    try{await Chat.send(chat,p)}catch(e){toast('Échec de l\'envoi : '+e.message,'bad');ta.value=t}
  }
  function replyRef(){const r=dec.get(reply.id)||{};return {id:reply.id,from:reply.from,t:(r.t||Chat.preview(r,reply.kind)).slice(0,140),kind:reply.kind}}
  function setReply(m,isEdit){
    reply=isEdit?null:m;const bar=$('[data-reply]',el);if(!bar)return;
    if(!m){bar.hidden=true;editing=null;return}
    const p=dec.get(m.id)||{};
    bar.hidden=false;
    bar.innerHTML='<div class="rq"><b>'+(isEdit?'Modifier le message':esc(m.from===App.uid?'Vous':Users.peek(m.from).name))+'</b><span>'+esc((p.t||Chat.preview(p,m.kind)).slice(0,120))+'</span></div><button class="ibtn sm" data-act="noreply">'+icon('close')+'</button>';
    const ta=$('[data-input]',el);if(isEdit){editing=m.id;ta.value=p.t||'';ta.dispatchEvent(new Event('input'))}ta.focus();
  }

  /* ---------- Rendu des messages (réutilise les nœuds inchangés) ---------- */
  async function decryptAll(){
    await Promise.all(msgs.map(async m=>{
      if(m.del||!m.enc){return}
      const k=m.id+':'+(m.edited||0);
      if(dec.has(m.id)&&dec.get(m.id).__k===k)return;
      try{const p=await E2E.decrypt(chat,m.enc);p.__k=k;dec.set(m.id,p)}catch(e){dec.set(m.id,{__k:k,__err:1})}
    }));
  }
  async function renderMsgs(){
    if(!chat||!el)return;
    const box=$('[data-msgs]',el),body=$('[data-body]',el);if(!box)return;
    const chatAtStart=chat.id;
    await decryptAll();
    if(!chat||chat.id!==chatAtStart)return;
    const pr=(App.priv.chatPrefs||{})[chat.id]||{};
    const hiddenIds=new Set(jget('lsg:hid:'+App.uid+':'+chat.id,[]));
    const now=Date.now();
    const vis=msgs.filter(m=>!hiddenIds.has(m.id)&&!(pr.clearedAt&&m.at<=pr.clearedAt)&&!(m.exp&&m.exp<now)&&!(m.from!==App.uid&&Social.isBlocked(m.from)));
    msgs.filter(m=>m.exp&&m.exp<now&&m.from===App.uid).forEach(m=>DB.del('chats/'+chat.id+'/messages',m.id).catch(()=>{}));
    const nearBottom=body.scrollHeight-body.scrollTop-body.clientHeight<160;
    const items=[];let lastDay='',prev=null;
    for(const m of vis){
      const d=new Date(m.at).toDateString();
      if(d!==lastDay){items.push({key:'day'+d,sig:fmtDay(m.at),html:'<div class="day"><span>'+fmtDay(m.at)+'</span></div>'});lastDay=d;prev=null}
      const p=dec.get(m.id)||{};
      if(searchQ&&!norm(p.t||'').includes(norm(searchQ))&&m.kind!=='system')continue;
      const cont=prev&&prev.from===m.from&&m.at-prev.at<300000&&prev.kind!=='system';
      const sig=[m.id,m.del?1:0,m.edited||0,JSON.stringify(m.reactions||{}),readState(m),cont?1:0,searchQ].join('|');
      items.push({key:m.id,sig,m,cont});
      prev=m;
    }
    const existing=new Map([...box.children].map(n=>[n.dataset.key,n]));
    const frag=[];
    for(const it of items){
      let n=existing.get(it.key);
      if(!n||n.dataset.sig!==it.sig){
        const t=document.createElement('div');t.innerHTML=it.html||msgHTML(it.m,it.cont);n=t.firstElementChild;n.dataset.key=it.key;n.dataset.sig=it.sig;
      }
      frag.push(n);
    }
    box.replaceChildren(...frag);
    Media.hydrate(box,()=>chat);
    if(first||nearBottom||(vis.length&&vis[vis.length-1].from===App.uid&&Date.now()-vis[vis.length-1].at<5000)){body.scrollTop=body.scrollHeight;setTimeout(()=>{body.scrollTop=body.scrollHeight},120)}
    first=false;
    markRead();
    renderComposerIfNeeded();
  }
  let compState='';
  function renderComposerIfNeeded(){const s=blockedState();if(s!==compState){compState=s;renderComposer()}}
  function markRead(){
    if(!chat||document.hidden)return;
    const n=(chat.unread||{})[App.uid];const lastOther=[...msgs].reverse().find(m=>m.from!==App.uid);
    const patch={};
    if(n)patch['unread.'+App.uid]=0;
    if(lastOther&&(App.me.privacy||{}).readReceipts!==false&&((chat.reads||{})[App.uid]||0)<lastOther.at)patch['reads.'+App.uid]=Date.now();
    if(Object.keys(patch).length)DB.update('chats',chat.id,patch).catch(()=>{});
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&chat)markRead()});

  function readState(m){
    if(m.from!==App.uid||!chat)return '';
    const others=chat.members.filter(x=>x!==App.uid);if(!others.length)return 'read';
    if(others.every(o=>((chat.reads||{})[o]||0)>=m.at))return 'read';
    if(others.some(o=>(Users.peek(o).lastSeen||0)>=m.at))return 'got';
    return 'sent';
  }
  function refreshTicks(){
    if(!el)return;
    $$('.msg.me[data-id]',el).forEach(n=>{const m=msgs.find(x=>x.id===n.dataset.id);if(!m)return;const s=readState(m);const t=n.querySelector('.tk');if(t&&t.dataset.s!==s){t.dataset.s=s;t.className='tk '+s;t.innerHTML=icon(s==='sent'?'check':'check2')}});
  }

  function msgHTML(m,cont){
    const me=m.from===App.uid;const p=dec.get(m.id)||{};
    if(m.kind==='system')return '<div class="sys"><span>'+esc(p.t||'')+'</span></div>';
    if(m.kind==='call'){
      const c=p.call||{};const ok=c.status==='done';
      return '<div class="sys call-log '+(ok?'':'missed')+'" data-id="'+m.id+'"><span>'+icon(c.type==='video'?'video':'phone','xs')+' '+(ok?(c.type==='video'?'Appel vidéo':'Appel audio')+' · '+fmtDur(c.dur):c.status==='rejected'?'Appel refusé':'Appel manqué')+' · '+fmtTime(m.at)+'</span></div>';
    }
    const u=Users.peek(m.from);
    let inner='';
    if(m.del)inner='<div class="m-del">'+icon('block','xs')+' Ce message a été supprimé</div>';
    else if(p.__err)inner='<div class="m-del">'+icon('lock','xs')+' Impossible de déchiffrer ce message</div>';
    else{
      if(p.fwd)inner+='<div class="m-fwd">'+icon('forward','xs')+' Transféré</div>';
      if(p.reply)inner+='<div class="m-quote" data-jump="'+esc(p.reply.id)+'"><b>'+esc(p.reply.from===App.uid?'Vous':Users.peek(p.reply.from).name)+'</b><span>'+esc(p.reply.t)+'</span></div>';
      switch(m.kind){
        case 'image':inner+='<img class="m-img" data-media="'+esc(p.m)+'" data-chat="1" alt="Photo" data-view="image">'+(p.t?'<div class="m-t">'+richText(p.t)+'</div>':'');break;
        case 'video':inner+='<video class="m-vid" data-media="'+esc(p.m)+'" data-chat="1" controls playsinline preload="metadata"></video>'+(p.t?'<div class="m-t">'+richText(p.t)+'</div>':'');break;
        case 'voice':inner+=voiceHTML(m.id,p,me);break;
        case 'file':inner+='<a class="m-file" data-media="'+esc(p.m)+'" data-chat="1" download="'+esc(p.name||'fichier')+'">'+icon('file')+'<span><b>'+esc(p.name||'Fichier')+'</b><small>'+fmtSize(p.size||0)+'</small></span>'+icon('download')+'</a>';break;
        case 'loc':inner+='<a class="m-loc" href="https://www.openstreetmap.org/?mlat='+(+p.lat)+'&mlon='+(+p.lng)+'#map=16/'+(+p.lat)+'/'+(+p.lng)+'" target="_blank" rel="noopener">'+icon('location')+'<span><b>Position partagée</b><small>'+(+p.lat).toFixed(5)+', '+(+p.lng).toFixed(5)+'</small></span></a>';break;
        case 'post':inner+='<button class="m-post" data-post="'+esc(p.post.col)+'/'+esc(p.post.id)+'">'+icon(p.post.col==='posts_fun'?'fun':p.post.col==='posts_star'?'star':'globe')+'<span><b>Publication de '+esc(Users.peek(p.post.uid).name)+'</b><small>'+esc((p.t||'Voir la publication').slice(0,90))+'</small></span></button>';break;
        default:inner+='<div class="m-t">'+richText(p.t||'')+'</div>';
      }
    }
    const rs=readState(m);
    const reacts=Object.entries(m.reactions||{});
    const rcount={};reacts.forEach(([,e])=>rcount[e]=(rcount[e]||0)+1);
    return '<div class="msg '+(me?'me':'them')+(cont?' cont':'')+(m.kind==='image'||m.kind==='video'?' media':'')+'" data-id="'+m.id+'">'+
      (chat.type==='group'&&!me&&!cont?'<button class="m-name" style="color:'+AV_COLORS[hashStr(m.from)%AV_COLORS.length]+'" data-profile="'+m.from+'">'+esc(u.name)+'</button>':'')+
      inner+'<div class="m-meta">'+(m.exp?icon('timer','xs'):'')+(m.edited?'<i>modifié</i> ':'')+fmtTime(m.at)+(me&&!m.del?' <span class="tk '+rs+'" data-s="'+rs+'">'+icon(rs==='sent'?'check':'check2')+'</span>':'')+'</div>'+
      (reacts.length?'<button class="m-react" data-reacts="'+m.id+'">'+Object.keys(rcount).join('')+(reacts.length>1?' <small>'+reacts.length+'</small>':'')+'</button>':'')+
      '<button class="m-more" data-more="'+m.id+'" aria-label="Options">'+icon('back')+'</button></div>';
  }
  function voiceHTML(id,p,me){
    const peaks=(p.peaks&&p.peaks.length?p.peaks:Array.from({length:36},(_,i)=>.3+.5*Math.abs(Math.sin(i*1.7))));
    return '<div class="voice" data-voice="'+id+'" data-src="'+esc(p.m)+'"><button class="vplay" aria-label="Lire">'+icon('play')+'</button><div class="vwave">'+peaks.map(h=>'<i style="height:'+Math.round(15+h*85)+'%"></i>').join('')+'</div><div class="vside"><small class="vdur">'+fmtDur(p.dur)+'</small><button class="vspeed">1×</button></div></div>';
  }

  /* ---------- Clics dans la conversation ---------- */
  async function onConvClick(e){
    if(Date.now()-(+e.currentTarget.dataset.lp||0)<700)return;
    const a=e.target.closest('[data-act]');
    if(a){
      const act=a.dataset.act;
      if(act==='back')return App.go('chat');
      if(act==='info')return chatInfo();
      if(act==='video'||act==='audio')return Calls.call(chat,act);
      if(act==='menu')return convMenu();
      if(act==='sendmic'){const ta=$('[data-input]',el);if(ta.value.trim()||editing)return sendText();return startRec()}
      if(act==='emoji')return emojiPicker(em=>{const ta=$('[data-input]',el);const s=ta.selectionStart||ta.value.length;ta.value=ta.value.slice(0,s)+em+ta.value.slice(s);ta.dispatchEvent(new Event('input'));ta.focus()});
      if(act==='attach')return attachMenu();
      if(act==='camera')return pickFile('image/*,video/*','environment').then(f=>f&&sendFile(f));
      if(act==='ai')return aiMenu();
      if(act==='noreply')return setReply(null);
      if(act==='unblock'){const pid=chat.members.find(m=>m!==App.uid);await Social.unblock(pid);compState='?';renderComposerIfNeeded();return}
      if(act==='rec-cancel')return stopRec(true);
      if(act==='rec-send')return stopRec(false);
      if(act==='rec-pause')return pauseRec();
    }
    const more=e.target.closest('[data-more]');if(more)return msgMenu(more.dataset.more);
    const rx=e.target.closest('[data-reacts]');if(rx)return reactionsInfo(rx.dataset.reacts);
    const q=e.target.closest('[data-jump]');if(q){const t=$('.msg[data-id="'+q.dataset.jump+'"]',el);if(t){t.scrollIntoView({block:'center',behavior:'smooth'});t.classList.add('flash');setTimeout(()=>t.classList.remove('flash'),1200)}return}
    const pf=e.target.closest('[data-profile]');if(pf)return Profile.open(pf.dataset.profile);
    const img=e.target.closest('[data-view=image]');if(img&&img.src)return viewer(img.src);
    const post=e.target.closest('[data-post]');if(post){const [col,id]=post.dataset.post.split('/');return Profile.openPost(col,id)}
    const vb=e.target.closest('.vplay,.vspeed,.vwave');if(vb)return voiceClick(vb);
  }

  function longPress(root,sel,fn){
    let t=null,sx=0,sy=0;
    root.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;const n=e.target.closest(sel);if(!n)return;sx=e.clientX;sy=e.clientY;t=setTimeout(()=>{t=null;root.dataset.lp=Date.now();navigator.vibrate&&navigator.vibrate(15);fn(n)},480)});
    const cancel=()=>{clearTimeout(t);t=null};
    root.addEventListener('pointerup',cancel);root.addEventListener('pointercancel',cancel);
    root.addEventListener('pointermove',e=>{if(t&&(Math.abs(e.clientX-sx)>8||Math.abs(e.clientY-sy)>8))cancel()});
  }

  function msgMenu(id){
    const m=msgs.find(x=>x.id===id);if(!m||m.kind==='system')return;
    const me=m.from===App.uid;const p=dec.get(id)||{};
    const items=[];
    if(!m.del&&m.kind!=='call'){
      items.push({icon:'reply',label:'Répondre',fn:()=>setReply(m)});
      if(p.t)items.push({icon:'copy',label:'Copier',fn:()=>{navigator.clipboard&&navigator.clipboard.writeText(p.t);toast('Copié.')}});
      items.push({icon:'forward',label:'Transférer',fn:()=>forward(m)});
      if(me&&m.kind==='text'&&Date.now()-m.at<15*60000)items.push({icon:'edit',label:'Modifier',fn:()=>setReply(m,true)});
      if(['image','video','file','voice'].includes(m.kind))items.push({icon:'download',label:'Enregistrer sur l\'appareil',fn:async()=>{const u=await Media.url(p.m,chat);const a=document.createElement('a');a.href=u;a.download=p.name||('lisanga-'+m.id+(m.kind==='image'?'.jpg':m.kind==='video'?'.mp4':m.kind==='voice'?'.webm':''));a.click()}});
      if(p.t)items.push({icon:'spark',label:'Demander à l\'IA',fn:()=>App.go('ia')||Tabs.ia.ask&&Tabs.ia.ask('Explique ou réponds à ce message :\n\n'+p.t)});
      items.push({icon:'info',label:'Infos',fn:()=>msgInfo(m)});
    }
    items.push({icon:'trash',label:'Supprimer pour moi',danger:true,fn:()=>{const k='lsg:hid:'+App.uid+':'+chat.id;jset(k,[...jget(k,[]),id]);renderMsgs()}});
    if(me&&!m.del&&Date.now()-m.at<48*3600000)items.push({icon:'trash',label:'Supprimer pour tout le monde',danger:true,fn:async()=>{await DB.update('chats/'+chat.id+'/messages',id,{del:true,enc:DB.DEL,reactions:DB.DEL});if(p.m)Media.remove(p.m)}});
    if(!me)items.push({icon:'flag',label:'Signaler',danger:true,fn:()=>Social.report('message',chat.id+'/'+id,m.from)});
    const sheet=actionSheet(items);
    if(!m.del&&m.kind!=='call'){
      const bar=document.createElement('div');bar.className='react-bar';
      bar.innerHTML=QUICK_REACT.map(e=>'<button data-e="'+e+'">'+e+'</button>').join('')+'<button data-e="+">'+icon('plus')+'</button>';
      sheet.box.prepend(bar);
      bar.onclick=e=>{const b=e.target.closest('[data-e]');if(!b)return;e.stopPropagation();sheet.close();if(b.dataset.e==='+')emojiPicker(em=>react(id,em));else react(id,b.dataset.e)};
    }
  }
  async function react(id,e){
    const m=msgs.find(x=>x.id===id);if(!m||m.del)return;
    const cur=(m.reactions||{})[App.uid];
    await DB.update('chats/'+chat.id+'/messages',id,{['reactions.'+App.uid]:cur===e?DB.DEL:e});
  }
  function reactionsInfo(id){
    const m=msgs.find(x=>x.id===id);if(!m)return;
    const mod=Modal.open(sheetHead('Réactions')+'<div class="pick-list">'+Object.entries(m.reactions||{}).map(([u,e])=>'<button class="li" data-u="'+u+'">'+avatar(Users.peek(u),40)+'<span class="li-t"><b>'+esc(u===App.uid?'Vous':Users.peek(u).name)+'</b>'+(u===App.uid?'<small>Touchez pour retirer</small>':'')+'</span><span class="big-e">'+e+'</span></button>').join('')+'</div>',{sheet:true});
    mod.box.onclick=e=>{const b=e.target.closest('[data-u]');if(b&&b.dataset.u===App.uid){mod.close();react(id,m.reactions[App.uid])}};
  }
  function msgInfo(m){
    const others=chat.members.filter(x=>x!==App.uid);
    Modal.open(sheetHead('Infos du message')+'<div class="pad"><p><b>Envoyé :</b> '+new Date(m.at).toLocaleString('fr-FR')+'</p>'+(m.edited?'<p><b>Modifié :</b> '+new Date(m.edited).toLocaleString('fr-FR')+'</p>':'')+(m.exp?'<p><b>Disparaît :</b> '+new Date(m.exp).toLocaleString('fr-FR')+'</p>':'')+
      (m.from===App.uid?'<h4 class="mt">Lu par</h4>'+others.map(o=>{const r=(chat.reads||{})[o]||0;return '<div class="li">'+avatar(Users.peek(o),34)+'<span class="li-t"><b>'+esc(Users.peek(o).name)+'</b><small>'+(r>=m.at?'Lu':'Pas encore lu (ou accusés désactivés)')+'</small></span></div>'}).join(''):'')+
      '<p class="muted small mt">'+icon('lock','xs')+' Chiffré de bout en bout (AES-GCM 256 bits).</p></div>',{sheet:true});
  }
  async function forward(m){
    const target=await Chat.pickChat('Transférer à…');if(!target)return;
    const p={...(dec.get(m.id)||{})};delete p.__k;delete p.reply;p.fwd=true;
    try{
      if(p.m){const b=await Media.blob(p.m,chat);p.m=await Media.put(b,target)}
      await Chat.send(target,{kind:m.kind,...p});toast('Message transféré.');
    }catch(e){toast('Échec du transfert : '+e.message,'bad')}
  }
  function convMenu(){
    const g=chat.type==='group';const pid=g?null:chat.members.find(m=>m!==App.uid);
    const pr=(App.priv.chatPrefs||{})[chat.id]||{};
    actionSheet([
      {icon:'info',label:g?'Infos du groupe':'Infos du contact',fn:chatInfo},
      {icon:'search',label:'Rechercher dans la discussion',fn:async()=>{const q=await promptBox('Rechercher',{value:searchQ,placeholder:'Mot à chercher (vide = tout afficher)'});if(q===null)return;searchQ=q.trim();renderMsgs()}},
      {icon:'timer',label:'Messages éphémères',fn:ephemeralMenu},
      {icon:pr.mute?'volume':'mute',label:pr.mute?'Réactiver les notifications':'Mettre en sourdine',fn:()=>setPref(chat.id,'mute',!pr.mute)},
      {icon:'trash',label:'Effacer la discussion',danger:true,fn:async()=>{if(await confirmBox('Effacer tous les messages de cette discussion de votre côté ?','Effacer',true))await setPref(chat.id,'clearedAt',Date.now())}},
      pid&&pid!==App.uid&&{icon:'block',label:Social.isBlocked(pid)?'Débloquer':'Bloquer',danger:!Social.isBlocked(pid),fn:async()=>{if(Social.isBlocked(pid))await Social.unblock(pid);else if(await confirmBox('Bloquer '+Users.peek(pid).name+' ? Cette personne ne pourra plus vous appeler ni vous écrire.','Bloquer',true))await Social.block(pid);compState='?';renderComposerIfNeeded()}},
      pid&&pid!==App.uid&&{icon:'flag',label:'Signaler',danger:true,fn:()=>Social.report('user',pid,pid)},
      g&&{icon:'logout',label:'Quitter le groupe',danger:true,fn:leaveGroup}
    ]);
  }
  function ephemeralMenu(){
    const opts=[[0,'Désactivés'],[86400,'24 heures'],[604800,'7 jours'],[7776000,'90 jours']];
    actionSheet(opts.map(([s,l])=>({icon:chat.ephemeral===s?'check':'timer',label:l,fn:async()=>{
      await DB.update('chats',chat.id,{ephemeral:s});
      await Chat.send(chat,{kind:'system',t:App.me.name+(s?' a activé les messages éphémères ('+l+')':' a désactivé les messages éphémères')});
      chat.ephemeral=s;renderComposer();
    }})),'Les nouveaux messages disparaîtront après :');
  }
  async function leaveGroup(){
    if(!(await confirmBox('Quitter ce groupe ?','Quitter',true)))return;
    await Chat.send(chat,{kind:'system',t:App.me.name+' a quitté le groupe'});
    const admins=(chat.admins||[]).filter(a=>a!==App.uid);const members=chat.members.filter(m=>m!==App.uid);
    if(!admins.length&&members.length)admins.push(members[0]);
    await DB.update('chats',chat.id,{members:DB.remove(App.uid),admins,['keys.'+App.uid]:DB.DEL});
    App.go('chat');
  }

  /* ---------- Infos du contact / du groupe ---------- */
  async function chatInfo(){
    const g=chat.type==='group';const peer=Chat.peer(chat);const admin=g&&(chat.admins||[]).includes(App.uid);
    const sn=g?'':await E2E.safetyNumber(App.me,peer);
    const media=msgs.filter(m=>!m.del&&(m.kind==='image'||m.kind==='video')).slice(-30).reverse();
    const m=Modal.open(sheetHead(g?'Infos du groupe':'Infos du contact')+'<div class="info-top">'+(g?avatar({name:chat.name,avatar:chat.avatar,uid:chat.id},96):avatar(peer,96))+'<h2>'+esc(Chat.titleSync(chat))+'</h2><p class="muted">'+(g?'Groupe · '+chat.members.length+' participants':'@'+esc(peer.username))+'</p>'+(!g&&peer.bio?'<p>'+esc(peer.bio)+'</p>':'')+
      '<div class="row center gap mt">'+(!g&&peer.uid!==App.uid?'<button class="pill" data-i="audio">'+icon('phone')+'Audio</button><button class="pill" data-i="video">'+icon('video')+'Vidéo</button><button class="pill" data-i="profile">'+icon('user')+'Profil</button>':'')+(g&&admin?'<button class="pill" data-i="rename">'+icon('edit')+'Renommer</button><button class="pill" data-i="photo">'+icon('camera')+'Photo</button>':'')+'</div></div>'+
      (media.length?'<h4 class="sec-t">Médias</h4><div class="media-strip">'+media.map(x=>{const p=dec.get(x.id)||{};return x.kind==='image'?'<img data-media="'+esc(p.m)+'" data-chat="1" data-view="image" alt="">':'<video data-media="'+esc(p.m)+'" data-chat="1" preload="metadata" muted></video>'}).join('')+'</div>':'')+
      '<div class="info-sec"><button class="li" data-i="eph">'+icon('timer')+'<span class="li-t"><b>Messages éphémères</b><small>'+(chat.ephemeral?ephLabel(chat.ephemeral):'Désactivés')+'</small></span></button>'+
      (!g?'<div class="li">'+icon('lock')+'<span class="li-t"><b>Chiffrement</b><small>Les messages et appels sont chiffrés de bout en bout. Comparez ce numéro de sécurité avec celui de '+esc(peer.name)+' pour le vérifier :</small><code class="safety">'+sn+'</code></span></div>':'<div class="li">'+icon('lock')+'<span class="li-t"><b>Chiffrement</b><small>Clé de groupe AES-256 distribuée à chaque membre via ECDH.</small></span></div>')+'</div>'+
      (g?'<h4 class="sec-t">'+chat.members.length+' participants</h4>'+(admin?'<button class="li" data-i="add">'+icon('plus')+'<span class="li-t"><b>Ajouter des participants</b></span></button>':'')+chat.members.map(u=>{const x=Users.peek(u);return '<div class="li" data-mem="'+u+'">'+avatar(x,40)+'<span class="li-t"><b>'+esc(u===App.uid?'Vous':x.name)+'</b><small>'+esc(x.bio||'@'+x.username)+'</small></span>'+((chat.admins||[]).includes(u)?'<span class="tagp">Admin</span>':'')+(admin&&u!==App.uid?'<button class="ibtn sm" data-kick="'+u+'" aria-label="Options">'+icon('dots')+'</button>':'')+'</div>'}).join(''):'')+
      '<div class="info-sec">'+(g?'<button class="li danger" data-i="leave">'+icon('logout')+'<span class="li-t"><b>Quitter le groupe</b></span></button>':peer.uid!==App.uid?'<button class="li danger" data-i="block">'+icon('block')+'<span class="li-t"><b>'+(Social.isBlocked(peer.uid)?'Débloquer':'Bloquer')+' '+esc(peer.name)+'</b></span></button><button class="li danger" data-i="report">'+icon('flag')+'<span class="li-t"><b>Signaler</b></span></button>':'')+'</div>',{sheet:true,full:true});
    Media.hydrate(m.box,()=>chat);
    m.box.addEventListener('click',async e=>{
      const v=e.target.closest('[data-view=image]');if(v&&v.src)return viewer(v.src);
      const k=e.target.closest('[data-kick]');
      if(k){const u=k.dataset.kick;const isAd=(chat.admins||[]).includes(u);return actionSheet([
        {icon:'shield',label:isAd?'Retirer le rôle admin':'Nommer admin',fn:()=>DB.update('chats',chat.id,{admins:isAd?DB.remove(u):DB.union(u)})},
        {icon:'trash',label:'Retirer du groupe',danger:true,fn:async()=>{await DB.update('chats',chat.id,{members:DB.remove(u),admins:DB.remove(u),['keys.'+u]:DB.DEL});await Chat.send({...chat,members:chat.members.filter(x=>x!==u)},{kind:'system',t:App.me.name+' a retiré '+Users.peek(u).name});m.close()}}
      ],Users.peek(u).name)}
      const b=e.target.closest('[data-i]');if(!b)return;const i=b.dataset.i;
      if(i==='audio'||i==='video'){m.close();Calls.call(chat,i)}
      if(i==='profile'){m.close();Profile.open(peer.uid)}
      if(i==='eph'){m.close();ephemeralMenu()}
      if(i==='leave'){m.close();leaveGroup()}
      if(i==='report')Social.report('user',peer.uid,peer.uid);
      if(i==='block'){m.close();if(Social.isBlocked(peer.uid))await Social.unblock(peer.uid);else if(await confirmBox('Bloquer '+peer.name+' ?','Bloquer',true))await Social.block(peer.uid);compState='?';renderComposerIfNeeded()}
      if(i==='rename'){const n=await promptBox('Nom du groupe',{value:chat.name});if(n&&n.trim()){await DB.update('chats',chat.id,{name:n.trim()});m.close()}}
      if(i==='photo'){const f=await pickFile('image/*');if(f){await DB.update('chats',chat.id,{avatar:await squareThumb(f,160)});m.close()}}
      if(i==='add'){
        m.close();const add=await userPicker('Ajouter des participants',true,chat.members);if(!add||!add.length)return;
        const raw=await E2E.groupRaw(chat);const {keys}=await E2E.groupKeys(add,raw);
        const patch={members:DB.union(...add)};Object.entries(keys).forEach(([u,k])=>patch['keys.'+u]=k);
        await DB.update('chats',chat.id,patch);
        await Chat.send({...chat,members:[...chat.members,...add]},{kind:'system',t:App.me.name+' a ajouté '+add.map(u=>Users.peek(u).name).join(', ')});
      }
    });
  }

  /* ---------- Pièces jointes ---------- */
  function attachMenu(){
    actionSheet([
      {icon:'image',label:'Photos et vidéos',fn:()=>pickFile('image/*,video/*').then(f=>f&&sendFile(f))},
      {icon:'camera',label:'Appareil photo',fn:()=>pickFile('image/*','environment').then(f=>f&&sendFile(f))},
      {icon:'file',label:'Document',fn:()=>pickFile('*/*').then(f=>f&&sendFile(f,true))},
      {icon:'location',label:'Ma position',fn:sendLocation}
    ],'Envoyer');
  }
  async function sendFile(f,asDoc){
    const kind=asDoc?'file':f.type.startsWith('image/')?'image':f.type.startsWith('video/')?'video':'file';
    let caption='';
    if(kind!=='file'){
      const url=URL.createObjectURL(f);
      caption=await new Promise(res=>{
        let done=false;
        const m=Modal.open('<div class="send-prev">'+(kind==='image'?'<img src="'+url+'" alt="">':'<video src="'+url+'" controls playsinline></video>')+'</div><form class="cap-form"><input class="inp" name="c" placeholder="Ajouter une légende…" autocomplete="off" maxlength="1000"><button class="send-btn" aria-label="Envoyer">'+icon('send')+'</button></form>',{full:true,cls:'dark',onClose:()=>{URL.revokeObjectURL(url);if(!done)res(null)}});
        m.box.querySelector('form').onsubmit=e=>{e.preventDefault();done=true;const v=e.target.c.value;m.close();res(v)};
      });
      if(caption===null)return;
    }
    const tmp=toastProgress('Envoi chiffré en cours…');
    try{
      const blob=kind==='image'&&!/gif/.test(f.type)?await compressImage(f,1920,.84):f;
      const mid=await Media.put(blob,chat);
      const p={kind,m:mid,mime:blob.type,size:blob.size,name:f.name};if(caption)p.t=caption;if(reply)p.reply=replyRef();setReply(null);
      await Chat.send(chat,p);
    }catch(e){toast(e.message,'bad')}finally{tmp()}
  }
  function toastProgress(t){const r=$('#toast-root');const d=document.createElement('div');d.className='toast sticky';d.innerHTML='<span class="spin"></span> '+esc(t);r.appendChild(d);return ()=>d.remove()}
  function sendLocation(){
    if(!navigator.geolocation){toast('Position indisponible.');return}
    navigator.geolocation.getCurrentPosition(p=>Chat.send(chat,{kind:'loc',lat:p.coords.latitude,lng:p.coords.longitude}),()=>toast('Autorisez l\'accès à la position.','bad'),{enableHighAccuracy:true,timeout:15000});
  }

  /* ---------- Messages vocaux ---------- */
  async function startRec(){
    if(!window.MediaRecorder){toast('Enregistrement vocal non pris en charge par ce navigateur.','bad');return}
    let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})}catch(e){toast('Autorisez le micro pour enregistrer un vocal.','bad');return}
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
    const mr=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:32000}:undefined);
    const chunks=[];mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    rec={mr,stream,chunks,start:Date.now(),paused:0,pausedAt:0,levels:[]};
    try{const ac=Sound.ac();const src=ac.createMediaStreamSource(stream);const an=ac.createAnalyser();an.fftSize=256;src.connect(an);rec.an=an}catch(e){}
    mr.start(250);
    const c=$('[data-cbox]',el);
    c.classList.add('recording');
    c.insertAdjacentHTML('afterbegin','<div class="rec-bar"><button class="ibtn" data-act="rec-cancel" aria-label="Annuler">'+icon('trash')+'</button><span class="rec-dot"></span><b class="rec-t">0:00</b><div class="rec-wave"></div><button class="ibtn" data-act="rec-pause" aria-label="Pause">'+icon('pause')+'</button><button class="send-btn" data-act="rec-send" aria-label="Envoyer">'+icon('send')+'</button></div>');
    const wave=c.querySelector('.rec-wave');const buf=new Uint8Array(128);
    rec.timer=setInterval(()=>{
      if(!rec)return;
      const t=(Date.now()-rec.start-rec.paused-(rec.pausedAt?Date.now()-rec.pausedAt:0))/1000;c.querySelector('.rec-t').textContent=fmtDur(t);
      if(rec.an&&!rec.pausedAt){rec.an.getByteTimeDomainData(buf);let mx=0;for(const v of buf)mx=Math.max(mx,Math.abs(v-128));const lv=Math.min(1,mx/64);rec.levels.push(lv);wave.insertAdjacentHTML('beforeend','<i style="height:'+Math.round(10+lv*90)+'%"></i>');if(wave.children.length>60)wave.firstElementChild.remove()}
      if(t>=600)stopRec(false);
    },100);
  }
  function pauseRec(){
    if(!rec)return;const b=$('[data-act=rec-pause]',el);
    if(rec.mr.state==='recording'){rec.mr.pause();rec.pausedAt=Date.now();b.innerHTML=icon('mic')}
    else{rec.mr.resume();rec.paused+=Date.now()-rec.pausedAt;rec.pausedAt=0;b.innerHTML=icon('pause')}
  }
  function stopRec(cancel){
    if(!rec)return;const r=rec;rec=null;
    clearInterval(r.timer);
    const dur=(Date.now()-r.start-r.paused-(r.pausedAt?Date.now()-r.pausedAt:0))/1000;
    r.mr.onstop=async()=>{
      r.stream.getTracks().forEach(t=>t.stop());
      if(cancel||dur<0.8||!chat){if(!cancel&&chat)toast('Maintenez l\'enregistrement plus longtemps.');return}
      const blob=new Blob(r.chunks,{type:r.mr.mimeType||'audio/webm'});
      const L=r.levels.length?r.levels:[.5];const peaks=Array.from({length:36},(_,i)=>{const a=L.slice(Math.floor(i*L.length/36),Math.floor((i+1)*L.length/36)+1);return +(Math.max(...a)||.1).toFixed(2)});
      try{const mid=await Media.put(blob,chat);const p={kind:'voice',m:mid,mime:blob.type,dur:Math.round(dur),peaks};if(reply)p.reply=replyRef();setReply(null);await Chat.send(chat,p)}catch(e){toast(e.message,'bad')}
    };
    r.mr.stop();
    const c=$('[data-cbox]',el);if(c){c.classList.remove('recording');const b=c.querySelector('.rec-bar');if(b)b.remove()}
  }
  const players=new Map();
  async function voiceClick(target){
    const v=target.closest('[data-voice]');const id=v.dataset.voice;
    let a=players.get(id);
    if(!a){
      const u=await Media.url(v.dataset.src,chat);if(!u){toast('Vocal indisponible.');return}
      a=new Audio(u);players.set(id,a);
      const bars=$$('.vwave i',v),dur=v.querySelector('.vdur');
      a.ontimeupdate=()=>{const d=isFinite(a.duration)?a.duration:(dec.get(id)||{}).dur||1;const r=a.currentTime/d;bars.forEach((b,i)=>b.classList.toggle('on',i/bars.length<r));dur.textContent=fmtDur(a.currentTime)};
      a.onended=()=>{v.querySelector('.vplay').innerHTML=icon('play');bars.forEach(b=>b.classList.remove('on'));dur.textContent=fmtDur((dec.get(id)||{}).dur)};
    }
    if(target.classList.contains('vspeed')){const s={1:1.5,1.5:2,2:1}[a.playbackRate]||1;a.playbackRate=s;target.textContent=String(s).replace('.',',')+'×';return}
    if(target.classList.contains('vwave')){return}
    players.forEach((p,k)=>{if(k!==id&&!p.paused){p.pause();const o=$('[data-voice="'+k+'"] .vplay',el);if(o)o.innerHTML=icon('play')}});
    if(a.paused){a.play();target.innerHTML=icon('pause')}else{a.pause();target.innerHTML=icon('play')}
  }

  /* ---------- IA dans la zone de saisie ---------- */
  function aiMenu(){
    const ta=$('[data-input]',el);const draft=ta.value.trim();
    const ctx=()=>msgs.filter(m=>!m.del&&dec.get(m.id)&&dec.get(m.id).t).slice(-15).map(m=>(m.from===App.uid?'Moi':Users.peek(m.from).name)+' : '+dec.get(m.id).t).join('\n');
    const run=async(prompt,fill)=>{
      if(!(await AI.consent()))return;
      const stop=toastProgress('L\'IA réfléchit…');
      try{const r=await AI.ask([{role:'user',content:prompt}],'Tu aides à rédiger des messages de discussion. Réponds UNIQUEMENT avec le texte demandé, sans guillemets ni explication, dans la langue demandée ou celle de la conversation.');
        if(fill){ta.value=r.trim();ta.dispatchEvent(new Event('input'));ta.focus()}else Modal.open(sheetHead('Résumé de l\'IA')+'<div class="pad ai-md">'+miniMd(r)+'</div>',{sheet:true});
      }catch(e){toast(e.message,'bad')}finally{stop()}
    };
    actionSheet([
      {icon:'reply',label:'Suggérer une réponse',fn:()=>run('Voici la fin de la conversation :\n'+ctx()+'\n\nPropose une réponse naturelle et courte que « Moi » pourrait envoyer.',true)},
      draft&&{icon:'edit',label:'Corriger et améliorer mon texte',fn:()=>run('Corrige l\'orthographe et améliore ce message sans changer son sens ni sa langue :\n'+draft,true)},
      draft&&{icon:'globe',label:'Traduire en anglais',fn:()=>run('Traduis en anglais :\n'+draft,true)},
      draft&&{icon:'globe',label:'Traduire en français',fn:()=>run('Traduis en français :\n'+draft,true)},
      draft&&{icon:'globe',label:'Traduire en lingala',fn:()=>run('Traduis en lingala :\n'+draft,true)},
      draft&&{icon:'globe',label:'Traduire en swahili',fn:()=>run('Traduis en swahili :\n'+draft,true)},
      {icon:'text',label:'Résumer la discussion',fn:()=>run('Résume cette conversation en quelques points :\n'+ctx(),false)}
    ],'Assistant IA');
  }

  /* ---------- Outils d'interface ---------- */
  function emojiPicker(cb){
    const m=Modal.open(sheetHead('Émojis')+'<div class="emoji-grid">'+EMOJIS.map(e=>'<button>'+e+'</button>').join('')+'</div>',{sheet:true});
    m.box.querySelector('.emoji-grid').onclick=e=>{const b=e.target.closest('button');if(b){cb(b.textContent);m.close()}};
  }
  function viewer(src){Modal.open('<button class="ibtn viewer-x" data-close aria-label="Fermer">'+icon('close')+'</button><img class="viewer-img" src="'+src+'" alt="">',{full:true,cls:'dark viewer'})}

  return {mount,unmount,openChat,openId:null,viewer,emojiPicker,longPress,userPicker};
})();
