/* Lisanga — Outils communs : texte, dates, icônes, fenêtres, sons, images */
'use strict';

const APP_VERSION='1.0.0';
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const pad=n=>String(n).padStart(2,'0');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const NF=new Intl.NumberFormat('fr-FR');
const kfmt=n=>n>=1e6?(n/1e6).toFixed(1).replace('.0','')+' M':n>=1e4?Math.round(n/1e3)+' k':NF.format(n||0);
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
function lsDel(k){try{localStorage.removeItem(k)}catch(e){}}
function ssGet(k){try{return sessionStorage.getItem(k)}catch(e){return null}}
function ssSet(k,v){try{sessionStorage.setItem(k,v)}catch(e){}}
function ssDel(k){try{sessionStorage.removeItem(k)}catch(e){}}
const jget=(k,d)=>{try{const v=JSON.parse(lsGet(k));return v==null?d:v}catch(e){return d}};
const jset=(k,v)=>lsSet(k,JSON.stringify(v));

/* ---------- Dates ---------- */
function fmtTime(ts){return ts?new Date(ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}
function sameDay(a,b){a=new Date(a);b=new Date(b);return a.toDateString()===b.toDateString()}
function fmtDay(ts){
  const d=new Date(ts),now=new Date(),y=new Date(now-864e5);
  if(sameDay(d,now))return "Aujourd'hui";
  if(sameDay(d,y))return 'Hier';
  if(now-d<6*864e5)return d.toLocaleDateString('fr-FR',{weekday:'long'});
  return d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'});
}
function fmtListTime(ts){
  if(!ts)return '';
  const d=new Date(ts),now=new Date();
  if(sameDay(d,now))return fmtTime(ts);
  if(sameDay(d,new Date(now-864e5)))return 'Hier';
  if(now-d<6*864e5)return d.toLocaleDateString('fr-FR',{weekday:'short'});
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
function ago(ts){
  const s=Math.max(1,Math.round((Date.now()-ts)/1000));
  if(s<60)return "à l'instant";
  const m=Math.round(s/60);if(m<60)return m+' min';
  const h=Math.round(m/60);if(h<24)return h+' h';
  const d=Math.round(h/24);if(d<7)return d+' j';
  return new Date(ts).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
}
const fmtDur=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+pad(s%60)};
const fmtSize=b=>b<1024?b+' o':b<1048576?(b/1024).toFixed(0)+' Ko':(b/1048576).toFixed(1)+' Mo';

/* ---------- Texte enrichi léger (liens, gras, retours) ---------- */
function richText(t){
  let s=esc(t);
  s=s.replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  s=s.replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/_([^_\n]+)_/g,'<i>$1</i>').replace(/~([^~\n]+)~/g,'<s>$1</s>');
  s=s.replace(/(^|\s)#([\p{L}\p{N}_]+)/gu,'$1<span class="tag">#$2</span>').replace(/(^|\s)@([\p{L}\p{N}_.]+)/gu,'$1<span class="tag">@$2</span>');
  return s.replace(/\n/g,'<br>');
}
/* Markdown simple pour les réponses de l'IA */
function miniMd(t){
  const blocks=String(t||'').split(/```/);
  return blocks.map((b,i)=>{
    if(i%2)return '<pre><code>'+esc(b.replace(/^\w*\n/,''))+'</code></pre>';
    let s=esc(b);
    s=s.replace(/^### (.*)$/gm,'<h4>$1</h4>').replace(/^## (.*)$/gm,'<h4>$1</h4>').replace(/^# (.*)$/gm,'<h4>$1</h4>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/^(?:[-*] .*(?:\n|$))+/gm,m=>'<ul>'+m.trim().split('\n').map(l=>'<li>'+l.replace(/^[-*] /,'')+'</li>').join('')+'</ul>');
    s=s.replace(/^(?:\d+\. .*(?:\n|$))+/gm,m=>'<ol>'+m.trim().split('\n').map(l=>'<li>'+l.replace(/^\d+\. /,'')+'</li>').join('')+'</ol>');
    return s.replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>');
  }).join('');
}

/* ---------- Icônes (traits SVG maison) ---------- */
const ICONS={
  chat:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  star:'<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  fun:'<path d="M9 18.5a3.5 3.5 0 1 1 0-7h1V4h3.2a4.3 4.3 0 0 0 4.3 4.3V11a7 7 0 0 1-4.3-1.5v5.5A3.5 3.5 0 0 1 9.7 18.5z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 3 2.7 15 0 18M12 3c-2.7 3-2.7 15 0 18"/>',
  ai:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="7" y="7" width="10" height="10" rx="3"/><path d="M10 11h.01M14 11h.01M10 14h4"/>',
  spark:'<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M19 15c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  send:'<path d="M4 12 20 4l-6 16-2.5-6.5z"/><path d="m11.5 13.5 3-3"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  micoff:'<path d="M15 10V6a3 3 0 0 0-5.6-1.5M9 9v2a3 3 0 0 0 4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.4 5.2M18.5 11a6.4 6.4 0 0 1-.6 2.7M12 17.5V21M4 4l16 16"/>',
  phone:'<path d="M5 4h3.5l1.7 4.3-2.2 1.5a11 11 0 0 0 6.2 6.2l1.5-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4z"/>',
  video:'<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="m15.5 10.5 5-3v9l-5-3z"/>',
  videooff:'<path d="M3 6.5V16a2 2 0 0 0 2 2h9M8 6h5.5a2 2 0 0 1 2 2v4.5M15.5 10.5l5-3v9l-3.4-2M3 3l18 18"/>',
  hangup:'<path d="M3.5 14.5c4.8-4.6 12.2-4.6 17 0l-2 2.5-3.3-1.2-.3-2.6a10 10 0 0 0-5.8 0l-.3 2.6L5.5 17z"/>',
  flip:'<path d="M4 9a8 8 0 0 1 14.5-3M20 4v4h-4M20 15a8 8 0 0 1-14.5 3M4 20v-4h4"/>',
  screen:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M9.5 10l2.5-2.5 2.5 2.5M12 7.5v5"/>',
  clip:'<path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7.2"/>',
  camera:'<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8L10 4h4l1.7 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
  image:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 16-5-5-8.5 8.5"/>',
  file:'<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5"/>',
  pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  heart:'<path d="M12 20s-7.5-4.6-9-9.5C2 7 4.4 4 7.6 4c2 0 3.4 1.1 4.4 2.6C13 5.1 14.4 4 16.4 4 19.6 4 22 7 21 10.5 19.5 15.4 12 20 12 20z"/>',
  comment:'<path d="M20 11.5c0 4.2-3.6 7.5-8 7.5-1.3 0-2.6-.3-3.7-.8L4 19.5l1.2-3.8A7.2 7.2 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5z"/>',
  share:'<path d="M20 4 9.5 14.5M20 4l-6.5 16-4-5.5L4 10.5z"/>',
  repost:'<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
  bookmark:'<path d="M6.5 3.5h11V21L12 16.8 6.5 21z"/>',
  dots:'<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>',
  dotsh:'<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>',
  shield:'<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.4-4.4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1-4 4.2-6 8-6s7 2 8 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19.5c.8-3.5 3.4-5 6.5-5s5.7 1.5 6.5 5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.6c1.8.6 3 2.2 3.5 4.9"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  trash:'<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>',
  reply:'<path d="M9.5 6 4 11.5 9.5 17M4 11.5h10a6 6 0 0 1 6 6v1"/>',
  forward:'<path d="M14.5 6 20 11.5 14.5 17M20 11.5H10a6 6 0 0 0-6 6v1"/>',
  copy:'<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  check2:'<path d="m2.5 12.5 4.5 4.5 9.5-9.5M11.5 16.5l1 .5 9-9.5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9.5 2.5h5"/>',
  moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  logout:'<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16.5 5.5 12 10 7.5M5.5 12H16"/>',
  block:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  flag:'<path d="M5 21V4M5 4h11.5l-2 4 2 4H5"/>',
  volume:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/>',
  play:'<path d="M7 4.5v15l12.5-7.5z"/>',
  pause:'<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/>',
  music:'<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  edit:'<path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m14 6 4 4"/>',
  key:'<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.8-8.8M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  archive:'<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4"/>',
  text:'<path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/>',
  location:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  record:'<circle cx="12" cy="12" r="7"/>',
  stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  public:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 3 2.7 15 0 18M12 3c-2.7 3-2.7 15 0 18"/>'
};
function icon(n,cls){return '<svg class="ic '+(cls||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[n]||'')+'</svg>'}

/* ---------- Avatars ---------- */
const AV_COLORS=['#F2A541','#2EC4B6','#FF6B57','#9B6BFF','#5BC0EB','#E56399','#7BC950','#F4D35E'];
function hashStr(s){let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)}
function initials(n){return String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?'}
function avatar(u,size,extra){
  size=size||40;u=u||{};
  const st='width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*.38)+'px';
  const inner=u.avatar?'<img src="'+esc(u.avatar)+'" alt="">':esc(initials(u.name||u.username));
  return '<span class="av '+(extra||'')+'" style="'+st+';--avc:'+AV_COLORS[hashStr(u.uid||u.name)%AV_COLORS.length]+'">'+inner+'</span>';
}

/* ---------- Notifications à l'écran ---------- */
function toast(msg,kind){
  const r=$('#toast-root');if(!r)return;
  const el=document.createElement('div');el.className='toast '+(kind||'');el.textContent=msg;r.appendChild(el);
  setTimeout(()=>el.classList.add('out'),2800);setTimeout(()=>el.remove(),3300);
}

/* ---------- Fenêtres (modales et feuilles du bas) ---------- */
const Modal={
  stack:[],
  open(html,opts){
    opts=opts||{};
    const root=$('#modal-root');
    const w=document.createElement('div');
    w.className='modal-wrap '+(opts.sheet?'is-sheet ':'')+(opts.full?'is-full ':'')+(opts.cls||'');
    w.innerHTML='<div class="modal-back"></div><div class="modal" role="dialog" aria-modal="true">'+html+'</div>';
    root.appendChild(w);
    const m={el:w,box:w.querySelector('.modal'),onClose:opts.onClose,close:()=>Modal.close(m)};
    if(!opts.locked)w.querySelector('.modal-back').onclick=()=>m.close();
    w.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b&&w.contains(b))m.close()});
    Modal.stack.push(m);
    requestAnimationFrame(()=>w.classList.add('in'));
    const f=w.querySelector('[autofocus]');if(f)setTimeout(()=>f.focus(),60);
    return m;
  },
  close(m){
    m=m||Modal.stack[Modal.stack.length-1];if(!m||!m.el.isConnected)return;
    Modal.stack=Modal.stack.filter(x=>x!==m);
    m.el.classList.remove('in');setTimeout(()=>m.el.remove(),200);
    if(m.onClose)m.onClose();
  },
  closeAll(){[...Modal.stack].forEach(m=>Modal.close(m))}
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&Modal.stack.length&&!Modal.stack[Modal.stack.length-1].el.querySelector('[data-locked]'))Modal.close()});

function sheetHead(title,sub){return '<div class="sh-head"><div><h3>'+esc(title)+'</h3>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div><button class="ibtn" data-close aria-label="Fermer">'+icon('close')+'</button></div>'}

/* Menu d'actions : items = [{icon,label,danger,fn}] */
function actionSheet(items,title){
  const m=Modal.open((title?'<div class="as-title">'+esc(title)+'</div>':'')+'<div class="as-list">'+items.filter(Boolean).map((it,i)=>'<button class="as-item'+(it.danger?' danger':'')+'" data-i="'+i+'">'+icon(it.icon||'dots')+'<span>'+esc(it.label)+'</span></button>').join('')+'</div>',{sheet:true,cls:'as'});
  const list=items.filter(Boolean);
  m.box.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;m.close();list[+b.dataset.i].fn()});
  return m;
}
function confirmBox(text,okLabel,danger){
  return new Promise(res=>{
    let done=false;
    const m=Modal.open('<div class="pad"><p class="confirm-t">'+esc(text)+'</p><div class="row end gap"><button class="btn ghost" data-no>Annuler</button><button class="btn '+(danger?'danger':'primary')+'" data-ok>'+esc(okLabel||'Confirmer')+'</button></div></div>',{cls:'small',onClose:()=>{if(!done)res(false)}});
    m.box.querySelector('[data-no]').onclick=()=>{done=true;m.close();res(false)};
    m.box.querySelector('[data-ok]').onclick=()=>{done=true;m.close();res(true)};
  });
}
function promptBox(title,opts){
  opts=opts||{};
  return new Promise(res=>{
    let done=false;
    const m=Modal.open('<form class="pad"><h3>'+esc(title)+'</h3>'+(opts.hint?'<p class="muted small">'+esc(opts.hint)+'</p>':'')+'<input class="inp" name="v" '+(opts.type?'type="'+opts.type+'"':'')+' value="'+esc(opts.value||'')+'" placeholder="'+esc(opts.placeholder||'')+'" '+(opts.inputmode?'inputmode="'+opts.inputmode+'"':'')+' autocomplete="off" autofocus><div class="row end gap mt"><button type="button" class="btn ghost" data-no>Annuler</button><button class="btn primary">'+esc(opts.ok||'Valider')+'</button></div></form>',{cls:'small',onClose:()=>{if(!done)res(null)}});
    const f=m.box.querySelector('form');
    m.box.querySelector('[data-no]').onclick=()=>{done=true;m.close();res(null)};
    f.onsubmit=e=>{e.preventDefault();done=true;const v=f.v.value;m.close();res(v)};
  });
}

/* ---------- Sons générés (aucun fichier à télécharger) ---------- */
const Sound={
  ctx:null,
  ac(){if(!this.ctx)try{this.ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}return this.ctx},
  tone(freqs,dur,vol,type){
    const c=this.ac();if(!c)return;
    const t=c.currentTime;
    freqs.forEach((f,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type=type||'sine';o.frequency.value=f;
      g.gain.setValueAtTime(0,t+i*dur);g.gain.linearRampToValueAtTime(vol||.12,t+i*dur+.02);g.gain.exponentialRampToValueAtTime(.0001,t+(i+1)*dur);
      o.connect(g).connect(c.destination);o.start(t+i*dur);o.stop(t+(i+1)*dur+.05);
    });
  },
  message(){if(App.prefs().sounds!==false)this.tone([880,1320],.09,.08)},
  sent(){if(App.prefs().sounds!==false)this.tone([660],.06,.05)},
  ringTimer:null,
  ring(on,outgoing){
    clearInterval(this.ringTimer);this.ringTimer=null;
    if(!on)return;
    const play=()=>outgoing?this.tone([440,440],.35,.06):this.tone([784,988,784,988],.13,.12,'triangle');
    play();this.ringTimer=setInterval(play,outgoing?3000:1800);
  }
};

/* ---------- Images ---------- */
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
async function compressImage(file,max,q,filter){
  const url=URL.createObjectURL(file);
  try{
    const img=await loadImage(url);
    let w=img.naturalWidth,h=img.naturalHeight;const r=Math.min(1,(max||1600)/Math.max(w,h));w=Math.round(w*r);h=Math.round(h*r);
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const x=c.getContext('2d');if(filter)x.filter=filter;x.drawImage(img,0,0,w,h);
    return await new Promise(r2=>c.toBlob(r2,'image/jpeg',q||.82));
  }finally{URL.revokeObjectURL(url)}
}
async function squareThumb(file,size){
  const url=URL.createObjectURL(file);
  try{
    const img=await loadImage(url);const s=Math.min(img.naturalWidth,img.naturalHeight);
    const c=document.createElement('canvas');c.width=c.height=size;
    c.getContext('2d').drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,0,0,size,size);
    return c.toDataURL('image/jpeg',.85);
  }finally{URL.revokeObjectURL(url)}
}
function pickFile(accept,capture){
  return new Promise(res=>{
    const i=document.createElement('input');i.type='file';i.accept=accept||'*/*';if(capture)i.setAttribute('capture',capture);
    i.onchange=()=>res(i.files[0]||null);i.click();
  });
}
const b64=buf=>{const a=new Uint8Array(buf);let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return btoa(s)};
const unb64=s=>{const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a};
const blobToDataURL=blob=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob)});

/* Emojis courants */
const EMOJIS='😀 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😇 🙂 😉 😋 😜 🤔 🤗 🤫 😴 😮 😢 😭 😡 🤯 🥺 😅 🙏 👍 👎 👏 🙌 💪 👌 ✌️ 🤝 👀 💯 🔥 ✨ 🎉 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 ⭐ 🌍 🇨🇩 ⚽ 🎵 🎶 📷 🍕 🍗 🍺 ☕ 🎂 🎁 🌹 🌴 🚗 ✈️ 💼 📚 💡 ✅ ❌'.split(' ');
const QUICK_REACT=['❤️','😂','😮','😢','🙏','👍'];

/* Met à jour une liste en réutilisant les éléments inchangés (évite de relancer vidéos et images) */
function reconcile(box,items){
  const ex=new Map([...box.children].filter(n=>n.dataset&&n.dataset.key).map(n=>[n.dataset.key,n]));
  const out=items.map(it=>{
    let n=ex.get(it.key);
    if(!n||n.dataset.sig!==it.sig){const t=document.createElement('div');t.innerHTML=it.html;n=t.firstElementChild;n.dataset.key=it.key;n.dataset.sig=it.sig}
    return n;
  });
  box.replaceChildren(...out);
}
