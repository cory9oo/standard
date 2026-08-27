/* ==========================================================================
   STANDARD — a ledger of the self.
   One sealed closure. Nothing reaches global scope but ST.
   ========================================================================== */
(function () {
'use strict';

var SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
var SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';   /* public by design — every table sits behind RLS */

var sb = (window.__MOCK_SB) || window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
window.ST = { sb: sb };

var WD    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var WD2   = ['S','M','T','W','T','F','S'];
var MO    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var GRADE = [[97,'A+',5],[90,'A',4],[80,'B',3],[70,'C',2],[60,'D',1],[0,'F',0]];
var SKINS = ['statement','carbon','terminal','blueprint'];

var S = {
  me:null, priv0:null, habits:[], days:[], byDate:{},
  date:null, priv:null, sort:'order', find:'', removed:[], circle:null
};

/* ============================ helpers ============================ */
function el(i){ return document.getElementById(i); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dk(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dnum(k){ return new Date(k+'T12:00:00'); }
function today(){ return dk(new Date()); }
function shift(k,n){ var d=dnum(k); d.setDate(d.getDate()+n); return dk(d); }
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function fmt(m){ m=Math.round(m||0); if(!m) return '—';
  var h=Math.floor(m/60), r=m%60; return h? (h+'h'+(r?' '+r+'m':'')) : (r+'m'); }
function grade(p){ if(p==null) return ['—',null];
  for(var i=0;i<GRADE.length;i++) if(p>=GRADE[i][0]) return [GRADE[i][1],GRADE[i][2]];
  return ['F',0]; }
function gcol(p){ var g=grade(p); return g[1]==null?'var(--rule2)':'var(--g'+g[1]+')'; }
/* fills read as density, linear in the percentage, so 45 and 65 are not the same colour */
function dens(p){
  if(p==null) return 'var(--sunk)';
  var t=Math.round(8+clamp(p,0,100)*0.92);
  return 'color-mix(in srgb, var(--accent) '+t+'%, var(--sunk))';
}
function toast(t){ var n=el('toast'); n.textContent=t; n.classList.add('on');
  clearTimeout(toast._t); toast._t=setTimeout(function(){ n.classList.remove('on'); },1500); }

/* Habit names carry clock prefixes. The list is no longer ordered by time,
   so the prefix is dead weight on every row — strip it for display only. */
function label(n){
  return String(n||'')
    .replace(/^\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*(?:[-–—]\s*\d{1,2}(:\d{2})?\s*(am|pm)?)?\s*/i,'')
    .replace(/\s+/g,' ').trim() || String(n||'');
}
/* Retained only for the "next up" marker — the clock still exists in the data. */
function startMin(n){
  var m=String(n||'').match(/^\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if(!m) return null;
  var h=+m[1], mi=+m[2], ap=(m[3]||'').toLowerCase();
  if(ap==='pm'&&h<12) h+=12; if(ap==='am'&&h===12) h=0;
  if(!ap && h<5) h+=12;
  return h*60+mi;
}
function skin(s){
  if(SKINS.indexOf(s)<0) s='statement';
  document.documentElement.setAttribute('data-skin',s);
  try{ localStorage.setItem('st.skin',s); }catch(e){}
  var m=document.querySelector('meta[name=theme-color]');
  if(m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()||'#F4F3EF');
  paintSkins();
}
function paintSkins(){
  var cur=document.documentElement.getAttribute('data-skin')||'statement';
  el('skins').innerHTML = SKINS.map(function(s){
    return '<button class="sw" data-skin="'+s+'" aria-pressed="'+(s===cur)+'" title="'+s+'" '+
      'style="background:'+skinSwatch(s)+'"></button>';
  }).join('');
}
function skinSwatch(s){
  return { statement:'#F4F3EF', carbon:'#0F1012', terminal:'#0A0A08', blueprint:'#0B1220' }[s];
}

/* ============================ selectors ============================ */
function daily(){ return S.habits.filter(function(h){ return h.cadence!=='weekly'; }); }
function weekly(){ return S.habits.filter(function(h){ return h.cadence==='weekly'; }); }
function ckOf(k){ var r=S.byDate[k]; return (r&&r.checked)||{}; }
function pctOf(ck,ids){ if(!ids||!ids.length) return 0; var n=0;
  for(var i=0;i<ids.length;i++) if(ck[ids[i]]) n++;
  return Math.round(n/ids.length*100); }
function weekDone(hid,k){
  var d=dnum(k), mon=new Date(d); mon.setDate(d.getDate()-((d.getDay()+6)%7));
  for(var i=0;i<7;i++){ var c=new Date(mon); c.setDate(mon.getDate()+i);
    if(c>d) break; if(ckOf(dk(c))[hid]) return true; }
  return false;
}
function doneOn(h,k){ return h.cadence==='weekly' ? weekDone(h.id,k) : !!ckOf(k)[h.id]; }
function rolling(n,upto){
  var end=upto||today(), a=[];
  for(var i=n-1;i>=0;i--){ var k=shift(end,-i), r=S.byDate[k];
    if(r&&r.pct!=null&&k<=today()) a.push(r.pct); }
  if(!a.length) return null;
  return Math.round(a.reduce(function(x,y){return x+y;},0)/a.length);
}
function committed(){ return daily().reduce(function(t,h){ return t+(h.minutes||0); },0); }
function remaining(k){
  var ck=ckOf(k);
  return daily().reduce(function(t,h){ return t+(ck[h.id]?0:(h.minutes||0)); },0);
}
function currentStreak(){
  var n=0,k=today();
  if(!S.byDate[k]||S.byDate[k].pct==null||S.byDate[k].pct<80) k=shift(k,-1);
  while(S.byDate[k]&&S.byDate[k].pct!=null&&S.byDate[k].pct>=80){ n++; k=shift(k,-1); }
  return n;
}
function dates(){ return S.days.map(function(d){return d.date;}).filter(function(k){return k<=today();}).sort(); }

/* ============================ data ============================ */
async function load(){
  var u=(await sb.auth.getUser()).data.user;
  if(!u){ authScreen(); return false; }
  var uid=u.id;
  var p  = await sb.from('profiles').select('id,display_name,handle').eq('id',uid).maybeSingle();
  var pp = await sb.from('profile_private').select('birth_date').eq('id',uid).maybeSingle();
  S.me = p.data || { id:uid, display_name:(u.email||'').split('@')[0], handle:null };
  S.me.id = uid; S.me.email = u.email;
  S.priv0 = pp.data || {};

  var h = await sb.from('habits').select('id,name,group_name,cadence,tier,minutes,link,sort_order')
    .eq('user_id',uid).eq('active',true).order('sort_order');
  S.habits = (h.data||[]).map(function(x,i){ if(x.sort_order==null) x.sort_order=i; return x; });

  var d = await sb.from('days').select('date,checked,active_set,pct,floor_pct').eq('user_id',uid).order('date');
  S.days = d.data||[];
  S.byDate = {}; S.days.forEach(function(r){ S.byDate[r.date]=r; });
  if(!S.date) S.date = today();
  if(!S.byDate[S.date]) S.byDate[S.date]={ date:S.date, checked:{}, pct:0 };
  await loadPriv();
  return true;
}
async function loadPriv(){
  var r = await sb.from('day_private').select('rating,why,tasks,prayer')
    .eq('user_id',S.me.id).eq('date',S.date).maybeSingle();
  S.priv = r.data || null;
}
var saveT=null;
function queueSave(){ clearTimeout(saveT); saveT=setTimeout(saveDay,450); }
async function saveDay(){
  var r=S.byDate[S.date], ids=daily().map(function(h){return h.id;});
  r.pct = pctOf(r.checked||{}, ids);
  var res = await sb.from('days').upsert({
    user_id:S.me.id, date:S.date, checked:r.checked||{},
    active_set:ids, pct:r.pct
  },{ onConflict:'user_id,date' });
  if(res.error) toast('not saved'); 
}

/* ============================ paint: masthead ============================ */
function paintMast(){
  var d=dnum(S.date), t=(S.date===today());
  el('mDate').textContent = WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+(t?'':' · logging back');
  var r=S.byDate[S.date]||{}, ids=daily().map(function(h){return h.id;});
  var pct=pctOf(r.checked||{},ids), g=grade(pct);
  var wk=weekly(), wkDone=wk.filter(function(h){return weekDone(h.id,S.date);}).length;
  var r7=rolling(7), r30=rolling(30), r90=rolling(90);
  var com=committed(), rem=remaining(S.date);
  var st=currentStreak();
  var done=ids.filter(function(i){return (r.checked||{})[i];}).length;

  el('tape').innerHTML =
    tp('Today', '<span style="color:'+gtxt(pct)+'">'+pct+'%</span><s>'+g[0]+'</s>') +
    tp('Done',  done+'<s>of '+ids.length+'</s>') +
    tp('Left today', fmt(rem)+'<s>of '+fmt(com)+'</s>') +
    tp('7-day',  (r7==null?'—':r7+'%')+'<s>'+(r7==null?'':grade(r7)[0])+'</s>') +
    tp('30-day', (r30==null?'—':r30+'%')) +
    tp('90-day', (r90==null?'—':r90+'%')) +
    tp('Streak', st+'<s>d ≥80%</s>') +
    tp('Weekly', wkDone+'<s>of '+wk.length+'</s>') +
    tp('Logged', dates().length+'<s>days</s>');
}
function tp(k,v){ return '<div class="tp"><div class="k">'+k+'</div><div class="v num">'+v+'</div></div>'; }

/* ============================ paint: rail ============================ */
function paintRail(){
  var h='';
  for(var i=13;i>=0;i--){
    var k=shift(today(),-i), d=dnum(k), r=S.byDate[k];
    var p=(r&&r.pct!=null)?r.pct:null;
    h+='<button data-d="'+k+'" class="'+(k===S.date?'sel':'')+'">'+
       '<div class="wd">'+WD[d.getDay()]+'</div><div class="dd num">'+d.getDate()+'</div>'+
       '<div class="pip" style="background:'+(p==null?'var(--rule2)':dens(p))+'"></div></button>';
  }
  el('rail').innerHTML=h;
  var n=el('rail'), s=n.querySelector('.sel');
  if(s && n.scrollWidth>n.clientWidth+4) s.scrollIntoView({block:'nearest',inline:'center'});
}

/* ============================ paint: the log ============================ */
function adherence30(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return null;
  var n=0,t=0;
  for(var i=0;i<30;i++){
    var k=shift(today(),-i); if(!S.byDate[k]) continue;
    t++; if(doneOn(h,k)) n++;
  }
  return t? Math.round(n/t*100) : null;
}
function nextId(){
  if(S.date!==today()) return null;
  var now=new Date(), m=now.getHours()*60+now.getMinutes(), ck=ckOf(S.date);
  var best=null,bd=1e9;
  daily().forEach(function(h){
    if(ck[h.id]) return;
    var s=startMin(h.name); if(s==null) return;
    var d=Math.abs(s-m); if(s<=m+15 && d<bd){ bd=d; best=h.id; }
  });
  return best;
}
function paintLog(){
  var ck=ckOf(S.date), nx=nextId(), q=S.find.toLowerCase();
  var list=S.habits.slice();

  if(q) list=list.filter(function(h){ return (h.name+' '+(h.group_name||'')).toLowerCase().indexOf(q)>=0; });

  if(S.sort==='order')  list.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='undone') list.sort(function(a,b){
    var da=doneOn(a,S.date)?1:0, db=doneOn(b,S.date)?1:0;
    return da-db || (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='weak')   list.sort(function(a,b){
    var aa=adherence30(a.id), ba=adherence30(b.id);
    return (aa==null?101:aa)-(ba==null?101:ba); });
  if(S.sort==='heavy')  list.sort(function(a,b){ return (b.minutes||0)-(a.minutes||0); });

  el('log').className = 'log'+(list.length>16?' split':'');
  el('log').innerHTML = list.map(function(h){
    var on = doneOn(h,S.date);
    var ad = adherence30(h.id);
    return '<button class="li'+(on?' on':'')+(h.id===nx?' nx':'')+'" data-h="'+h.id+'">'+
      '<span class="bx"></span>'+
      '<span class="nm">'+esc(label(h.name))+'</span>'+
      (h.link?'<span class="lk"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7L11.5 5"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19"/></svg></span>':'')+
      (h.cadence==='weekly'?'<span class="wk">WEEKLY</span>':'')+
      '<span class="mn">'+(h.minutes?h.minutes+'m':'—')+'</span>'+
      '<span class="ad" style="color:'+gtxt(ad)+'">'+(ad==null?'—':ad+'%')+'</span>'+
      '</button>';
  }).join('') || '<div class="empty">Nothing matches.</div>';

  var ids=daily().map(function(x){return x.id;});
  var done=ids.filter(function(i){return ck[i];}).length;
  el('logC').textContent = done+' / '+ids.length+' · '+fmt(remaining(S.date))+' left';
  el('dayNote').innerHTML = S.priv&&S.priv.why ? '<b>Note.</b> '+esc(S.priv.why) : '';
}

function toggle(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return;
  var r=S.byDate[S.date] || (S.byDate[S.date]={date:S.date,checked:{},pct:0});
  r.checked = r.checked || {};
  if(h.cadence==='weekly'){
    /* a weekly is credited on the day it is actually done */
    if(r.checked[hid]) delete r.checked[hid];
    else if(weekDone(hid,S.date)){ toast('already done this week'); return; }
    else r.checked[hid]=true;
  } else {
    if(r.checked[hid]) delete r.checked[hid]; else r.checked[hid]=true;
  }
  queueSave(); paintMast(); paintLog(); paintRail(); paintRight();
}

/* ============================ instruments ============================ */
function fitSvg(id,h){
  var n=el(id), w=Math.max(240,Math.round(n.clientWidth||n.parentNode.clientWidth||340));
  n.setAttribute('viewBox','0 0 '+w+' '+h);
  n.setAttribute('preserveAspectRatio','xMinYMin meet');
  n.setAttribute('height',h); n.style.height=h+'px';
  return w;
}
/* fills use the density ramp; text uses ink / bad / good only */
function gtxt(p){ return p==null?'var(--ink3)':(p<50?'var(--bad)':(p>=90?'var(--good)':'var(--ink)')); }
function paintRight(){
  paintSankey(); paintHeat(); paintChart(); paintMomo(); paintDow(); paintGdist();
  paintPerHabit(); paintScatter(); paintStreaks(); paintGroups(); paintTLedger(); paintLife();
}

/* ---- where the day goes: a true two-stage flow ---- */
function paintSankey(){
  var H=156, W=fitSvg('sank',H), X=2, T1=34, BH=30, T2=110, ck=ckOf(S.date);
  var day=1440, com=committed();
  if(!com){ el('sank').innerHTML='<text x="2" y="20">No minutes priced yet — set them in Settings.</text>'; return; }

  var gs={}, order=[];
  daily().forEach(function(h){
    var g=h.group_name||'Other'; if(!gs[g]){ gs[g]={m:0,d:0}; order.push(g); }
    gs[g].m+=(h.minutes||0); if(ck[h.id]) gs[g].d+=(h.minutes||0);
  });
  order=order.filter(function(g){ return gs[g].m>0; });

  var px=(W-X*2)/com, s='', x=X, seg=[];
  order.forEach(function(g,i){
    var w=gs[g].m*px;
    seg.push({g:g,x:x,w:w,m:gs[g].m,d:gs[g].d});
    s+='<rect x="'+x.toFixed(1)+'" y="'+T1+'" width="'+Math.max(w-1,.6).toFixed(1)+'" height="'+BH+
       '" fill="var(--accent)" opacity="'+(0.92-0.17*i).toFixed(2)+'"/>';
    if(w>78)      s+='<text x="'+(x+1)+'" y="'+(T1-7)+'" class="b">'+esc(g)+' · '+fmt(gs[g].m)+'</text>';
    else if(w>34) s+='<text x="'+(x+1)+'" y="'+(T1-7)+'" class="b">'+esc(g.slice(0,4))+'</text>';
    x+=w;
  });

  var done=order.reduce(function(t,g){return t+gs[g].d;},0), miss=com-done;
  var dW=done*px, mW=miss*px;
  s+='<rect x="'+X+'" y="'+T2+'" width="'+Math.max(dW-1,.6).toFixed(1)+'" height="'+BH+'" fill="var(--accent)"/>';
  s+='<rect x="'+(X+dW).toFixed(1)+'" y="'+T2+'" width="'+Math.max(mW,.6).toFixed(1)+'" height="'+BH+
     '" fill="var(--sunk)" stroke="var(--rule2)" stroke-dasharray="2 2"/>';

  var dx=X, mx=X+dW;
  seg.forEach(function(p){
    if(p.d>0){ var w=p.d*px; s+=rib(p.x,w,dx,w,T1+BH,T2,'var(--accent)',0.22); dx+=w; }
    var mm=p.m-p.d;
    if(mm>0){ var w2=mm*px; s+=rib(p.x+p.d*px,w2,mx,w2,T1+BH,T2,'var(--ink3)',0.09); mx+=w2; }
  });

  s+='<text x="'+X+'" y="12" class="b">'+fmt(com)+' committed</text>'+
     '<text x="'+(W-X)+'" y="12" text-anchor="end">'+Math.round(com/day*100)+'% of 24h · '+fmt(day-com)+' unclaimed</text>';
  s+='<text x="'+X+'" y="'+(T2+BH+15)+'" class="b" fill="var(--accent)">Done '+fmt(done)+'</text>'+
     '<text x="'+(W-X)+'" y="'+(T2+BH+15)+'" text-anchor="end">Missed '+fmt(miss)+'</text>';
  el('sank').innerHTML=s;
}
function rib(x1,w1,x2,w2,y1,y2,fill,op){
  var m=(y1+y2)/2;
  return '<path d="M'+x1+','+y1+' C'+x1+','+m+' '+x2+','+m+' '+x2+','+y2+
    ' L'+(x2+w2)+','+y2+' C'+(x2+w2)+','+m+' '+(x1+w1)+','+m+' '+(x1+w1)+','+y1+' Z" fill="'+fill+
    '" opacity="'+op+'" stroke="var(--rule)" stroke-width=".5"/>';
}

/* ---- record: 52-week heat ---- */
function paintHeat(){
  var end=dnum(today()), all=dates();
  var start=new Date(end); start.setDate(end.getDate()-363);
  if(all.length){ var f=dnum(all[0]); f.setDate(f.getDate()-7); if(f>start) start=f; }
  start.setDate(start.getDate()-((start.getDay()+6)%7));       /* back to a Monday */

  var cells='', cols=[], d=new Date(start);
  while(d<=end){
    cols.push(new Date(d));                                     /* the Monday of this column */
    for(var wd=0;wd<7;wd++){
      if(d>end){ cells+='<i style="background:transparent"></i>'; d.setDate(d.getDate()+1); continue; }
      var k=dk(d), r=S.byDate[k], p=(r&&r.pct!=null)?r.pct:null;
      cells+='<i class="'+(k===today()?'tdy':'')+'" style="background:'+dens(p)+
             '" title="'+k+(p==null?'':' · '+p+'%')+'"></i>';
      d.setDate(d.getDate()+1);
    }
  }
  el('heat').innerHTML=cells;

  /* month strip: one span per month, exact column pitch, so it stays aligned */
  var PITCH=11, mh='', run=0, cur=cols.length?cols[0].getMonth():0;
  for(var i=0;i<=cols.length;i++){
    var m=(i<cols.length)?cols[i].getMonth():-1;
    if(m!==cur){
      var w=run*PITCH;
      mh+='<span style="width:'+w+'px">'+(w>=28?MO[cur]:'')+'</span>';
      cur=m; run=0;
    }
    run++;
  }
  el('mrow').innerHTML=mh;
  el('heatC').textContent=all.length+' days logged · '+(rolling(365)||0)+'% mean';
}

/* ---- trend ---- */
function paintChart(){
  var N=90, H=118, W=fitSvg('chart',H), pts=[], i, any=false;
  for(i=N-1;i>=0;i--){
    var k=shift(today(),-i), r=S.byDate[k];
    pts.push(r&&r.pct!=null?r.pct:null); if(r&&r.pct!=null) any=true;
  }
  if(!any){ el('chart').innerHTML='<text x="6" y="20">Not enough logged days yet.</text>'; return; }
  var px=function(i){ return 24+i*(W-32)/(N-1); }, py=function(v){ return H-16-(v/100)*(H-28); };
  var s='';
  [0,50,100].forEach(function(v){
    s+='<line class="ax" x1="22" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
       '<text x="18" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>';
  });
  var d='',a='',open=false, first=null,lastX=null;
  pts.forEach(function(v,i){
    if(v==null){ open=false; return; }
    var X=px(i),Y=py(v);
    d += (open?' L':' M')+X.toFixed(1)+','+Y.toFixed(1);
    if(first==null) first=X; lastX=X; open=true;
  });
  if(first!=null){
    a='M'+first+','+py(0)+' ';
    pts.forEach(function(v,i){ if(v!=null) a+='L'+px(i).toFixed(1)+','+py(v).toFixed(1)+' '; });
    a+='L'+lastX+','+py(0)+' Z';
    s+='<path class="ar" d="'+a+'"/>';
  }
  s+='<path class="ln" d="'+d+'"/>';
  var m30=rolling(30); if(m30!=null)
    s+='<line x1="22" y1="'+py(m30)+'" x2="'+(W-4)+'" y2="'+py(m30)+'" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="3 3"/>';
  el('chart').innerHTML=s;
  el('trendC').textContent='90 days · 30d mean '+(m30==null?'—':m30+'%');
}

/* ---- momentum ---- */
function paintMomo(){
  var a=rolling(7), b=rolling(7, shift(today(),-7));
  var d=(a==null||b==null)?null:a-b;
  var proj=null;
  if(a!=null&&d!=null) proj=clamp(a+d,0,100);
  el('momo').innerHTML='<table class="kv">'+
    kv('This 7 days', a==null?'—':a+'%') +
    kv('Prior 7 days', b==null?'—':b+'%') +
    kv('Change', d==null?'—':'<span style="color:'+(d>=0?'var(--good)':'var(--bad)')+'">'+(d>0?'+':'')+d+' pts</span>') +
    kv('If it holds', proj==null?'—':proj+'% next week') +
    '</table>';
}
function kv(k,v){ return '<tr><td class="k">'+k+'</td><td class="v">'+v+'</td></tr>'; }

/* ---- day of week ---- */
function paintDow(){
  var sum=[0,0,0,0,0,0,0], n=[0,0,0,0,0,0,0];
  S.days.forEach(function(r){ if(r.pct==null||r.date>today()) return;
    var w=dnum(r.date).getDay(); sum[w]+=r.pct; n[w]++; });
  var v=sum.map(function(s,i){ return n[i]?Math.round(s/n[i]):null; });
  var mx=Math.max.apply(null,v.map(function(x){return x||0;}))||100;
  var idx=[1,2,3,4,5,6,0];
  el('dow').innerHTML = idx.map(function(i){
    var p=v[i], h=p==null?0:Math.max(2,Math.round(p/mx*52));
    return '<div class="c"><b style="color:'+gtxt(p)+'">'+(p==null?'—':p)+'</b><i style="height:'+h+'px;background:'+dens(p)+'"></i><u>'+WD2[i]+'</u></div>';
  }).join('');
}

/* ---- grade distribution ---- */
function paintGdist(){
  var b=[0,0,0,0,0,0];
  S.days.forEach(function(r){ if(r.pct==null||r.date>today()) return; b[grade(r.pct)[1]]++; });
  var mx=Math.max.apply(null,b)||1, tot=b.reduce(function(x,y){return x+y;},0);
  var names=['F','D','C','B','A','A+'];
  el('gdist').innerHTML = names.map(function(nm,i){
    var h=Math.max(b[i]?3:1,Math.round(b[i]/mx*52));
    return '<div class="c"><b>'+(b[i]||'')+'</b><i style="height:'+h+'px;background:var(--g'+i+')'+(b[i]?'':';opacity:.25')+'"></i><u>'+nm+'</u></div>';
  }).join('');
  el('gdC').textContent = tot+' days';
}

/* ---- every standard, weakest first ---- */
function stats(){
  return S.habits.map(function(h){
    var n=0,t=0,cur=0,best=0,run=0,seen=false;
    for(var i=89;i>=0;i--){
      var k=shift(today(),-i); if(!S.byDate[k]) continue;
      if(i<30){ t++; if(doneOn(h,k)) n++; }
      seen=true;
      if(doneOn(h,k)){ run++; if(run>best) best=run; } else if(k!==today()) run=0;
    }
    cur=run;
    return { h:h, pct:t?Math.round(n/t*100):null, hits:n, of:t, cur:cur, best:best,
             mins:(h.minutes||0), cost:(h.minutes||0)*(t?n:0) };
  });
}
function paintPerHabit(){
  var a=stats().sort(function(x,y){ return (x.pct==null?101:x.pct)-(y.pct==null?101:y.pct); });
  el('perHabit').innerHTML='<div class="bars">'+a.map(function(s){
    var p=s.pct==null?0:s.pct;
    return '<div class="br"><span class="n">'+esc(label(s.h.name))+'</span>'+
      '<span class="t"><i style="width:'+p+'%;background:'+dens(s.pct)+'"></i></span>'+
      '<span class="p" style="color:'+gtxt(s.pct)+'">'+(s.pct==null?'—':p+'%')+'</span></div>';
  }).join('')+'</div>';
  var weak=a.filter(function(s){return s.pct!=null&&s.pct<50;}).length;
  el('phC').textContent = weak+' under 50% · weakest first';
}

/* ---- cost against adherence ---- */
function paintScatter(){
  var H=136,W=fitSvg('scat',H),a=stats().filter(function(s){ return s.mins>0 && s.pct!=null; });
  if(a.length<3){ el('scat').innerHTML='<text x="6" y="20">Price the standards to see this.</text>'; el('scatN').textContent=''; return; }
  var mx=Math.max.apply(null,a.map(function(s){return s.mins;}));
  var px=function(m){ return 30+(m/mx)*(W-44); }, py=function(p){ return H-20-(p/100)*(H-36); };
  var s='';
  [0,50,100].forEach(function(v){ s+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  a.forEach(function(p){
    s+='<circle cx="'+px(p.mins).toFixed(1)+'" cy="'+py(p.pct).toFixed(1)+'" r="'+
      (3+Math.min(4,p.mins/30)).toFixed(1)+'" fill="'+gcol(p.pct)+'" opacity=".78"><title>'+
      esc(label(p.h.name))+' · '+p.mins+'m · '+p.pct+'%</title></circle>';
  });
  s+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">minutes per day →</text>';
  el('scat').innerHTML=s;

  var heavy=a.filter(function(x){return x.mins>=30;}), light=a.filter(function(x){return x.mins<30;});
  var m=function(z){ return z.length?Math.round(z.reduce(function(t,x){return t+x.pct;},0)/z.length):null; };
  var hm=m(heavy), lm=m(light);
  el('scatN').innerHTML = (hm!=null&&lm!=null)
    ? 'Under 30 minutes you hold <b>'+lm+'%</b>. At 30 and over you hold <b>'+hm+'%</b>. '+
      (lm-hm>=8 ? 'The gap is <b>'+(lm-hm)+' points</b> — the failures are priced, not moral.' :
       'The gap is small; time is not what is stopping you.')
    : '';
}

/* ---- streaks ---- */
function paintStreaks(){
  var a=stats().sort(function(x,y){ return y.cur-x.cur || y.best-x.best; }).slice(0,12);
  el('streaks').innerHTML='<table class="kv">'+a.map(function(s){
    return '<tr><td class="k trunc">'+esc(label(s.h.name))+'</td><td class="v w" style="white-space:nowrap">'+
      '<b style="color:'+(s.cur>0?'var(--accent)':'var(--ink3)')+'">'+s.cur+'</b>'+
      '<span style="color:var(--ink3)"> · '+s.best+'</span></td></tr>';
  }).join('')+'</table>';
}

/* ---- by group ---- */
function paintGroups(){
  var g={},o=[];
  S.habits.forEach(function(h){ var k=h.group_name||'Other'; if(!g[k]){g[k]={n:0,t:0,m:0};o.push(k);} });
  for(var i=0;i<30;i++){
    var k=shift(today(),-i); if(!S.byDate[k]) continue;
    S.habits.forEach(function(h){ var kk=h.group_name||'Other';
      g[kk].t++; if(doneOn(h,k)) g[kk].n++; });
  }
  S.habits.forEach(function(h){ g[h.group_name||'Other'].m += (h.minutes||0); });
  el('groups').innerHTML='<div class="bars">'+o.map(function(k){
    var p=g[k].t?Math.round(g[k].n/g[k].t*100):0;
    return '<div class="br"><span class="n">'+esc(k)+' <span style="color:var(--ink3)">'+fmt(g[k].m)+'</span></span>'+
      '<span class="t"><i style="width:'+p+'%;background:'+dens(p)+'"></i></span>'+
      '<span class="p" style="color:'+gtxt(p)+'">'+p+'%</span></div>';
  }).join('')+'</div>';
}

/* ---- time ledger ---- */
function paintTLedger(){
  var com=committed(), spent=0, days=0;
  for(var i=0;i<30;i++){
    var k=shift(today(),-i), r=S.byDate[k]; if(!r) continue;
    days++;
    daily().forEach(function(h){ if(doneOn(h,k)) spent+=(h.minutes||0); });
  }
  var owed=com*days, lost=owed-spent;
  el('tledger').innerHTML='<table class="kv">'+
    kv('Committed per day', fmt(com)+' · '+Math.round(com/1440*100)+'% of 24h') +
    kv('Owed over '+days+' days', fmt(owed)) +
    kv('Actually spent', fmt(spent)) +
    kv('Unspent', '<span style="color:var(--bad)">'+fmt(lost)+'</span>') +
    kv('Per day unspent', fmt(days?lost/days:0)) +
    kv('Free hours left in a day', fmt(1440-com-480)+' <span style="color:var(--ink3)">after 8h sleep</span>') +
    '</table>';
}

/* ---- life ---- */
function paintLife(){
  var b=S.priv0&&S.priv0.birth_date;
  if(!b){ el('life').innerHTML=''; el('lifeC').textContent='add a birthday in settings'; return; }
  var born=new Date(b+'T12:00:00'), now=new Date();
  var lived=Math.floor((now-born)/6048e5), total=90*52;
  var h='';
  for(var i=0;i<total;i++) h+='<i class="'+(i<lived?'p':(i===lived?'n':''))+'"></i>';
  el('life').innerHTML=h;
  el('lifeC').textContent = lived.toLocaleString()+' of '+total.toLocaleString()+' weeks · '+
    Math.round(lived/total*100)+'% spent';
}

/* ---- circle ---- */
async function paintCircle(){
  var box=el('circle');
  try{
    var mine=await sb.from('circle_members').select('circle_id').eq('user_id',S.me.id);
    var ids=(mine.data||[]).map(function(r){return r.circle_id;});
    if(!ids.length){ box.innerHTML='<div class="empty">No circle yet. <b>Manage</b> to create or join one.</div>'; return; }
    var cs=await sb.from('circles').select('id,name,join_code').in('id',ids);
    var mem=await sb.from('circle_members').select('circle_id,user_id').in('circle_id',ids);
    var uids=(mem.data||[]).map(function(r){return r.user_id;});
    var pr=await sb.from('profiles').select('id,display_name,handle').in('id',uids);
    var pm={}; (pr.data||[]).forEach(function(p){ pm[p.id]=p; });
    var od=await sb.from('days').select('user_id,date,pct').in('user_id',uids).gte('date',shift(today(),-13));
    var by={}; (od.data||[]).forEach(function(r){ (by[r.user_id]=by[r.user_id]||{})[r.date]=r.pct; });
    S.circle=(cs.data||[])[0]||null;

    var h='';
    (cs.data||[]).forEach(function(c){
      var ms=(mem.data||[]).filter(function(m){return m.circle_id===c.id;});
      var rank=ms.map(function(m){
        var d=by[m.user_id]||{}, a=[];
        for(var i=6;i>=0;i--){ var v=d[shift(today(),-i)]; if(v!=null) a.push(v); }
        return { u:m.user_id, avg:a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null, d:d };
      }).sort(function(x,y){ return (y.avg||-1)-(x.avg||-1); });
      h+='<div class="sh" style="padding-top:0"><h2>'+esc(c.name)+'</h2><span class="ln"></span><span class="c">code '+esc(c.join_code||'')+'</span></div>';
      h+=rank.map(function(r,i){
        var p=pm[r.u]||{}, nm=p.display_name||p.handle||'member';
        return '<div class="mem"><span class="rk num">'+(i+1)+'</span>'+
          '<span class="nm">'+esc(nm)+(r.u===S.me.id?' <span style="color:var(--ink3)">· you</span>':'')+'</span>'+
          '<span class="spk">'+spark(r.d)+'</span>'+
          '<span class="pc" style="color:'+gtxt(r.avg)+'">'+(r.avg==null?'—':r.avg+'%')+'</span></div>';
      }).join('');
    });
    box.innerHTML=h;
  }catch(e){ box.innerHTML='<div class="empty">Circle unavailable.</div>'; }
}
function spark(d){
  var w=64,h=16,s='',n=14;
  for(var i=0;i<n;i++){
    var v=d[shift(today(),-(n-1-i))];
    var bh=v==null?1:Math.max(1,Math.round(v/100*h));
    s+='<rect x="'+(i*(w/n)).toFixed(1)+'" y="'+(h-bh)+'" width="'+(w/n-1).toFixed(1)+'" height="'+bh+
       '" fill="'+dens(v)+'"/>';
  }
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+s+'</svg>';
}

/* ============================ overlay ============================ */
function openOv(title,body,onOpen){
  el('ovBody').innerHTML='<div class="ovh"><h3>'+esc(title)+'</h3><span class="sp" style="flex:1"></span>'+
    '<button class="tbtn" data-x="1">Close</button></div>'+body;
  el('ov').classList.add('on'); el('ov').scrollTop=0;
  if(onOpen) onOpen();
}
function closeOv(){ el('ov').classList.remove('on'); }

/* ---- settings: everything editable lives here ---- */
function openSettings(){
  var GROUPS=['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var rows=S.habits.slice().sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);});
  S.edSrc=rows;
  function edRow(h,i){
    return '<div class="ed" data-i="'+i+'">'+
      '<button class="hnd" data-up="'+i+'" title="move up">↑</button>'+
      '<input class="en" value="'+esc(h.name)+'" placeholder="standard">'+
      '<input class="em num" type="number" min="0" step="5" value="'+(h.minutes||0)+'" title="minutes">'+
      '<select class="eg">'+GROUPS.map(function(g){
        return '<option'+(g===(h.group_name||'Other')?' selected':'')+'>'+g+'</option>'; }).join('')+'</select>'+
      '<select class="ec"><option value="daily"'+(h.cadence!=='weekly'?' selected':'')+'>Daily</option>'+
        '<option value="weekly"'+(h.cadence==='weekly'?' selected':'')+'>Weekly</option></select>'+
      '<button class="x" data-rm="'+i+'" title="archive">×</button></div>';
  }
  var body=
    '<div class="sh"><h2>The standards</h2><span class="ln"></span><span class="c">'+rows.length+' · edit anything</span></div>'+
    '<div class="tools" style="padding:0 0 8px">'+
      '<button class="btn" id="edAdd">+ Add</button>'+
      '<button class="btn" id="edStrip" title="Remove the 5:00 - 5:20 style prefixes">Strip clock times</button>'+
      '<span style="flex:1"></span>'+
      '<button class="btn pri" id="edSave">Save standards</button>'+
    '</div>'+
    '<div id="edList">'+rows.map(edRow).join('')+'</div>'+
    '<div class="tools" style="padding-top:10px">'+
      '<button class="btn" id="edAdd2">+ Add</button>'+
      '<span style="flex:1"></span>'+
      '<button class="btn pri" id="edSave2">Save standards</button>'+
    '</div>'+

    '<div class="sh"><h2>Look</h2><span class="ln"></span><span class="c">pick one</span></div>'+
    '<div class="tools">'+SKINS.map(function(s){
      return '<button class="tbtn" data-skin2="'+s+'">'+s+'</button>'; }).join('')+'</div>'+

    '<div class="sh"><h2>You</h2><span class="ln"></span><span class="c">'+esc(S.me.email||'')+'</span></div>'+
    '<label class="fld"><span class="lab">Display name</span><input id="pName" value="'+esc(S.me.display_name||'')+'"></label>'+
    '<label class="fld"><span class="lab">Birthday · powers the life grid</span><input id="pBirth" type="date" value="'+esc((S.priv0&&S.priv0.birth_date)||'')+'"></label>'+
    '<div class="tools"><button class="btn" id="pSave">Save profile</button></div>'+

    '<div class="sh"><h2>Take it with you</h2><span class="ln"></span><span class="c">outputs</span></div>'+
    '<div class="tools">'+
      '<button class="btn" id="xCsv">CSV · days</button>'+
      '<button class="btn" id="xCsvH">CSV · standards</button>'+
      '<button class="btn" id="xJson">JSON · everything</button>'+
      '<button class="btn" id="xPrint">Print report</button>'+
    '</div>'+

    '<div class="sh"><h2>Session</h2><span class="ln"></span><span class="c"></span></div>'+
    '<div class="tools"><button class="btn" id="bOut">Sign out</button></div>'+
    '<div class="note" style="padding:14px 0 0">Your data is yours. Every table is row-level locked to your account; nobody in a circle can see anything but a daily percentage.</div>';

  openOv('Settings',body,function(){
    var list=el('edList');
    list.addEventListener('click',function(e){
      var rm=e.target.closest('[data-rm]'), up=e.target.closest('[data-up]');
      if(rm){ var r=rm.closest('.ed'); r.classList.toggle('gone'); }
      if(up){ var r2=up.closest('.ed'), pv=r2.previousElementSibling; if(pv) list.insertBefore(r2,pv); }
    });
    var add=function(){
      var d=document.createElement('div'); d.innerHTML=edRow({name:'',minutes:0,group_name:'Standards',cadence:'daily'},999);
      list.appendChild(d.firstChild);
      list.lastChild.querySelector('.en').focus();
      list.lastChild.scrollIntoView({block:'center'});
    };
    el('edAdd').onclick=add; el('edAdd2').onclick=add;
    el('edSave').onclick=saveStandards; el('edSave2').onclick=saveStandards;
    el('edStrip').onclick=function(){
      var n=0;
      Array.prototype.forEach.call(list.querySelectorAll('.en'),function(inp){
        var v=label(inp.value); if(v!==inp.value){ inp.value=v; n++; }
      });
      toast(n?('stripped '+n+' — now save'):'nothing to strip');
    };
    el('pSave').onclick=saveProfile;
    el('xCsv').onclick=function(){ dl('standard-days.csv', csvDays()); };
    el('xCsvH').onclick=function(){ dl('standard-standards.csv', csvHabits()); };
    el('xJson').onclick=function(){ dl('standard.json', JSON.stringify({profile:S.me,habits:S.habits,days:S.days},null,2)); };
    el('xPrint').onclick=function(){ closeOv(); setTimeout(function(){ window.print(); },260); };
    el('bOut').onclick=async function(){ await sb.auth.signOut(); location.reload(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-skin2]'),function(b){
      b.onclick=function(){ skin(b.getAttribute('data-skin2')); };
    });
  });
}
async function saveStandards(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#edList .ed'));
  var order=0, ops=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i], id=(S.edSrc||[])[+r.getAttribute('data-i')] || null;
    var name=r.querySelector('.en').value.trim();
    var rec={ user_id:S.me.id, name:name,
      minutes:+r.querySelector('.em').value||0,
      group_name:r.querySelector('.eg').value,
      cadence:r.querySelector('.ec').value,
      sort_order:order++ };
    if(r.classList.contains('gone')){
      if(id) ops.push(sb.from('habits').update({active:false,archived_at:new Date().toISOString()}).eq('id',id.id));
      continue;
    }
    if(!name) continue;
    if(id) ops.push(sb.from('habits').update(rec).eq('id',id.id));
    else    ops.push(sb.from('habits').insert(rec));
  }
  await Promise.all(ops);
  toast('standards saved'); closeOv(); await load(); paintAll();
}
async function saveProfile(){
  var n=el('pName').value.trim(), b=el('pBirth').value||null;
  S.me.display_name=n;
  await sb.from('profiles').update({display_name:n}).eq('id',S.me.id);
  await sb.from('profile_private').upsert({id:S.me.id,birth_date:b},{onConflict:'id'});
  S.priv0=S.priv0||{}; S.priv0.birth_date=b;
  toast('profile saved'); paintLife();
}

/* ---- note ---- */
function openNote(){
  var p=S.priv||{};
  openOv('Note · '+S.date,
    '<label class="fld"><span class="lab">What happened</span><textarea id="nWhy" rows="5">'+esc(p.why||'')+'</textarea></label>'+
    '<label class="fld"><span class="lab">Rating 1–10</span><input id="nRate" type="number" min="1" max="10" value="'+esc(p.rating||'')+'"></label>'+
    '<div class="tools"><button class="btn pri blk" id="nSave">Save note</button></div>',
    function(){
      el('nSave').onclick=async function(){
        var rec={ user_id:S.me.id, date:S.date, why:el('nWhy').value, rating:+el('nRate').value||null };
        await sb.from('day_private').upsert(rec,{onConflict:'user_id,date'});
        S.priv=rec; toast('noted'); closeOv(); paintLog();
      };
    });
}

/* ---- circle manage ---- */
function openCircle(){
  openOv('Circle',
    '<div class="note" style="padding:8px 0 14px">A circle shows one number per person per day. Nothing else crosses.</div>'+
    '<label class="fld"><span class="lab">Join with a code</span><input id="cCode" placeholder="ABC123" autocapitalize="characters"></label>'+
    '<div class="tools"><button class="btn" id="cJoin">Join</button></div>'+
    '<label class="fld" style="margin-top:14px"><span class="lab">Or start one</span><input id="cName" placeholder="Name it"></label>'+
    '<div class="tools"><button class="btn pri" id="cMake">Create</button></div>'+
    '<div class="note" id="cMsg" style="padding-top:14px"></div>',
    function(){
      el('cJoin').onclick=async function(){
        var code=(el('cCode').value||'').trim().toUpperCase(); if(!code) return;
        try{ var r=await sb.rpc('join_circle',{code:code});
          if(r.error) throw r.error;
          closeOv(); await paintCircle(); toast('joined');
        }catch(e){ el('cMsg').textContent='No circle with that code.'; }
      };
      el('cMake').onclick=async function(){
        var n=(el('cName').value||'').trim(); if(!n) return;
        var code=Math.random().toString(36).slice(2,8).toUpperCase();
        var c=await sb.from('circles').insert({name:n,join_code:code,owner:S.me.id}).select('id').single();
        if(c.error){ el('cMsg').textContent='Could not create it.'; return; }
        await sb.from('circle_members').insert({circle_id:c.data.id,user_id:S.me.id});
        closeOv(); await paintCircle(); toast('code '+code);
      };
    });
}

/* ---- exports ---- */
function csvDays(){
  var ids=S.habits.map(function(h){return h.id;});
  var head=['date','pct','grade'].concat(S.habits.map(function(h){return '"'+label(h.name).replace(/"/g,'""')+'"';}));
  var out=[head.join(',')];
  dates().forEach(function(k){
    var r=S.byDate[k], ck=r.checked||{};
    out.push([k, r.pct==null?'':r.pct, r.pct==null?'':grade(r.pct)[0]]
      .concat(ids.map(function(i){return ck[i]?1:0;})).join(','));
  });
  return out.join('\n');
}
function csvHabits(){
  var out=['name,group,cadence,minutes,adherence_30d,current_streak,longest_streak'];
  stats().forEach(function(s){
    out.push('"'+label(s.h.name).replace(/"/g,'""')+'",'+(s.h.group_name||'')+','+
      (s.h.cadence||'daily')+','+(s.h.minutes||0)+','+(s.pct==null?'':s.pct)+','+s.cur+','+s.best);
  });
  return out.join('\n');
}
function dl(name,text){
  var b=new Blob([text],{type:'text/plain'}), u=URL.createObjectURL(b);
  var a=document.createElement('a'); a.href=u; a.download=name; a.click();
  setTimeout(function(){URL.revokeObjectURL(u);},1200);
  toast('exported');
}

/* ============================ auth ============================ */
function authScreen(){
  document.querySelector('.app').innerHTML=
    '<div style="max-width:340px;margin:16vh auto 0;padding:0 4px">'+
    '<div class="wm" style="font-size:15px">Standard<b>.</b></div>'+
    '<div class="note" style="padding:10px 0 22px">A ledger of the self. One number a day, and nowhere to hide.</div>'+
    '<label class="fld"><span class="lab">Email</span><input id="aEmail" type="email" autocomplete="email"></label>'+
    '<label class="fld"><span class="lab">Password</span><input id="aPass" type="password" autocomplete="current-password"></label>'+
    '<div class="tools" style="padding-top:14px"><button class="btn pri" id="aIn" style="flex:1">Sign in</button>'+
    '<button class="btn" id="aUp">Create</button></div>'+
    '<div class="note" id="aMsg" style="padding-top:12px"></div></div>';
  var msg=function(t){ el('aMsg').textContent=t; };
  var go=async function(kind){
    var e=el('aEmail').value.trim(), p=el('aPass').value;
    if(!e||!p){ msg('Email and password.'); return; }
    msg('…');
    var r = kind==='up' ? await sb.auth.signUp({email:e,password:p})
                        : await sb.auth.signInWithPassword({email:e,password:p});
    if(r.error){ msg(r.error.message); return; }
    if(kind==='up' && !r.data.session){ msg('Check your email to confirm, then sign in.'); return; }
    location.reload();
  };
  el('aIn').onclick=function(){go('in');};
  el('aUp').onclick=function(){go('up');};
  el('aPass').onkeydown=function(e){ if(e.key==='Enter') go('in'); };
}

/* ============================ paint all ============================ */
function paintAll(){ paintMast(); paintRail(); paintLog(); paintRight(); paintCircle(); }

/* ============================ events ============================ */
function wire(){
  el('skins').addEventListener('click',function(e){
    var b=e.target.closest('[data-skin]'); if(b) skin(b.getAttribute('data-skin'));
  });
  el('bSet').onclick=openSettings;
  el('bNote').onclick=openNote;
  el('bCircle').onclick=openCircle;
  el('ov').addEventListener('click',function(e){ if(e.target.closest('[data-x]')) closeOv(); });

  el('rail').addEventListener('click',async function(e){
    var b=e.target.closest('[data-d]'); if(!b) return;
    S.date=b.getAttribute('data-d');
    if(!S.byDate[S.date]) S.byDate[S.date]={date:S.date,checked:{},pct:0};
    await loadPriv(); paintMast(); paintRail(); paintLog(); paintSankey();
  });

  el('log').addEventListener('click',function(e){
    var b=e.target.closest('[data-h]'); if(!b) return;
    if(e.target.closest('.lk')){
      var h=S.habits.filter(function(x){return x.id===b.getAttribute('data-h');})[0];
      if(h&&h.link){ window.open(h.link,'_blank','noopener'); return; }
    }
    toggle(b.getAttribute('data-h'));
  });

  el('sortSeg').addEventListener('click',function(e){
    var b=e.target.closest('[data-s]'); if(!b) return;
    S.sort=b.getAttribute('data-s');
    Array.prototype.forEach.call(el('sortSeg').children,function(c){ c.classList.toggle('on',c===b); });
    paintLog();
  });
  el('find').addEventListener('input',function(){ S.find=this.value; paintLog(); });
  el('bAllOff').onclick=function(){
    if(!confirm('Clear every mark on '+S.date+'?')) return;
    S.byDate[S.date].checked={}; queueSave(); paintMast(); paintLog(); paintRail(); paintRight();
  };
  el('bClose').onclick=async function(){
    await saveDay(); await load(); paintAll();
    var p=S.byDate[S.date].pct;
    toast('closed · '+p+'% · '+grade(p)[0]);
  };

  el('jump').addEventListener('click',function(e){
    var b=e.target.closest('[data-j]'); if(!b) return;
    Array.prototype.forEach.call(el('jump').children,function(c){ c.classList.toggle('on',c===b); });
    var t=el(b.getAttribute('data-j'));
    if(t) window.scrollTo({ top: t.offsetTop-70, behavior:'smooth' });
  });

  /* keyboard — the desk, not the phone */
  document.addEventListener('keydown',function(e){
    if(/input|textarea|select/i.test((e.target.tagName||''))) {
      if(e.key==='Escape') e.target.blur();
      return;
    }
    if(e.key==='Escape'){ closeOv(); return; }
    if(e.key==='/'){ e.preventDefault(); el('find').focus(); return; }
    if(e.key==='['){ el('rail').querySelector('[data-d="'+shift(S.date,-1)+'"]')?.click(); return; }
    if(e.key===']'){ var n=shift(S.date,1); if(n<=today()) el('rail').querySelector('[data-d="'+n+'"]')?.click(); return; }
    if(e.key==='t'){ el('rail').querySelector('[data-d="'+today()+'"]')?.click(); return; }
    if(e.key==='s'){ openSettings(); return; }
    if(e.key>='1'&&e.key<='9'){
      var rows=el('log').querySelectorAll('[data-h]'), i=+e.key-1;
      if(rows[i]) rows[i].click();
    }
  });

  var rT=null;
  window.addEventListener('resize',function(){
    clearTimeout(rT); rT=setTimeout(function(){ paintSankey(); paintChart(); paintScatter(); paintLog(); },160);
  });

  window.addEventListener('scroll',function(){
    if(window.innerWidth>=1080) return;
    var ss=['jLog','jRead','jStand','jCircle'], cur=ss[0];
    ss.forEach(function(id){ var n=el(id); if(n && n.offsetTop-100<=window.scrollY) cur=id; });
    Array.prototype.forEach.call(el('jump').children,function(c){
      c.classList.toggle('on', c.getAttribute('data-j')===cur); });
  },{passive:true});
}

/* ============================ boot ============================ */
(async function boot(){
  var s='statement'; try{ s=localStorage.getItem('st.skin')||'statement'; }catch(e){}
  skin(s);
  if(!(await load())) return;
  wire(); paintAll();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(function(r){ r.update(); }).catch(function(){});
  }
})();

})();
