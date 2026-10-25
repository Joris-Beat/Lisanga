/* Lisanga — Onglet IA : assistant intégré.
   Avec un serveur IA configuré (config.js > iaEndpoint, voir ia-worker/), l'assistant utilise Claude d'Anthropic.
   Sans serveur, un assistant hors ligne simple répond aux questions de base et explique l'application. */
'use strict';

const AI=(()=>{
  const endpoint=()=>((window.LISANGA_CONFIG||{}).iaEndpoint||'').trim();
  const SYSTEM='Tu es « Lisa », l\'assistante IA intégrée à Lisanga, une application de messagerie et de réseau social. Tu réponds de façon chaleureuse, claire et concise, par défaut en français, sinon dans la langue de l\'utilisateur. Tu peux aider à rédiger des messages, légendes et publications, traduire (notamment français, anglais, lingala, swahili), expliquer, résumer, donner des idées et répondre à des questions générales.';

  /* Assistant hors ligne : règles simples, aucune donnée ne sort de l'appareil */
  function offline(text){
    const t=norm(text);
    const calc=text.replace(/[x×]/g,'*').replace(/÷/g,'/').replace(/,/g,'.').match(/^[\s\d+\-*/().%^]+$/);
    if(calc&&/\d/.test(text)){try{const v=Function('"use strict";return ('+calc[0].replace(/\^/g,'**')+')')();if(isFinite(v))return text.trim().replace(/\*/g,' × ').replace(/\s+/g,' ')+' = **'+(Math.round(v*1e8)/1e8).toLocaleString('fr-FR')+'**'}catch(e){}}
    if(/^(salut|bonjour|bonsoir|hello|hi|mbote|coucou|yo)\b/.test(t))return 'Mbote ! 👋 Je suis Lisa, l\'assistante de Lisanga. Comment puis-je vous aider ?';
    if(/heure|quelle date|quel jour|aujourd/.test(t))return 'Nous sommes le **'+new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'**, il est **'+fmtTime(Date.now())+'**.';
    if(/blague|drole|rigol/.test(t))return ['Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tombent dans le bateau ! 😄','Quel est le comble pour un électricien ? De ne pas être au courant ! ⚡','Que dit un téléphone amoureux ? « Tu es ma meilleure connexion. » 📱❤️'][Math.floor(Math.random()*3)];
    if(/appel|video|vocal|audio/.test(t))return 'Pour **appeler** : ouvrez une discussion dans **Chat**, puis touchez 📞 (audio) ou 🎥 (vidéo) en haut.\nPour un **vocal** : dans la zone de saisie vide, touchez le micro 🎤, parlez, puis envoyez.';
    if(/securi|chiffr|confidential|bloquer|verrou|code/.test(t))return 'Lisanga protège vos échanges :\n- **Chiffrement de bout en bout** des messages, vocaux et fichiers (AES-256).\n- **Appels** chiffrés de pair à pair.\n- **Code de verrouillage**, **messages éphémères**, **blocage** et **signalement**.\nTout se règle dans **Moi > Sécurité et Confidentialité**.';
    if(/star|story|stories|photo/.test(t))return 'Dans **Star** : publiez des photos avec filtres et des **stories** qui disparaissent après 24 h. Touchez « + » sur votre rond de story.';
    if(/fun|tiktok|video courte|clip/.test(t))return 'Dans **Fun** : faites défiler les vidéos courtes, double-touchez pour aimer, et publiez avec le bouton « + Créer ».';
    if(/publique|facebook|fil|actualit/.test(t))return 'Dans **Publique** : partagez un statut, une photo, réagissez (👍❤️😆😮😢😡), commentez et republiez.';
    if(/merci/.test(t))return 'Avec plaisir ! 😊';
    return 'Je fonctionne actuellement en **mode hors ligne** : je réponds seulement aux questions simples (salutations, calculs, date, aide sur l\'application).\n\nPour activer l\'**assistant complet** (rédaction, traduction, résumés, analyse de photos…), l\'administrateur doit déployer le petit serveur IA fourni dans le dossier `ia-worker` et renseigner `iaEndpoint` dans `config.js` (voir GUIDE.md).';
  }

  return {
    get online(){return !!endpoint()},
    SYSTEM,
    async consent(){
      if(!this.online)return true;
      if(App.prefs().iaOk)return true;
      const ok=await confirmBox('Le texte nécessaire à cette demande sera envoyé au service d\'IA (Claude, d\'Anthropic) pour générer la réponse. Vos autres messages restent chiffrés. Continuer ?','Accepter');
      if(ok)App.setPref('iaOk',true);return ok;
    },
    /* messages : [{role:'user'|'assistant', content: texte ou blocs}] */
    async ask(messages,extraSystem){
      if(!this.online){await sleep(350);const last=messages[messages.length-1];return offline(typeof last.content==='string'?last.content:(last.content.find(b=>b.type==='text')||{}).text||'')}
      const r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:extraSystem?SYSTEM+'\n\n'+extraSystem:SYSTEM,messages})}).catch(()=>{throw new Error('Serveur IA injoignable. Vérifiez votre connexion.')});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||('Erreur du serveur IA ('+r.status+').'));
      return j.text||'';
    }
  };
})();

Tabs.ia=(()=>{
  let el,convs=[],cur=null,busy=false,img=null;
  const key=()=>'lsg:ia:'+App.uid;
  const save=()=>{convs=convs.filter(c=>c.msgs.length).slice(0,30);if(!jset(key(),convs.map(c=>({...c,msgs:c.msgs.map(m=>({...m,img:undefined}))}))))toast('Historique IA trop volumineux.')};
  const SUGG=[
    ['✍️','Écris un message d\'anniversaire chaleureux pour ma sœur'],
    ['🌍','Traduis « On se voit demain au marché » en lingala et en anglais'],
    ['📸','Propose 5 légendes originales pour une photo de coucher de soleil sur le fleuve'],
    ['💡','Donne-moi des idées de vidéos courtes amusantes à tourner'],
    ['📝','Aide-moi à écrire une publication pour annoncer l\'ouverture de ma boutique'],
    ['🔒','Comment protéger mon compte Lisanga ?']
  ];

  function mount(v){
    el=v;convs=jget(key(),[]);cur={id:newId(),title:'',msgs:[],at:Date.now()};
    el.innerHTML='<header class="pane-h"><div><h1 class="brand-t">IA</h1><small class="muted">'+(AI.online?'<span class="dot ok"></span> Lisa · propulsée par Claude':'<span class="dot"></span> Mode hors ligne')+'</small></div><div class="row"><button class="ibtn" data-a="hist" aria-label="Historique">'+icon('clock')+'</button><button class="ibtn" data-a="new" aria-label="Nouvelle conversation">'+icon('edit')+'</button></div></header>'+
      '<div class="ia-body" data-body></div>'+
      '<div class="ia-img" data-img hidden></div>'+
      '<form class="composer ia-comp"><button type="button" class="ibtn" data-a="img" aria-label="Joindre une photo">'+icon('image')+'</button><textarea rows="1" name="q" placeholder="Demandez à Lisa…" maxlength="8000"></textarea><button class="send-btn" aria-label="Envoyer">'+icon('send')+'</button></form>';
    draw();
    const f=el.querySelector('form'),ta=f.q;
    ta.oninput=()=>{ta.style.height='auto';ta.style.height=Math.min(160,ta.scrollHeight)+'px'};
    ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&matchMedia('(pointer:fine)').matches){e.preventDefault();f.requestSubmit()}};
    f.onsubmit=e=>{e.preventDefault();const q=ta.value.trim();if(!q&&!img)return;ta.value='';ta.oninput();send(q||'Décris cette image.')};
    el.onclick=async e=>{
      const a=e.target.closest('[data-a]');
      if(a&&a.dataset.a==='new'){cur={id:newId(),title:'',msgs:[],at:Date.now()};draw()}
      if(a&&a.dataset.a==='hist')history();
      if(a&&a.dataset.a==='img'){const fl=await pickFile('image/*');if(!fl)return;const b=await compressImage(fl,1024,.8);img=await blobToDataURL(b);const box=el.querySelector('[data-img]');box.hidden=false;box.innerHTML='<img src="'+img+'" alt=""><button type="button" class="ibtn sm" data-a="noimg">'+icon('close')+'</button>'}
      if(a&&a.dataset.a==='noimg'){img=null;el.querySelector('[data-img]').hidden=true}
      const s=e.target.closest('[data-s]');if(s)send(s.dataset.s);
      const c=e.target.closest('[data-copy]');if(c){navigator.clipboard&&navigator.clipboard.writeText(cur.msgs[+c.dataset.copy].text);toast('Copié.')}
      const sh=e.target.closest('[data-share]');if(sh){const t=cur.msgs[+sh.dataset.share].text;const ch=await Chat.pickChat('Envoyer la réponse à…');if(ch){await Chat.send(ch,{kind:'text',t});toast('Envoyé.')}}
    };
  }
  function unmount(){el=null}

  function draw(){
    const b=el.querySelector('[data-body]');
    if(!cur.msgs.length){
      b.innerHTML='<div class="ia-hello"><div class="ia-orb">'+icon('spark')+'</div><h2>Bonjour '+esc(App.me.name.split(' ')[0])+' !</h2><p class="muted">Je suis Lisa. Je peux écrire, traduire, résumer, expliquer et vous donner des idées.</p><div class="ia-sugg">'+SUGG.map(([e,s])=>'<button data-s="'+esc(s)+'"><span>'+e+'</span>'+esc(s)+'</button>').join('')+'</div>'+(AI.online?'':'<p class="small muted mt">'+icon('info','xs')+' Assistant complet non configuré : voir GUIDE.md, étape « IA ».</p>')+'</div>';
      return;
    }
    b.innerHTML=cur.msgs.map((m,i)=>m.role==='user'?'<div class="ia-msg user">'+(m.img?'<img src="'+m.img+'" alt="">':'')+'<div>'+esc(m.text).replace(/\n/g,'<br>')+'</div></div>':'<div class="ia-msg bot"><div class="ia-av">'+icon('spark')+'</div><div class="ia-bub'+(m.err?' err':'')+'"><div class="ai-md">'+miniMd(m.text)+'</div>'+(m.err?'':'<div class="ia-act"><button data-copy="'+i+'">'+icon('copy','xs')+' Copier</button><button data-share="'+i+'">'+icon('send','xs')+' Envoyer dans Chat</button></div>')+'</div></div>').join('')+(busy?'<div class="ia-msg bot"><div class="ia-av">'+icon('spark')+'</div><div class="ia-bub"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>':'');
    b.scrollTop=b.scrollHeight;
  }
  async function send(q){
    if(busy||!el)return;
    if(!(await AI.consent()))return;
    const m={role:'user',text:q};if(img){m.img=img;img=null;el.querySelector('[data-img]').hidden=true}
    cur.msgs.push(m);if(!cur.title)cur.title=q.slice(0,60);
    busy=true;draw();
    const api=cur.msgs.filter(x=>!x.err).slice(-20).map(x=>{
      if(x.role==='user'&&x.img)return {role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:x.img.split(',')[1]}},{type:'text',text:x.text}]};
      return {role:x.role,content:x.text};
    });
    try{const t=await AI.ask(api);cur.msgs.push({role:'assistant',text:t||'(réponse vide)'})}
    catch(e){cur.msgs.push({role:'assistant',text:e.message,err:true})}
    busy=false;
    if(!convs.includes(cur))convs.unshift(cur);cur.at=Date.now();save();
    if(el)draw();
  }
  function history(){
    const m=Modal.open(sheetHead('Conversations avec Lisa')+'<div class="pick-list">'+(convs.length?convs.map((c,i)=>'<div class="li"><button class="li-t grow" data-o="'+i+'"><b>'+esc(c.title||'Conversation')+'</b><small>'+fmtDay(c.at)+' · '+c.msgs.length+' messages</small></button><button class="ibtn sm" data-d="'+i+'" aria-label="Supprimer">'+icon('trash')+'</button></div>').join(''):'<p class="empty">Aucune conversation enregistrée.</p>')+'</div>'+(convs.length?'<div class="pad"><button class="btn ghost block danger-t" data-all>Tout effacer</button></div>':''),{sheet:true});
    m.box.onclick=e=>{
      const o=e.target.closest('[data-o]');if(o){cur=convs[+o.dataset.o];m.close();draw()}
      const d=e.target.closest('[data-d]');if(d){convs.splice(+d.dataset.d,1);save();m.close();history()}
      if(e.target.closest('[data-all]')){convs=[];save();m.close();cur={id:newId(),title:'',msgs:[],at:Date.now()};draw()}
    };
  }
  /* Utilisé depuis Chat : « Demander à l'IA » */
  function ask(q){setTimeout(()=>{if(!el)return;const ta=el.querySelector('textarea');ta.value=q;ta.oninput();ta.focus()},50)}
  return {mount,unmount,ask};
})();
