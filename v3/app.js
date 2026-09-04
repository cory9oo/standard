/* ==========================================================================
   Habit Tracker — a ledger of the self.
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
/* KPI BAND config — lead measures are DERIVED from GOAL MATH (x32), never hand-picked,
   and HELD by R35.7 until GOAL_MATH.md locks. Ships dark; hard-codes no trio. */
var HT_KPI = { enabled:false, source:'GOAL_MATH.md — not yet locked', measures:[] };

var S = {
  me:null, priv0:null, habits:[], days:[], byDate:{},
  date:null, priv:null, privAll:{},
  sort:'order', grp:'all', find:'', removed:[], circle:null, hasCue:true, view:null, yearY:null,
  hasPredict:true,
  calYM:null, calMode:'pct'
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

  /* `cue` may not exist yet (its migration is Cory's to run). Probe, then degrade —
     the same build must work before and after the column lands. */
  var HCOLS='id,name,group_name,cadence,tier,minutes,link,sort_order';
  var h = await sb.from('habits').select(HCOLS+',cue')
    .eq('user_id',uid).eq('active',true).order('sort_order');
  if(h.error){
    S.hasCue=false;
    h = await sb.from('habits').select(HCOLS)
      .eq('user_id',uid).eq('active',true).order('sort_order');
  } else { S.hasCue=true; }
  S.habits = (h.data||[]).map(function(x,i){ if(x.sort_order==null) x.sort_order=i; return x; });

  var d = await sb.from('days').select('date,checked,active_set,pct,floor_pct').eq('user_id',uid).order('date');
  S.days = d.data||[];
  S.byDate = {}; S.days.forEach(function(r){ S.byDate[r.date]=r; });
  if(!S.date) S.date = today();
  if(!S.byDate[S.date]) S.byDate[S.date]={ date:S.date, checked:{}, pct:0 };
  if(!S.calYM){ var t=dnum(today()); S.calYM=[t.getFullYear(),t.getMonth()]; }

  /* the whole private record — rating and journal are inputs, so they get outputs */
  /* `predict` may not exist yet (its migration is Cory's to run) — probe, then degrade. */
  var PVCOLS='date,rating,why,tasks,prayer';
  var pv = await sb.from('day_private').select(PVCOLS+',predict').eq('user_id',uid);
  if(pv.error){ S.hasPredict=false; pv = await sb.from('day_private').select(PVCOLS).eq('user_id',uid); }
  else { S.hasPredict=true; }
  S.privAll = {}; (pv.data||[]).forEach(function(r){ S.privAll[r.date]=r; });
  S.priv = S.privAll[S.date] || null;
  return true;
}
function loadPriv(){ S.priv = S.privAll[S.date] || null; return Promise.resolve(); }
var saveT=null;
function queueSave(){ clearTimeout(saveT); saveT=setTimeout(saveDay,450); }

var pvT=null;
function queuePriv(){ clearTimeout(pvT); pvT=setTimeout(savePriv,700); }
async function savePriv(){
  var p = S.priv || (S.priv={});
  p.date=S.date; p.user_id=S.me.id;
  S.privAll[S.date]=p;
  var res = await sb.from('day_private').upsert({
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||''
  },{ onConflict:'user_id,date' });
  if(res.error) toast('note not saved'); else toast('saved');
  var n=0; ['why','tasks','prayer'].forEach(function(k){ if(p[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
  paintRating(); paintRChart(); paintRScat(); paintRByMo(); paintJournal(); paintCal();
}
function ratingOf(k){ var p=S.privAll[k]; var v=p&&p.rating; return (v==null||v==='')?null:+v; }
function rollRate(n,upto){
  var end=upto||today(), a=[];
  for(var i=n-1;i>=0;i--){ var v=ratingOf(shift(end,-i)); if(v!=null) a.push(v); }
  if(!a.length) return null;
  return Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10;
}
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
    tp('Earned today', fmt(com-rem)+'<s>of '+fmt(com)+'</s>') +
    tp('7-day',  (r7==null?'—':r7+'%')+'<s>'+(r7==null?'':grade(r7)[0])+'</s>') +
    tp('30-day', (r30==null?'—':r30+'%')) +
    tp('90-day', (r90==null?'—':r90+'%')) +
    tp('Consistency', (function(){ var c=consistency(90);
        return c.pct+'%<s>'+c.hit+' of 90 d at 80%+</s>'; })()) +
    tp('Streak', (function(){ var f=streakShowedUp();
        return f.days+'<s>d logged'+(f.frozen?(' · '+f.frozen+' frozen'):'')+'</s>'; })()) +
    tp('Weekly', wkDone+'<s>of '+wk.length+'</s>') +
    tp('Rating', (function(){ var r=rollRate(7); return (r==null?'—':r)+'<s>7d avg</s>'; })()) +
    tp('Logged', dates().length+'<s>days</s>') +
    tp('Gaps', (function(){ var g=gaps(30);
        return g.missed+'<s>of last 30 d</s>'; })());
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
  if(S.grp==='daily')  list=list.filter(function(h){ return h.cadence!=='weekly'; });
  if(S.grp==='weekly') list=list.filter(function(h){ return h.cadence==='weekly'; });

  if(S.sort==='order')  list.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='undone') list.sort(function(a,b){
    var da=doneOn(a,S.date)?1:0, db=doneOn(b,S.date)?1:0;
    return da-db || (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='weak')   list.sort(function(a,b){
    var aa=adherence30(a.id), ba=adherence30(b.id);
    return (aa==null?101:aa)-(ba==null?101:ba); });
  if(S.sort==='heavy')  list.sort(function(a,b){ return (b.minutes||0)-(a.minutes||0); });
  if(S.sort==='az')     list.sort(function(a,b){ return label(a.name).toLowerCase()<label(b.name).toLowerCase()?-1:1; });

  el('log').className = 'log'+(list.length>16?' split':'');
  el('log').innerHTML = list.map(function(h){
    var on = doneOn(h,S.date);
    var ad = adherence30(h.id);
    return '<button class="li'+(on?' on':'')+(h.id===nx?' nx':'')+'" data-h="'+h.id+'">'+
      '<span class="bx"></span>'+
      '<span class="nm">'+esc(label(h.name))+
        ((S.hasCue && h.cue)?'<i class="cue">'+esc(h.cue)+'</i>':'')+'</span>'+
      (function(){ var mr=missRun(h.id); return mr>=3?'<span class="mrun" title="'+mr+
        ' days running">⚑'+mr+'</span>':''; })()+
      (returnedOn(h,S.date)?'<span class="back" title="back after a miss — the return is the win">↩</span>':'')+
      (h.link?'<span class="lk"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7L11.5 5"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19"/></svg></span>':'')+
      (h.cadence==='weekly'?'<span class="wk">WEEKLY</span>':'')+
      '<span class="mn">'+(h.minutes?h.minutes+'m':'—')+'</span>'+
      '<span class="ad" style="color:'+gtxt(ad)+'">'+(ad==null?'—':ad+'%')+'</span>'+
      '</button>';
  }).join('') || '<div class="empty">Nothing matches.</div>';

  var ids=daily().map(function(x){return x.id;});
  var done=ids.filter(function(i){return ck[i];}).length;
  el('logC').textContent = done+' / '+ids.length+' · '+fmt(earned(S.date))+' earned';
}

/* ---- input 2 and 3: the rating strip and the journal ---- */
function paintRating(){
  var cur = S.priv && S.priv.rating!=null ? +S.priv.rating : null, h='';
  for(var i=1;i<=10;i++) h+='<button data-r="'+i+'" class="'+(cur===i?'on':'')+'">'+i+'</button>';
  h+='<button data-r="0" class="clr" title="clear">×</button>';
  el('rate').innerHTML=h;
  var r7=rollRate(7), r30=rollRate(30);
  el('rateC').textContent = (cur==null?'not rated':'rated '+cur)+
    (r7==null?'':' · 7d '+r7)+(r30==null?'':' · 30d '+r30);
}
function paintJournalInputs(){
  el('iWhy').value    = (S.priv&&S.priv.why)||'';
  el('iTasks').value  = (S.priv&&S.priv.tasks)||'';
  el('iPrayer').value = (S.priv&&S.priv.prayer)||'';
  var n=0; ['why','tasks','prayer'].forEach(function(k){ if(S.priv&&S.priv[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
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
  paintSankey(); paintHeat(); paintCal(); paintChart(); paintMomo(); paintDow();
  paintByMo(); paintByYear(); paintGdist();
  paintRChart(); paintRScat(); paintRByMo(); paintJournal();
  paintPerHabit(); paintScatter(); paintStreaks(); paintGroups(); paintNextMove();
  paintTLedger(); paintLife();
}

/* ---- month calendar, completion or rating ---- */
function paintCal(){
  var y=S.calYM[0], m=S.calYM[1];
  var first=new Date(y,m,1), start=new Date(first);
  start.setDate(1-((first.getDay()+6)%7));                 /* Monday-led */
  var h=['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(d){return '<div class="hd">'+d+'</div>';}).join('');
  for(var i=0;i<42;i++){
    var d=new Date(start); d.setDate(start.getDate()+i);
    var k=dk(d), out=(d.getMonth()!==m), fut=(k>today());
    var v,f,txt;
    if(S.calMode==='rate'){ v=ratingOf(k); f=(v==null?'var(--sunk)':dens(v*10)); txt=(v==null?'':v); }
    else { var r=S.byDate[k]; v=(r&&r.pct!=null&&!fut)?r.pct:null; f=dens(v); txt=(v==null?'':v); }
    h+='<button class="d'+(out?' out':'')+(k===today()?' tdy':'')+'" data-cd="'+k+'" style="background:'+f+'">'+
       '<b>'+d.getDate()+'</b>'+(txt===''?'':'<s>'+txt+'</s>')+'</button>';
  }
  el('cal').innerHTML=h;
  el('calNav').innerHTML='<button class="mv" data-cm="-1">‹</button> '+MO[m]+' '+y+' <button class="mv" data-cm="1">›</button>';
}
function paintHeatLegend(){
  var h='<span>less</span>';
  [0,20,40,60,80,100].forEach(function(p){ h+='<i style="background:'+dens(p)+'"></i>'; });
  h+='<span>more</span><span style="margin-left:auto">grey = no entry</span>';
  el('heatLeg').innerHTML=h;
}

/* ---- rating: the second input finally gets its outputs ---- */
function paintRChart(){
  var N=90, H=118, W=fitSvg('rChart',H), pts=[], any=false;
  for(var i=N-1;i>=0;i--){ var v=ratingOf(shift(today(),-i)); pts.push(v); if(v!=null) any=true; }
  if(!any){ el('rChart').innerHTML='<text x="6" y="20">No ratings yet — rate a day on the left.</text>';
    el('rTrendC').textContent='90 days'; return; }
  var px=function(i){ return 24+i*(W-32)/(N-1); }, py=function(v){ return H-16-(v/10)*(H-28); };
  var s='';
  [0,5,10].forEach(function(v){
    s+='<line class="ax" x1="22" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
       '<text x="18" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  pts.forEach(function(v,i){ if(v==null) return;
    s+='<rect x="'+(px(i)-2).toFixed(1)+'" y="'+py(v).toFixed(1)+'" width="4" height="'+(py(0)-py(v)).toFixed(1)+
       '" fill="'+dens(v*10)+'"><title>'+shift(today(),-(N-1-i))+' · '+v+'/10</title></rect>'; });
  var m30=rollRate(30);
  if(m30!=null) s+='<line x1="22" y1="'+py(m30)+'" x2="'+(W-4)+'" y2="'+py(m30)+
    '" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="3 3"/>';
  el('rChart').innerHTML=s;
  el('rTrendC').textContent='90 days · 30d avg '+(m30==null?'—':m30);
}
function pearson(a,b){
  var n=a.length; if(n<3) return null;
  var ma=a.reduce(function(x,y){return x+y;},0)/n, mb=b.reduce(function(x,y){return x+y;},0)/n;
  var sn=0,da=0,db=0;
  for(var i=0;i<n;i++){ var x=a[i]-ma, y=b[i]-mb; sn+=x*y; da+=x*x; db+=y*y; }
  if(!da||!db) return null;
  return sn/Math.sqrt(da*db);
}
function paintRScat(){
  var H=136, W=fitSvg('rScat',H), P=[], R=[];
  dates().forEach(function(k){
    var r=S.byDate[k], v=ratingOf(k);
    if(r&&r.pct!=null&&v!=null){ P.push(r.pct); R.push(v); }
  });
  if(P.length<3){
    el('rScat').innerHTML='<text x="6" y="20">Rate a few more days and this fills in.</text>';
    el('rScatN').innerHTML='Once there are ratings on at least three logged days, this answers one question: <b>does hitting the standard actually make the day feel better?</b>';
    return;
  }
  var px=function(p){ return 30+(p/100)*(W-44); }, py=function(v){ return H-20-(v/10)*(H-36); };
  var s='';
  [0,5,10].forEach(function(v){ s+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  for(var i=0;i<P.length;i++)
    s+='<circle cx="'+px(P[i]).toFixed(1)+'" cy="'+py(R[i]).toFixed(1)+'" r="4" fill="'+dens(P[i])+
       '" opacity=".8"><title>'+P[i]+'% · rated '+R[i]+'</title></circle>';
  var r=pearson(P,R);
  if(r!=null){
    var ma=P.reduce(function(x,y){return x+y;},0)/P.length, mb=R.reduce(function(x,y){return x+y;},0)/R.length;
    var num=0,den=0; for(var j=0;j<P.length;j++){ num+=(P[j]-ma)*(R[j]-mb); den+=(P[j]-ma)*(P[j]-ma); }
    if(den){ var sl=num/den, ic=mb-sl*ma;
      s+='<line x1="'+px(0)+'" y1="'+py(clamp(ic,0,10))+'" x2="'+px(100)+'" y2="'+py(clamp(sl*100+ic,0,10))+
         '" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>'; }
  }
  s+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">completion % →</text>';
  el('rScat').innerHTML=s;
  var strength = r==null?'':(Math.abs(r)>=0.6?'strong':Math.abs(r)>=0.35?'real but moderate':'weak');
  el('rScatN').innerHTML = r==null ? '' :
    'Across <b>'+P.length+'</b> rated days the correlation is <b>r = '+r.toFixed(2)+'</b> — '+strength+
    (r>=0.35 ? '. Hitting the standard does make the day feel better; the routine is earning its cost.'
     : r<=-0.35 ? '. Higher completion goes with <b>worse</b> days. The list is buying compliance at the price of the day — worth looking at what you are grinding through.'
     : '. Completion and how the day felt are close to independent. Either the list is not touching what actually makes a day good, or something outside it is driving the mood.');
}
function monthly(fn){
  var sum=new Array(12).fill(0), n=new Array(12).fill(0);
  dates().forEach(function(k){ var v=fn(k); if(v==null) return;
    var m=dnum(k).getMonth(); sum[m]+=v; n[m]++; });
  return sum.map(function(x,i){ return n[i]?Math.round(x/n[i]*10)/10:null; });
}
function colChart(id,vals,labels,maxv,fmtv,colf){
  var mx=maxv||Math.max.apply(null,vals.map(function(x){return x||0;}))||1;
  el(id).innerHTML = vals.map(function(v,i){
    var h=v==null?1:Math.max(3,Math.round(v/mx*52));
    return '<div class="c"><b'+(v==null?' style="color:var(--ink3)"':'')+'>'+(v==null?'·':(fmtv?fmtv(v):v))+'</b>'+
      '<i style="height:'+h+'px;background:'+(v==null?'var(--sunk)':colf(v))+(v==null?';opacity:.5':'')+'"></i>'+
      '<u>'+labels[i]+'</u></div>';
  }).join('');
}
function paintByMo(){
  var v=monthly(function(k){ var r=S.byDate[k]; return (r&&r.pct!=null)?r.pct:null; });
  colChart('byMo', v.map(function(x){return x==null?null:Math.round(x);}),
    MO.map(function(m){return m[0];}), 100, null, dens);
  var got=v.filter(function(x){return x!=null;}).length;
  el('byMoC').textContent='completion · '+got+' of 12 months';
}
function paintRByMo(){
  var v=monthly(ratingOf);
  colChart('rByMo', v, MO.map(function(m){return m[0];}), 10,
    function(x){ return x.toFixed(1); }, function(x){ return dens(x*10); });
}
function paintByYear(){
  var y={}, o=[];
  dates().forEach(function(k){ var r=S.byDate[k]; if(!r||r.pct==null) return;
    var yy=k.slice(0,4); if(!y[yy]){ y[yy]={s:0,n:0,rs:0,rn:0}; o.push(yy); }
    y[yy].s+=r.pct; y[yy].n++;
    var v=ratingOf(k); if(v!=null){ y[yy].rs+=v; y[yy].rn++; }
  });
  if(!o.length){ el('byYear').innerHTML='<div class="empty">Nothing logged yet.</div>'; return; }
  el('byYear').innerHTML='<table class="kv">'+o.sort().reverse().map(function(yy){
    var a=y[yy], p=Math.round(a.s/a.n), r=a.rn?Math.round(a.rs/a.rn*10)/10:null;
    return '<tr><td class="k">'+yy+' <span style="color:var(--ink3)">'+a.n+' days</span></td>'+
      '<td class="v w" style="white-space:nowrap"><b style="color:'+gtxt(p)+'">'+p+'%</b>'+
      '<span style="color:var(--ink3)"> · '+(r==null?'—':r+'/10')+'</span></td></tr>';
  }).join('')+'</table>';
}
function paintJournal(){
  var ks=Object.keys(S.privAll).filter(function(k){
    var p=S.privAll[k]; return p && (p.why||p.tasks||p.prayer);
  }).sort().reverse().slice(0,14);
  if(!ks.length){ el('jArc').innerHTML='<div class="empty">Nothing written yet. The journal on the left lands here.</div>';
    el('jArcC').textContent=''; return; }
  el('jArc').innerHTML = ks.map(function(k){
    var p=S.privAll[k], r=S.byDate[k], d=dnum(k);
    var body='';
    if(p.why)    body+='<p class="q">'+esc(p.why)+'</p>';
    if(p.tasks)  body+='<p>'+esc(p.tasks)+'</p>';
    if(p.prayer) body+='<p class="q">'+esc(p.prayer)+'</p>';
    return '<button class="jr" data-jd="'+k+'" style="display:block;width:100%">'+
      '<span class="h"><b>'+WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+'</b>'+
      (p.rating!=null?'<s style="color:'+gtxt(p.rating*10)+'">'+p.rating+'/10</s>':'')+
      '<span>'+(r&&r.pct!=null?r.pct+'%':'')+'</span></span>'+body+'</button>';
  }).join('');
  el('jArcC').textContent = ks.length+' entr'+(ks.length===1?'y':'ies');
}
function paintNextMove(){
  var a=nextMoveRank();
  if(!a.length){ el('nextMove').innerHTML='<div class="empty">Log a few days first.</div>'; return; }
  var b=a[0], n=daily().length;
  var gain=Math.round(100/n);
  var tight = b.pct>=70;
  el('nextMove').innerHTML='<div class="nm"><span class="big">'+esc(label(b.h.name))+'</span>'+
    'Held <b>'+b.pct+'%</b> over the last '+b.of+' logged days at a cost of '+
    (b.mins?('<b>'+b.mins+' minutes</b>'):'<b>no time at all</b>')+
    '. It is the cheapest ground left on the board — about <b>'+gain+
    ' points</b> of score per day, for '+(b.mins?b.mins+' minutes':'nothing')+'.'+
    (tight?' Nothing cheap is badly broken right now, so the next real gain has to come from something that costs time.':'')+
    '<div style="padding-top:8px;color:var(--ink2)">Runners-up: '+
      a.slice(1,4).map(function(s){ return esc(label(s.h.name))+' ('+s.pct+'%)'; }).join(' · ')+
    '</div></div>';
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
  paintHeatLegend();
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
  /* R46.5: cue coverage extends to EVERY below-median standard, not the worst ten. */
  var WEAK10=belowMedian();
  function edRow(h,i){
    return '<div class="ed" data-i="'+i+'">'+
      '<button class="hnd" data-up="'+i+'" title="move up">↑</button>'+
      '<input class="en" value="'+esc(h.name)+'" placeholder="standard">'+
      '<input class="em num" type="number" min="0" step="5" value="'+(h.minutes||0)+'" title="minutes">'+
      (S.hasCue?('<input class="eq" value="'+esc(h.cue||'')+'" placeholder="'+
        (WEAK10[h.id]?'⚑ after I ___, I will ___':'after I ___, I will ___')+
        '" title="Cue — the event this standard hangs off. Ten weakest are flagged.">'):'')+
      '<select class="eg">'+GROUPS.map(function(g){
        return '<option'+(g===(h.group_name||'Other')?' selected':'')+'>'+g+'</option>'; }).join('')+'</select>'+
      '<select class="ec"><option value="daily"'+(h.cadence!=='weekly'?' selected':'')+'>Daily</option>'+
        '<option value="weekly"'+(h.cadence==='weekly'?' selected':'')+'>Weekly</option></select>'+
      '<button class="x" data-rm="'+i+'" title="archive">×</button></div>';
  }
  var body=
    '<div class="sh"><h2>The standards</h2><span class="ln"></span><span class="c">'+rows.length+' · edit anything</span></div>'+
    (S.hasCue?(function(){ var c=cueCoverage(); return '<div class="cuecov">Cues written: <b>'+c.got+
      '</b> of <b>'+c.need+'</b> below-median standards'+(c.got<c.need?' — the flagged rows are where a cue is worth writing.':' — covered.')+
      '</div>'; })():'')+
    '<div class="bud" id="bud"></div>'+
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
    paintBudget();
    list.addEventListener('input',paintBudget);
    list.addEventListener('change',paintBudget);
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
    el('xCsv').onclick=function(){ dl('ht-days.csv', csvDays()); };
    el('xCsvH').onclick=function(){ dl('ht-standards.csv', csvHabits()); };
    el('xJson').onclick=function(){
      /* R35.6 — day_private carries inputs 2 and 3. Exporting completion alone and calling it
         EVERYTHING is how a backup becomes a belief. */
      var priv=[]; for(var k in S.privAll){ if(S.privAll[k]) priv.push(S.privAll[k]); }
      priv.sort(function(a,b){ return a.date<b.date?-1:1; });
      dl('ht.json', JSON.stringify({ profile:S.me, habits:S.habits, days:S.days,
        day_private:priv, exported_at:new Date().toISOString(), schema:'ht-export-2' },null,2));
    };
    el('xPrint').onclick=function(){ closeOv(); setTimeout(function(){ window.print(); },260); };
    el('bOut').onclick=async function(){ await sb.auth.signOut(); location.reload(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-skin2]'),function(b){
      b.onclick=function(){ skin(b.getAttribute('data-skin2')); };
    });
  });
}
/* the list is a time budget; show the bill while it is being written */
function paintBudget(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#edList .ed'));
  var dMin=0,dN=0,wMin=0,wN=0,free=0;
  rows.forEach(function(r){
    if(r.classList.contains('gone')) return;
    if(!r.querySelector('.en').value.trim()) return;
    var m=+r.querySelector('.em').value||0, wk=r.querySelector('.ec').value==='weekly';
    if(wk){ wN++; wMin+=m; } else { dN++; dMin+=m; }
    if(!m) free++;
  });
  var WAKE=1440-480;                                  /* a day, less eight hours of sleep */
  var pct=Math.min(100,Math.round(dMin/WAKE*100));
  var level = dMin>420 ? 'over' : dMin>240 ? 'watch' : 'ok';
  var col = level==='over'?'var(--bad)':level==='watch'?'var(--g3)':'var(--good)';
  var verdict = level==='over'
    ? 'More routine than a working day has room for. A list this size gets scored by the clock, not by you.'
    : level==='watch' ? 'Getting heavy. Every minute here is a minute the day has to find somewhere else.'
    : 'This fits inside a real day.';
  el('bud').innerHTML =
    '<div class="lab">Daily time budget</div>'+
    '<div class="v" style="color:'+col+'">'+fmt(dMin)+' <span style="font-size:11px;color:var(--ink3)">of '+fmt(WAKE)+' waking</span></div>'+
    '<div class="t"><i style="width:'+pct+'%;background:'+col+'"></i>'+
      '<u style="left:'+Math.round(240/WAKE*100)+'%"></u><u style="left:'+Math.round(420/WAKE*100)+'%"></u></div>'+
    '<div class="k">'+dN+' daily'+(wN?' · '+wN+' weekly ('+fmt(wMin)+'/wk)':'')+
      (free?' · '+free+' cost no time':'')+'. '+verdict+'</div>';
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
    if(S.hasCue){ var qn=r.querySelector('.eq'); rec.cue = qn ? qn.value.trim() : ''; }
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

/* ---- the guide: what every number on the sheet means ---- */
function openGuide(){
  openOv('What everything means',
  '<div class="band">The three inputs</div>'+
  gd('1 · Completion','Ticking a standard. Your day percentage is simply how many of the daily standards you took, out of how many are active. Weekly standards are credited to the whole Monday–Sunday week, so taking one on Tuesday keeps the week green.')+
  gd('2 · Rating','Your own 1–10 on the day, before you look at the score. It is the only number here you cannot game, because nothing computes it.')+
  gd('3 · Journal','Why it was that number, what you actually got done, and the prayer journal. Three free-text fields, saved per day.')+
  '<div class="band">Everything else is an output</div>'+
  gd('Where the day goes','The committed block is the sum of the minutes you priced your daily standards at. The top bar splits it by group; the bottom bar splits the same minutes into what you did and what you missed. The ribbons show which group the missed time came from.')+
  gd('Cost against adherence','Every priced standard is one dot: minutes on the horizontal, how often you actually take it on the vertical. It is testing one excuse — <b>am I missing things because they are expensive?</b> If the cloud slopes down to the right, price is the problem and the fix is to shorten or cut. If it is flat, price is not the problem, and cutting minutes will not help.')+
  gd('Rating against completion','The same test on the other side. Does hitting the standard make the day feel better? A positive correlation means the routine is earning its cost. A flat one means the list is not touching what actually makes your day good.')+
  gd('Momentum','This 7 days against the 7 before it. The projection just carries the same change forward one more week — it is arithmetic, not a forecast.')+
  gd('Streaks','Current run of consecutive days taken, then the longest run in the last 90. Today does not break a streak until the day closes.')+
  gd('Next move','Room to gain divided by what it costs. The standard with the most missing days at the lowest price — the cheapest points on the board.')+
  gd('Time ledger','Committed minutes per day multiplied by days logged is what the routine billed you. Spent is what you actually took. The difference is the unspent balance — not wasted time, just time the list asked for and did not get.')+
  gd('Grades','A+ 97, A 90, B 80, C 70, D 60, F below. The colour ramp is continuous, not banded, so a 45 and a 62 do not look the same.'),
  null);
}
function gd(t,b){ return '<div style="padding:12px 0;border-bottom:1px solid var(--rule)">'+
  '<div class="lab" style="padding-bottom:5px">'+t+'</div><div class="note">'+b+'</div></div>'; }

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
  var head=['date','pct','grade','rating'].concat(S.habits.map(function(h){return '"'+label(h.name).replace(/"/g,'""')+'"';}));
  var out=[head.join(',')];
  dates().forEach(function(k){
    var r=S.byDate[k], ck=r.checked||{};
    out.push([k, r.pct==null?'':r.pct, r.pct==null?'':grade(r.pct)[0], (ratingOf(k)==null?'':ratingOf(k))]
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
    '<div class="wm" style="font-size:15px">HT<b>.</b></div>'+
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
function paintAll(){
  paintMast(); paintRail(); paintLog(); paintRating(); paintJournalInputs();
  paintCapacity(); paintNextSmall(); paintKpi();
  paintStarter(); paintWeekly(); paintMcII(); paintYear(); paintPredict();
  paintRight(); paintCircle();
}

function goDay(k){
  S.date=k;
  if(!S.byDate[k]) S.byDate[k]={date:k,checked:{},pct:0};
  S.priv=S.privAll[k]||null;
  var d=dnum(k); S.calYM=[d.getFullYear(),d.getMonth()];
  paintMast(); paintRail(); paintLog(); paintRating(); paintJournalInputs(); paintSankey(); paintCal();
  paintCapacity(); paintNextSmall(); paintWeekly(); paintYear(); paintPredict();
  var t=el('jIn'); if(t && window.innerWidth<1080) window.scrollTo({top:Math.max(0,t.offsetTop-70),behavior:'smooth'});
}

/* ============================ events ============================ */
function wire(){
  el('skins').addEventListener('click',function(e){
    var b=e.target.closest('[data-skin]'); if(b) skin(b.getAttribute('data-skin'));
  });
  el('bSet').onclick=openSettings;
  var bv=el('bView'); if(bv) bv.onclick=toggleView;
  var yp=el('yPrev'), yn=el('yNext');
  if(yp) yp.onclick=function(){ S.yearY=(S.yearY==null?dnum(today()).getFullYear():S.yearY)-1; paintYear(); };
  if(yn) yn.onclick=function(){ S.yearY=(S.yearY==null?dnum(today()).getFullYear():S.yearY)+1; paintYear(); };
  document.body.classList.toggle('reviewday', [0,1].indexOf(dnum(today()).getDay())>=0);
  applyView(loadView());
  el('bGuide').onclick=openGuide;
  el('bCircle').onclick=openCircle;

  /* input 2 — rating */
  el('rate').addEventListener('click',function(e){
    var b=e.target.closest('[data-r]'); if(!b) return;
    var v=+b.getAttribute('data-r');
    S.priv=S.priv||{};
    S.priv.rating = (v===0 || S.priv.rating===v) ? null : v;
    paintRating(); queuePriv();
  });
  /* input 3 — journal */
  [['iWhy','why'],['iTasks','tasks'],['iPrayer','prayer']].forEach(function(p){
    var n=el(p[0]);
    n.addEventListener('input',function(){
      S.priv=S.priv||{}; S.priv[p[1]]=n.value; queuePriv();
      el('jrnC').textContent='saving…';
    });
  });

  /* month calendar */
  el('calNav').addEventListener('click',function(e){
    var b=e.target.closest('[data-cm]'); if(!b) return;
    var d=+b.getAttribute('data-cm'), m=S.calYM[1]+d, y=S.calYM[0];
    if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
    S.calYM=[y,m]; paintCal();
  });
  el('calMode').addEventListener('click',function(e){
    var b=e.target.closest('[data-m]'); if(!b) return;
    S.calMode=b.getAttribute('data-m');
    Array.prototype.forEach.call(el('calMode').children,function(c){ c.classList.toggle('on',c===b); });
    paintCal();
  });
  el('cal').addEventListener('click',function(e){
    var b=e.target.closest('[data-cd]'); if(!b) return;
    var k=b.getAttribute('data-cd'); if(k>today()) return;
    goDay(k);
  });
  el('jArc').addEventListener('click',function(e){
    var b=e.target.closest('[data-jd]'); if(b) goDay(b.getAttribute('data-jd'));
  });
  el('ov').addEventListener('click',function(e){ if(e.target.closest('[data-x]')) closeOv(); });

  el('rail').addEventListener('click',function(e){
    var b=e.target.closest('[data-d]'); if(b) goDay(b.getAttribute('data-d'));
  });

  el('log').addEventListener('click',function(e){
    var b=e.target.closest('[data-h]'); if(!b) return;
    if(e.target.closest('.lk')){
      var h=S.habits.filter(function(x){return x.id===b.getAttribute('data-h');})[0];
      if(h&&h.link){ window.open(h.link,'_blank','noopener'); return; }
    }
    toggle(b.getAttribute('data-h'));
  });

  el('grpSeg').addEventListener('click',function(e){
    var b=e.target.closest('[data-g]'); if(!b) return;
    S.grp=b.getAttribute('data-g');
    Array.prototype.forEach.call(el('grpSeg').children,function(c){ c.classList.toggle('on',c===b); });
    paintLog();
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
    toast('closed · '+fmt(earned(S.date))+' earned · '+p+'% · '+grade(p)[0]);
    /* R-B rides this action: one optional tap, about tomorrow. */
    var n=el('predict');
    if(n && S.hasPredict){ n.scrollIntoView({behavior:'smooth',block:'center'}); }
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
    if(e.key==='?'||e.key==='g'){ openGuide(); return; }
    if(e.key==='j'){ el('iTasks').focus(); return; }
    if(e.key>='1'&&e.key<='9'){
      var rows=el('log').querySelectorAll('[data-h]'), i=+e.key-1;
      if(rows[i]) rows[i].click();
    }
  });

  var rT=null;
  window.addEventListener('resize',function(){
    clearTimeout(rT); rT=setTimeout(function(){
      paintSankey(); paintChart(); paintScatter(); paintRChart(); paintRScat(); paintLog(); },160);
  });

  window.addEventListener('scroll',function(){
    if(window.innerWidth>=1080) return;
    var ss=['jIn','jDay','jRec','jRate','jStand','jCircle'], cur=ss[0];
    ss.forEach(function(id){ var n=el(id); if(n && n.offsetTop-100<=window.scrollY) cur=id; });
    Array.prototype.forEach.call(el('jump').children,function(c){
      c.classList.toggle('on', c.getAttribute('data-j')===cur); });
  },{passive:true});
}


/* ==================================================================
   CAPACITY · SMALL VIEW · CUE · KPI BAND
   HT charter §1–§4, ruled by Cory 2026-08-31 (SPEC_QUEUE R35.7).
   Appended by _reconcile/ht_batch3/build_v3.py — one block, one place.
   ================================================================== */

/* ---- CAPACITY SCORE -------------------------------------------------
   Banded against CORY'S OWN trailing distribution, never population norms.
   Bands recompute WEEKLY (anchored to the last Sunday), never per-day: a
   single bad day must not flip a prescription. Until the calibration gate
   passes the band renders WITHOUT a prescription — a prescription from four
   datapoints is a guess wearing a uniform. */
var CAP_GATE = { ratedDays:14, loggedDays:30 };

function capFed(k){                       /* REAL logged days inside the 7-day window */
  /* load() puts a synthetic empty row in byDate for today so the sheet can render, and that row
     is NOT in S.days. Counting byDate would therefore call an unfed week "fed" every time —
     identity against S.days is what separates a persisted day from the placeholder. */
  var end=k||today(), n=0;
  for(var i=0;i<7;i++){
    var r=S.byDate[shift(end,-i)];
    if(r && S.days.indexOf(r)>=0) n++;
  }
  return n;
}
function capRaw(k){
  /* A GAP IS NOT A ZERO. With nothing logged in the window, adherence reads 0% and the score
     would say SHED LOAD — the exact wrong instruction for someone who simply stopped logging.
     Unfed returns null and the card says so. */
  if(capFed(k)===0) return null;
  var adh = rolling(7,k);                 /* 0..100 or null */
  var rat = rollRate(7,k);                /* 1..10  or null */
  if(adh==null && rat==null) return null;
  if(rat==null) return { v: adh/100, half:true };
  if(adh==null) return { v: (rat-1)/9,  half:true };
  return { v: 0.5*(adh/100) + 0.5*((rat-1)/9), half:false };
}
function capWeekAnchor(){
  var d=dnum(today()); d.setDate(d.getDate()-d.getDay());   /* last Sunday */
  return dk(d);
}
function capBands(){
  var anchor=capWeekAnchor(), vals=[];
  for(var i=0;i<60;i++){
    var k=shift(anchor,-i), r=S.byDate[k]?capRaw(k):null;
    if(r) vals.push(r.v);
  }
  if(vals.length<8) return null;
  vals.sort(function(a,b){return a-b;});
  var q=function(p){ return vals[clamp(Math.floor(p*(vals.length-1)),0,vals.length-1)]; };
  return { p33:q(0.33), p66:q(0.66), n:vals.length, anchor:anchor };
}
function capState(){
  var rated=0, logged=dates().length;
  for(var k in S.privAll){ if(ratingOf(k)!=null) rated++; }
  var raw=capRaw(today());
  var b=capBands();
  /* half-fed input can never carry a prescription, however many days are on file:
     a capacity score computed from completion alone is adherence wearing a uniform. */
  var fed = capFed();
  var calibrated = (rated>=CAP_GATE.ratedDays && logged>=CAP_GATE.loggedDays && !!b && !!raw
                    && !raw.half && fed>=4);
  var band=null;
  if(raw && b) band = raw.v < b.p33 ? 'SHED LOAD' : (raw.v > b.p66 ? 'TAKE IT ON' : 'HOLD');
  return { raw:raw, bands:b, band:band, calibrated:calibrated, rated:rated, logged:logged,
           fed: fed,
           score: raw? Math.round(raw.v*100) : null,
           needRated: Math.max(0, CAP_GATE.ratedDays-rated),
           needLogged: Math.max(0, CAP_GATE.loggedDays-logged) };
}
function paintCapacity(){
  var n=el('cap'); if(!n) return;
  var c=capState();
  if(c.score==null){
    var gap=(c.logged>0 && capFed()===0);
    n.innerHTML='<div class="capc"><div class="capn">—</div><div class="capw">'+
      (gap?'UNFED · nothing logged in 7 days':'Capacity needs a logged day')+'</div>'+
      '<div class="caps">'+(gap
        ? 'A gap is not a zero, so this shows nothing rather than telling you to shed load. Tick today and it comes back.'
        : 'Tick something above and this fills in.')+'</div></div>'; return;
  }
  var wordy = c.calibrated
    ? '<b>'+c.band+'</b> · banded against your own last '+c.bands.n+' days'
    : 'UNCALIBRATED · '+(c.needRated?('needs '+c.needRated+' more rated day'+(c.needRated>1?'s':'')):'')+
      (c.needRated&&c.needLogged?' and ':'')+
      (c.needLogged?(c.needLogged+' more logged day'+(c.needLogged>1?'s':'')):'')+
      ' before it may prescribe';
  /* SAY THE SAMPLE SIZE. A bare number off one logged day reads as a verdict on the man
     rather than on the day. */
  var sub = (c.raw.half
    ? 'Half-fed: this is completion only. The rating half of the formula is empty.'
    : 'Completion and self-rating, 7-day, weighted half and half.')
    + ' Built from ' + c.fed + ' of the last 7 days.'
    + (c.fed<=2 ? ' That is a thin week — this number is about the logging, not about you.' : '');
  if(!c.calibrated && c.fed<4 && c.needRated===0 && c.needLogged===0){
    wordy = 'UNCALIBRATED · only '+c.fed+' of the last 7 days logged — it will not prescribe off a thin window';
  }
  n.innerHTML='<div class="capc'+(c.calibrated?' ok':'')+'">'+
    '<div class="capn num">'+c.score+'</div>'+
    '<div class="capw">'+wordy+'</div>'+
    '<div class="caps">'+sub+'</div></div>';
}

/* ---- NEXT MOVE, shared ranking (small view + full sheet) ---- */
function nextMoveRank(){
  var a=stats().filter(function(s){ return s.pct!=null && s.h.cadence!=='weekly'; });
  a.forEach(function(s){ s.lev=(100-s.pct)/((s.mins||0)+10); });
  a.sort(function(x,y){ return y.lev-x.lev; });
  return a;
}
function paintNextSmall(){
  var n=el('capNext'); if(!n) return;
  var a=nextMoveRank();
  if(!a.length){ n.innerHTML='<div class="empty">Log a few days and the next move appears here.</div>'; return; }
  var b=a[0];
  n.innerHTML='<div class="nms"><span class="k">Next move</span>'+
    '<span class="v">'+esc(label(b.h.name))+'</span>'+
    '<span class="s">'+b.pct+'% over '+b.of+' days · '+(b.mins?b.mins+' min':'no time')+'</span></div>';
}

/* ---- SMALL DEFAULT VIEW ---------------------------------------------
   Default is SMALL. 13 logged days cannot feed 18 instruments, and a wall
   of empty charts is work at 4:50am. The wall is one tap away, never gone
   (nothing here re-opens DEC-055). */
function loadView(){
  try { return localStorage.getItem('ht_view')==='full' ? 'full' : 'small'; }
  catch(e){ return 'small'; }
}
function applyView(v){
  S.view = (v==='full')?'full':'small';
  document.body.classList.toggle('small', S.view==='small');
  var b=el('bView'); if(b) b.textContent = (S.view==='small') ? 'Full sheet' : 'Small view';
  try { localStorage.setItem('ht_view', S.view); } catch(e){}
  if(S.view==='full'){ paintRight(); }
}
function toggleView(){ applyView(S.view==='small'?'full':'small'); }

/* ---- KPI BAND — config-driven, ships DARK ---------------------------
   x32: the business measures are DERIVED from GOAL MATH, never hand-picked,
   and R35.7 HOLDS them until GOAL_MATH.md locks. So the band is built and
   wired, hard-codes nothing, and renders nothing until a config arrives.
   To light it: set enabled:true and give measures[] {name,minutes,target}. */
function paintKpi(){
  var n=el('kpi'); if(!n) return;
  if(!HT_KPI.enabled || !(HT_KPI.measures||[]).length){ n.innerHTML=''; n.style.display='none'; return; }
  n.style.display='';
  n.innerHTML='<div class="sh"><h2>Lead measures</h2><span class="ln"></span><span class="c">'+
    esc(HT_KPI.source||'')+'</span></div><div class="pan"><div class="kpil">'+
    HT_KPI.measures.map(function(m){
      return '<div class="kpim"><span class="k">'+esc(m.name)+'</span>'+
             '<span class="v num">'+(m.target==null?'—':esc(String(m.target)))+'</span>'+
             '<span class="s">'+(m.minutes?m.minutes+' min/day':'')+'</span></div>';
    }).join('')+'</div></div>';
}


/* ==================================================================
   HT-5 — streak repair · MCII · weekly review · forfeit (dark) ·
   year view · cue coverage · miss flags · 90-day consistency ·
   60-second onboarding.
   R46.5 pile-in, additive only. NO fourth daily input (R47.1/DEC-058):
   every surface below is derived output or a one-off config write.
   ================================================================== */

/* ---- FORFEIT REFEREE — built, config-driven, DARK until Phase D ----
   The self-refereed commitment device never fired (the $250/11-texts).
   PENDING-SPEC-15 §10: the escalation must be STRUCTURAL, not discretionary.
   So the referee is a config with a trigger the machine evaluates — and it
   ships disabled, like the KPI band, until Phase D lets anything fire. */
var HT_FORFEIT = { enabled:false, referee:null, stake:null,
                   trigger:{ missRun:3, weeklyBelow:null }, note:'dark until Phase D (DEC-068)' };

/* ---- STREAK REPAIR -------------------------------------------------
   Bounded freeze budget + isolated-miss forgiveness. Derived from the
   existing rows — no column, no new input. A streak that a single missed
   day destroys is a loss-aversion device sitting at zero; it punishes the
   record-keeping, not the man. */
var STREAK = { freezePer30:2, formedAt:66 };   /* 66 = the median automaticity figure */

function loggedOn(k){ var r=S.byDate[k]; return !!(r && S.days.indexOf(r)>=0); }
function streakForgiving(){
  /* walks back from today; an unlogged or sub-80 day spends a freeze instead of
     ending the run, up to freezePer30 inside any trailing 30 days. */
  var k=today(), n=0, spent=[], guard=0;
  if(!loggedOn(k)) k=shift(k,-1);
  while(guard++<400){
    var r=S.byDate[k], pct=(r&&r.pct!=null)?r.pct:null;
    if(pct!=null && pct>=80){ n++; }
    else {
      /* the budget must be bounded by the RUN, not by a window that slides away underneath it:
         a per-30-days test evaluated at each step lets old freezes expire and the streak runs
         forever (rehearsal exhibit: 21 freezes spent against a budget of 2). Allowance grows one
         block at a time as the run itself grows. */
      var allowed = STREAK.freezePer30 * (1 + Math.floor(n/30));
      if(spent.length >= allowed) break;
      spent.push(k);
      n++;                                   /* the day is carried, not counted as a win */
    }
    k=shift(k,-1);
  }
  return { days:n, frozen:spent.length, budget:STREAK.freezePer30 };
}
function missRun(hid){                        /* consecutive missed days, ending today */
  var k=today(), n=0, guard=0, h=null;
  for(var i=0;i<S.habits.length;i++) if(S.habits[i].id===hid) h=S.habits[i];
  if(!h || h.cadence==='weekly') return 0;
  while(guard++<120){
    if(!loggedOn(k)){ k=shift(k,-1); continue; }
    if(doneOn(h,k)) break;
    n++; k=shift(k,-1);
  }
  return n;
}
function automaticity(hid){                   /* PENDING-SPEC-15: formation is a count, not a feeling */
  var done=0, first=null;
  dates().forEach(function(k){ if(ckOf(k)[hid]){ done++; if(!first) first=k; } });
  return { done:done, first:first, formed:done>=STREAK.formedAt,
           pct:Math.min(100, Math.round(done/STREAK.formedAt*100)) };
}

/* ---- 90-DAY CONSISTENCY --------------------------------------------
   PENDING-SPEC-15 §2: rank and frame on CONSISTENCY over 90 days —
   frequency of completion — never on intensity or on the day-rating.
   Denominator is calendar days, so silence counts. That is the point. */
function consistency(n){
  var end=today(), hit=0, logged=0;
  for(var i=0;i<n;i++){
    var k=shift(end,-i), r=S.byDate[k];
    if(r && r.pct!=null && loggedOn(k)){ logged++; if(r.pct>=80) hit++; }
  }
  return { hit:hit, logged:logged, of:n, pct:Math.round(hit/n*100) };
}

/* ---- WEEKLY REVIEW — the Monday-seven feed ------------------------- */
function weekWindow(off){
  var d=dnum(today()); d.setDate(d.getDate()-d.getDay()-7*(off||0));
  var start=dk(d), a=[];
  for(var i=0;i<7;i++) a.push(shift(start,i));
  return a;
}
function weekStats(off){
  var ks=weekWindow(off), pcts=[], rats=[], jr=0, lg=0;
  ks.forEach(function(k){
    if(k>today()) return;
    var r=S.byDate[k];
    if(r && r.pct!=null && loggedOn(k)){ pcts.push(r.pct); lg++; }
    var v=ratingOf(k); if(v!=null) rats.push(v);
    var p=S.privAll[k]; if(p && (p.why||p.tasks||p.prayer)) jr++;
  });
  var avg=function(a){ return a.length? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10 : null; };
  return { logged:lg, adh:pcts.length?Math.round(avg(pcts)):null, rating:avg(rats), journal:jr, days:ks };
}
function paintWeekly(){
  var n=el('weekly'); if(!n) return;
  var a=weekStats(0), b=weekStats(1), c90=consistency(90);
  var flags=S.habits.filter(function(h){ return missRun(h.id)>=3; })
                    .map(function(h){ return { h:h, run:missRun(h.id) }; })
                    .sort(function(x,y){ return y.run-x.run; });
  var st=stats().filter(function(s){ return s.pct!=null && s.h.cadence!=='weekly'; })
                .sort(function(x,y){ return x.pct-y.pct; });
  var d=function(now,prev,suf){
    if(now==null) return '—';
    if(prev==null) return now+(suf||'');
    var v=Math.round((now-prev)*10)/10;
    return now+(suf||'')+' <s>'+(v>0?'+':'')+v+' vs last week</s>';
  };
  n.innerHTML=
    '<div class="wkrow">'+
      tp('Logged', a.logged+'<s>of 7</s>')+
      tp('Adherence', d(a.adh,b.adh,'%'))+
      tp('Rating', d(a.rating,b.rating,''))+
      tp('Journal', a.journal+'<s>of 7 days</s>')+
      tp('90-day consistency', c90.pct+'%<s>'+c90.hit+' days at 80%+</s>')+
      tp('Gaps', (function(){ var g=gaps(7); return g.missed+'<s>of 7 days</s>'; })())+
      tp('Called right', (function(){ var r=predictionRecord(30);
          return (r.made? r.kept+'<s>of '+r.made+' calls</s>' : '—<s>no calls</s>'); })())+
    '</div>'+
    (flags.length
      ? '<div class="flags"><span class="k">Off track — 3+ days running</span>'+
        flags.slice(0,6).map(function(f){
          return '<div class="fl"><span>'+esc(label(f.h.name))+'</span><b>'+f.run+' days</b></div>'; }).join('')+
        '<div class="s">Three consecutive misses is a structural flag, not a judgement — the standard '+
        'is either wrong, mis-cued, or genuinely dropped. Decide which at review.</div></div>'
      : '<div class="flags"><span class="k">Off track — 3+ days running</span>'+
        '<div class="s">Nothing is three days down. </div></div>')+
    (function(){ var rt=returnsIn(weekWindow(0));
      return rt.length
        ? '<div class="flags"><span class="k">Came back this week</span>'+
          rt.slice(0,6).map(function(r){ return '<div class="fl"><span>'+esc(label(r.h.name))+
            '</span><b>'+r.n+'×</b></div>'; }).join('')+
          '<div class="s">Returning after a miss is the most strongly evidenced move in this whole '+
          'ledger — it beats never having missed, because nobody sustains never.</div></div>'
        : ''; })()+
    '<div class="wk2"><div><span class="k">Weakest</span>'+
      st.slice(0,3).map(function(s){ return '<div class="fl"><span>'+esc(label(s.h.name))+'</span><b>'+s.pct+'%</b></div>'; }).join('')+
    '</div><div><span class="k">Strongest</span>'+
      st.slice(-3).reverse().map(function(s){ return '<div class="fl"><span>'+esc(label(s.h.name))+'</span><b>'+s.pct+'%</b></div>'; }).join('')+
    '</div></div>';
}

/* ---- MCII — rides the existing journal `why`, once a week ----------
   Implementation intentions with the obstacle named. It is a PROMPT on an
   existing field on one day a week, never a new field: DEC-058 holds. */
function isMcIIDay(){ return dnum(today()).getDay()===0; }   /* Sunday: set the week */
function paintMcII(){
  var n=el('mcii'); if(!n) return;
  if(!isMcIIDay()){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  n.innerHTML='<div class="mc"><span class="k">Sunday — set the week</span>'+
    '<div class="s">In the box below: <b>what do you want this week</b>, then <b>the obstacle</b> '+
    'that will actually get in the way, then <b>when-then</b> — "when &lt;obstacle&gt; happens, I will &lt;action&gt;". '+
    'Wanting it and naming what blocks it beats wanting it alone.</div></div>';
  var w=el('iWhy'); if(w && !w.value) w.placeholder='I want… · What gets in the way… · When that happens, I will…';
}

/* ---- YEAR VIEW ---------------------------------------------------- */
function paintYear(){
  var n=el('yearGrid'); if(!n) return;
  var y=(S.yearY==null? dnum(today()).getFullYear() : S.yearY);
  var lab=el('yearLab'); if(lab) lab.textContent=y;
  var cells='', start=new Date(y,0,1), end=new Date(y,11,31), first0=dates()[0]||null;
  var pad=start.getDay();
  for(var i=0;i<pad;i++) cells+='<i class="yc pad"></i>';
  for(var d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    var k=dk(d), r=S.byDate[k], p=(r&&r.pct!=null&&loggedOn(k))?r.pct:null;
    var past=(k<today()), gap=(p==null && past && (!first0 || k>=first0));
    cells+='<i class="yc'+(gap?' gap':'')+'" title="'+k+(p==null?(gap?' · GAP — no entry':' · no entry'):' · '+p+'%')+
      '" style="background:'+(p==null?'var(--sunk)':dens(p))+'"></i>';
  }
  n.innerHTML=cells;
  var c=el('yearC');
  if(c){
    var got=dates().filter(function(k){ return k.slice(0,4)===String(y); }).length;
    c.textContent=got+' days logged in '+y;
  }
}

/* ---- CUE COVERAGE — every below-median standard --------------------- */
function belowMedian(){
  var a=stats().filter(function(s){ return s.h.cadence!=='weekly'; });
  var v=a.map(function(s){ return s.pct==null?0:s.pct; }).sort(function(x,y){ return x-y; });
  if(!v.length) return {};
  var med=v[Math.floor(v.length/2)], m={};
  a.forEach(function(s){ if((s.pct==null?0:s.pct)<=med) m[s.h.id]=1; });
  return m;
}
function cueCoverage(){
  var need=belowMedian(), n=0, got=0;
  S.habits.forEach(function(h){ if(need[h.id]){ n++; if(h.cue) got++; } });
  return { need:n, got:got };
}

/* ---- 60-SECOND ONBOARDING — defaults, one action, no tour ----------
   PENDING-SPEC-15 §7/§8: first value inside 60 seconds; an empty state must
   state status, teach in place, and offer one direct path to populate.
   A stranger ticks a real standard within seconds of arriving. */
var STARTER = [
  { name:'Move for 20 minutes', minutes:20, group_name:'Morning', cadence:'daily' },
  { name:'Read 10 pages',        minutes:15, group_name:'Other',   cadence:'daily' },
  { name:'Lights out by 10:30',  minutes:0,  group_name:'Night',   cadence:'daily' }
];
function paintStarter(){
  var n=el('starter'); if(!n) return;
  if(S.habits.length){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  n.innerHTML='<div class="st1"><span class="k">Start here</span>'+
    '<div class="s">Three standards to begin with. Tick one tonight and you have used this properly. '+
    'Change them, delete them, add your own — later, in Settings.</div>'+
    STARTER.map(function(s){ return '<div class="fl"><span>'+esc(s.name)+'</span><b>'+
      (s.minutes?s.minutes+'m':'—')+'</b></div>'; }).join('')+
    '<div class="tools" style="padding-top:10px"><button class="btn pri" id="stGo">Start with these three</button></div></div>';
  var b=el('stGo');
  if(b) b.onclick=async function(){
    b.disabled=true; b.textContent='adding…';
    var ops=STARTER.map(function(s,i){
      return sb.from('habits').insert({ user_id:S.me.id, name:s.name, minutes:s.minutes,
        group_name:s.group_name, cadence:s.cadence, sort_order:i });
    });
    await Promise.all(ops);
    await load(); paintAll(); toast('three standards added — tick one');
  };
}


/* ==================================================================
   HT-6 — the five S-cost self-layer rocks (SPEC ruling R67).
   R-C showed-up streak · R-B self-prediction · R-D gain framing ·
   R-A miss-return reward · R-E missing day as a scored event.
   Additive. No new DAILY input surface: R-B is one optional tap on the
   existing close-the-day action, and it degrades to nothing when its
   column is absent.
   ================================================================== */

/* ---- R-C · SHOWED-UP STREAK ----------------------------------------
   Evidence: decoupling the streak from the performance target raised D14
   retention +3.3% and put +10.5% more daily users on a streak (Duolingo,
   A/B). The old streak keyed on >=80% and therefore measured the WRONG
   EVENT: it read 0 for weeks while days were being logged. The streak now
   counts the LOGGED day. The frozen-days budget is kept, unchanged, and
   now covers unlogged days only. */
function streakShowedUp(){
  var k=today(), n=0, spent=[], guard=0, first=dates()[0]||null;
  if(!loggedOn(k)) k=shift(k,-1);            /* today not logged yet is not a break */
  while(guard++<400){
    /* the walk stops where the ledger starts. Before the first logged day there is nothing to
       forgive, and spending freezes into pre-history inflates the streak past the record itself
       (rehearsal exhibit: 34 seeded days reported as 38). */
    if(first && k<first) break;
    if(loggedOn(k)){ n++; }
    else {
      /* budget bounded by the RUN, not by a sliding window (HT-5 exhibit) */
      var allowed = STREAK.freezePer30 * (1 + Math.floor(n/30));
      if(spent.length >= allowed) break;
      spent.push(k);
      n++;                                    /* carried, not counted as a win */
    }
    k=shift(k,-1);
  }
  return { days:n, frozen:spent.length, budget:STREAK.freezePer30, basis:'logged' };
}

/* ---- R-A · MISS-RETURN REWARD --------------------------------------
   Evidence: the winning arm of a 61,293-person / 54-arm megastudy rewarded
   people for RETURNING after a missed session (+0.40 weekly visits, +27%) —
   the best-evidenced mechanic in the whole scan. HT already forgave a miss;
   it never marked the return. Coming back is now the thing the ledger
   visibly credits. */
function prevLogged(k){
  for(var i=1;i<=60;i++){ var p=shift(k,-i); if(loggedOn(p)) return p; }
  return null;
}
function returnedOn(h,k){
  if(!h || h.cadence==='weekly') return false;
  if(!doneOn(h,k)) return false;
  var p=prevLogged(k);
  return !!p && !doneOn(h,p);                 /* done today, missed the last logged day */
}
function returnsIn(ks){
  var out=[];
  S.habits.forEach(function(h){
    var n=0;
    ks.forEach(function(k){ if(k<=today() && loggedOn(k) && returnedOn(h,k)) n++; });
    if(n) out.push({ h:h, n:n });
  });
  return out.sort(function(a,b){ return b.n-a.n; });
}

/* ---- R-E · A MISSING DAY IS A SCORED EVENT -------------------------
   Every product in eight categories treats a missing day as absence of
   data — the score just does not render. A gap is a result. It is counted,
   it is rendered, and it is named. */
function gaps(n){
  var end=today(), miss=0, first=dates()[0] || null;
  for(var i=1;i<=n;i++){                      /* i=1 — today is not yet a gap */
    var k=shift(end,-i);
    if(first && k<first) break;               /* before the ledger began is not a gap */
    if(!loggedOn(k)) miss++;
  }
  return { missed:miss, of:n, since:first };
}

/* ---- R-B · SELF-PREDICTION -----------------------------------------
   Evidence: self-prediction framing reaches g=0.25 where plain behaviour
   recording reaches g=0.07 — the largest legal upgrade in the scan, for one
   question. Asked ONCE, on the existing close-the-day action, about
   tomorrow. Stored on the day it is made; scored against the next day.
   NOT a new daily input surface: skipping it costs nothing and the whole
   feature hides when its column is absent. */
function predictionOf(k){                     /* the prediction MADE on day k, about k+1 */
  var p=S.privAll[k];
  if(!p) return null;
  var v=p.predict;
  return (v===true||v==='true'||v===1) ? true : (v===false||v==='false'||v===0) ? false : null;
}
function predictionRecord(n){
  var end=today(), made=0, kept=0;
  for(var i=1;i<=(n||30);i++){
    var day=shift(end,-i+1), prior=shift(day,-1);
    if(day>today()) continue;
    var pr=predictionOf(prior);
    if(pr===null) continue;
    if(!loggedOn(day)) { made++; continue; }   /* predicted and did not log = not kept */
    made++;
    var r=S.byDate[day];
    var hit=(r&&r.pct!=null&&r.pct>=80);
    if(pr===hit) kept++;
  }
  return { made:made, kept:kept, pct: made? Math.round(kept/made*100) : null };
}
async function savePredict(v){
  if(!S.hasPredict) return;
  var p=S.priv || (S.priv={});
  p.date=S.date; p.predict=v; S.privAll[S.date]=p;
  var res=await sb.from('day_private').upsert({
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||'',
    predict:v
  },{ onConflict:'user_id,date' });
  toast(res.error ? 'prediction not saved' : (v?'called it — yes':'called it — no'));
  paintPredict();
}
function paintPredict(){
  var n=el('predict'); if(!n) return;
  if(!S.hasPredict){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  var made=predictionOf(today()), rec=predictionRecord(30);
  n.innerHTML='<div class="pr"><span class="k">Tomorrow</span>'+
    '<div class="s">Will you hit your standards tomorrow? Calling it out loud is worth more than '+
    'recording today was — say it and the ledger checks.</div>'+
    '<div class="tools" style="padding-top:8px">'+
      '<button class="btn'+(made===true?' pri':'')+'" id="prY">Yes</button>'+
      '<button class="btn'+(made===false?' pri':'')+'" id="prN">No</button>'+
      '<span style="flex:1"></span>'+
      '<span class="s">'+(rec.made? ('called right '+rec.kept+' of '+rec.made) : 'no calls yet')+'</span>'+
    '</div></div>';
  var y=el('prY'), no=el('prN');
  if(y)  y.onclick=function(){ savePredict(true); };
  if(no) no.onclick=function(){ savePredict(false); };
}

/* ---- R-D · GAIN FRAMING --------------------------------------------
   Evidence: identical stakes, gain framing vs loss framing — 17.40 vs 11.29
   goal-days out of 20 (p=.007). The sheet used to lead with what was LEFT
   and what was OUTSTANDING. It now leads with what was EARNED. Same
   arithmetic; the subtraction is simply never the headline. */
function earned(k){ return committed() - remaining(k); }

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
