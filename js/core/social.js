/* Lisanga — Liens sociaux (abonnements, blocages) et publications communes à Star, Fun et Publique */
'use strict';

const Social=(()=>{
  let mine=[],toMe=[];const subs=new Set();let offs=[];
  const fire=()=>subs.forEach(f=>f());
  return {
    start(uid){
      this.stop();
      offs.push(DB.watch('follows',{where:[['from','==',uid]]},l=>{mine=l;fire()}));
      offs.push(DB.watch('follows',{where:[['to','==',uid]]},l=>{
        const before=new Set(toMe.filter(f=>f.status==='pending').map(f=>f.id));
        toMe=l;fire();
        l.filter(f=>f.status==='pending'&&!before.has(f.id)&&Date.now()-f.at<15000).forEach(f=>toast(Users.peek(f.from).name+' souhaite vous suivre.'));
      }));
    },
    stop(){offs.forEach(f=>f());offs=[];mine=[];toMe=[]},
    on(f){subs.add(f);return ()=>subs.delete(f)},
    status(uid){const f=mine.find(x=>x.to===uid);return f?f.status:null},
    following(){return mine.filter(f=>f.status==='ok').map(f=>f.to)},
    followers(){return toMe.filter(f=>f.status==='ok').map(f=>f.from)},
    requests(){return toMe.filter(f=>f.status==='pending')},
    /* « Contact » d'une personne : elle me suit, ou nous avons une discussion */
    isContactOf(uid){return toMe.some(f=>f.from===uid&&f.status==='ok')||(typeof Chat!=='undefined'&&Chat.hasDirect(uid))},
    async follow(uid){
      const u=await Users.get(uid);
      const status=u&&u.privacy&&u.privacy.private?'pending':'ok';
      await DB.set('follows',App.uid+'_'+uid,{from:App.uid,to:uid,status,at:Date.now()});
      toast(status==='ok'?'Vous suivez '+u.name+'.':'Demande envoyée à '+u.name+'.');
    },
    async unfollow(uid){await DB.del('follows',App.uid+'_'+uid)},
    async accept(fromUid){await DB.update('follows',fromUid+'_'+App.uid,{status:'ok'})},
    async decline(fromUid){await DB.del('follows',fromUid+'_'+App.uid)},
    async counts(uid){
      const [a,b]=await Promise.all([DB.query('follows',{where:[['to','==',uid]]}),DB.query('follows',{where:[['from','==',uid]]})]);
      return {followers:a.filter(f=>f.status==='ok').length,following:b.filter(f=>f.status==='ok').length};
    },
    blocked(){return (App.me&&App.me.blocked)||[]},
    isBlocked(uid){return this.blocked().includes(uid)},
    blockedMe(uid){const u=Users.peek(uid);return !!(u.blocked||[]).includes(App.uid)},
    async block(uid){await DB.update('users',App.uid,{blocked:DB.union(uid)});await DB.del('follows',App.uid+'_'+uid).catch(()=>{});await DB.del('follows',uid+'_'+App.uid).catch(()=>{});toast('Utilisateur bloqué.')},
    async unblock(uid){await DB.update('users',App.uid,{blocked:DB.remove(uid)});toast('Utilisateur débloqué.')},
    /* Puis-je voir le contenu de cette personne ? */
    canSee(uid){
      if(uid===App.uid)return true;
      if(this.isBlocked(uid)||this.blockedMe(uid))return false;
      const u=Users.peek(uid);
      if(u.deleted)return false;
      if(u.privacy&&u.privacy.private)return this.status(uid)==='ok';
      return true;
    },
    async report(kind,targetId,owner){
      const reason=await new Promise(res=>{
        actionSheet(['Contenu inapproprié','Harcèlement','Arnaque ou fraude','Faux compte','Violence','Autre'].map(r=>({icon:'flag',label:r,fn:()=>res(r)})),'Pourquoi signalez-vous ceci ?');
      });
      await DB.add('reports',{kind,targetId,owner:owner||'',reason,by:App.uid,at:Date.now()});
      toast('Merci. Le signalement a été envoyé à la modération.');
    }
  };
})();

/* Publications : collections posts_pub (Publique), posts_star (Star), posts_fun (Fun) */
const Feed={
  REACTIONS:{like:'👍',love:'❤️',haha:'😆',wow:'😮',sad:'😢',angry:'😡'},
  async create(col,data){
    const id=await DB.add(col,{uid:App.uid,at:Date.now(),likes:{},comments:0,shares:0,views:0,...data});
    return id;
  },
  async react(col,post,value){
    const cur=(post.likes||{})[App.uid];
    await DB.update(col,post.id,{['likes.'+App.uid]:cur===value?DB.DEL:value});
  },
  likeCount(post){return Object.keys(post.likes||{}).length},
  async remove(col,post){
    if(!(await confirmBox('Supprimer cette publication ?','Supprimer',true)))return;
    await DB.del(col,post.id);if(post.mediaId)Media.remove(post.mediaId);toast('Publication supprimée.');
  },
  saved(){return (App.priv.saved||[])},
  async toggleSave(col,post){
    const key=col+':'+post.id;const on=this.saved().includes(key);
    await DB.set('private',App.uid,{saved:on?DB.remove(key):DB.union(key)},true);
    toast(on?'Retiré des enregistrements.':'Enregistré.');
  },
  /* Commentaires dans une feuille du bas */
  comments(col,post,onCount){
    const path=col+'/'+post.id+'/comments';
    const m=Modal.open(sheetHead('Commentaires')+'<div class="cm-list" data-list><div class="muted pad">Chargement…</div></div><form class="cm-form">'+avatar(App.me,32)+'<input class="inp" name="t" placeholder="Ajouter un commentaire…" autocomplete="off" maxlength="1000"><button class="ibtn brand" aria-label="Publier">'+icon('send')+'</button></form>',{sheet:true,cls:'comments',onClose:()=>off()});
    const list=m.box.querySelector('[data-list]');
    const off=DB.watch(path,{orderBy:['at','asc'],limit:500},items=>{
      items=items.filter(c=>Social.canSee(c.uid));
      list.innerHTML=items.length?items.map(c=>{const u=Users.peek(c.uid);return '<div class="cm">'+avatar(u,32)+'<div class="cm-b"><b data-profile="'+c.uid+'">'+esc(u.name)+'</b> <span class="muted small">'+ago(c.at)+'</span><div>'+richText(c.text)+'</div></div>'+((c.uid===App.uid||post.uid===App.uid)?'<button class="ibtn sm" data-del="'+c.id+'" aria-label="Supprimer">'+icon('trash')+'</button>':'')+'</div>'}).join(''):'<div class="empty small">Soyez le premier à commenter.</div>';
      list.scrollTop=list.scrollHeight;
    });
    list.addEventListener('click',async e=>{
      const d=e.target.closest('[data-del]');
      if(d){await DB.del(path,d.dataset.del);await DB.update(col,post.id,{comments:DB.inc(-1)});onCount&&onCount(-1)}
      const p=e.target.closest('[data-profile]');if(p){m.close();Profile.open(p.dataset.profile)}
    });
    m.box.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const t=e.target.t.value.trim();if(!t)return;e.target.t.value='';
      await DB.add(path,{uid:App.uid,text:t,at:Date.now()});
      await DB.update(col,post.id,{comments:DB.inc(1)});onCount&&onCount(1);
    };
  },
  /* Partager : envoyer dans une discussion ou republier sur Publique */
  share(col,post){
    actionSheet([
      {icon:'chat',label:'Envoyer dans une discussion',fn:()=>Chat.pickChat('Envoyer à…').then(async c=>{if(!c)return;await Chat.send(c,{kind:'post',t:post.text||'',post:{col,id:post.id,uid:post.uid}});await DB.update(col,post.id,{shares:DB.inc(1)});toast('Envoyé.')})},
      {icon:'repost',label:'Republier sur Publique',fn:async()=>{const t=await promptBox('Republier',{placeholder:'Ajoutez un mot (facultatif)',ok:'Republier'});if(t===null)return;await Feed.create('posts_pub',{text:t,repost:{col,id:post.id,uid:post.uid},visibility:'public'});await DB.update(col,post.id,{shares:DB.inc(1)});toast('Republié sur Publique.')}},
      {icon:'copy',label:'Copier le texte',fn:()=>{navigator.clipboard&&navigator.clipboard.writeText(post.text||'');toast('Copié.')}}
    ],'Partager');
  },
  postMenu(col,post){
    const mine=post.uid===App.uid;
    actionSheet([
      {icon:'bookmark',label:this.saved().includes(col+':'+post.id)?'Retirer des enregistrements':'Enregistrer',fn:()=>this.toggleSave(col,post)},
      {icon:'share',label:'Partager',fn:()=>this.share(col,post)},
      !mine&&{icon:'user',label:'Voir le profil',fn:()=>Profile.open(post.uid)},
      !mine&&{icon:'flag',label:'Signaler',danger:true,fn:()=>Social.report('post',col+'/'+post.id,post.uid)},
      !mine&&{icon:'block',label:'Bloquer '+Users.peek(post.uid).name,danger:true,fn:()=>Social.block(post.uid)},
      mine&&{icon:'trash',label:'Supprimer',danger:true,fn:()=>this.remove(col,post)}
    ]);
  },
  visible(list){return list.filter(p=>Social.canSee(p.uid)&&(p.visibility!=='followers'||p.uid===App.uid||Social.status(p.uid)==='ok'))}
};
