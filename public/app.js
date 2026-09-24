import {detailHTML,share,displayName} from './detail-view.js';
import {languages,translator,formatting,localeFor,loadBrowserLanguage,saveBrowserLanguage,errorKey,warningText} from './i18n.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=window.localStorage;}catch{}
let language=loadBrowserLanguage(storage,navigator.languages||[navigator.language]);
try{if(window.tiLanguage)language=await window.tiLanguage.get();}catch{}
let t=translator(language), f=formatting(language), data, source='account', selectedDetail=null, detailSignature='', customFolders=[], folderError=null, offline=false;
const painted=new Map();
const fmt=n=>f.number(n), time=n=>f.time(n);
const windowLabel=n=>n===10080?t('weekly'):n===300?t('fiveHours'):n?t('hours',{n:fmt(n/60)}):t('unknownPeriod');
function paint(id,html){if(painted.get(id)!==html){$(id).innerHTML=html;painted.set(id,html);}}
function localize(){
  t=translator(language);f=formatting(language,data?.local?.timeZone||'Europe/Oslo');
  document.documentElement.lang=language;
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  for(const attr of ['aria-label','placeholder'])document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el=>el.setAttribute(attr,t(el.getAttribute(`data-i18n-${attr}`))));
  document.querySelectorAll('[data-days]').forEach(el=>el.textContent=t('days',{n:f.number(Number(el.dataset.days))}));
  $('language').value=language;$('date').textContent=f.today();painted.clear();detailSignature='';
  showCustomProjects();if(data)render();if(offline)showOffline();
}
$('language').innerHTML=Object.entries(languages).map(([code,name])=>`<option value="${code}">${name}</option>`).join('');
$('language').addEventListener('change',async()=>{
  const next=$('language').value;$('language').disabled=true;$('languageMessage').textContent='';
  try{
    if(window.tiLanguage){const result=await window.tiLanguage.set(next);if(result.error)throw new Error();}
    else if(!saveBrowserLanguage(storage,next))throw new Error();
    language=next;localize();
  }catch{$('language').value=language;$('languageMessage').textContent=t('languageSaveError');}
  finally{$('language').disabled=false;}
});
const projectBridge=window.tiProjects;let projectBusy=false;
function showCustomProjects(){
  $('customProjects').innerHTML=customFolders.length?customFolders.map(p=>`<div class="custom-project"><div><strong>${esc(p.name)}</strong><small>${esc(p.path)}</small></div><button type="button" data-remove-project="${esc(p.id)}" aria-label="${esc(t('removeNamed',{name:p.name}))}">${t('removeFolder')}</button></div>`).join(''):`<p class="muted">${t('noFolders')}</p>`;
  $('projectMessage').textContent=folderError?t(folderError):'';
}
async function projectAction(action,id){
  if(projectBusy||!projectBridge)return;
  projectBusy=true;$('addProject').disabled=true;folderError=null;showCustomProjects();
  try{const result=await projectBridge[action](id);if(result.error)throw new Error(result.error);customFolders=result.projects;showCustomProjects();if(action!=='list')await update(false);}
  catch(error){folderError=errorKey(error.message);showCustomProjects();}
  finally{projectBusy=false;$('addProject').disabled=false;}
}
$('addProject').hidden=!projectBridge;$('manageProjects').hidden=!projectBridge;
$('addProject').addEventListener('click',()=>projectAction('add'));
$('customProjects').addEventListener('click',event=>{const b=event.target.closest('[data-remove-project]');if(b)projectAction('remove',b.dataset.removeProject);});
$('closeDetail').addEventListener('click',()=>$('detailDialog').close());
$('detailDialog').addEventListener('close',()=>{selectedDetail=null;detailSignature='';});
for(const name of ['projects','recent'])$(name).addEventListener('click',event=>{
  const b=event.target.closest('[data-detail-id]');if(!b)return;
  selectedDetail={kind:b.dataset.detailKind,id:b.dataset.detailId};detailSignature='';renderDetail();$('detailDialog').showModal();
});
function renderDetail(){
  if(!selectedDetail||!data?.local)return;
  const group=data.local[selectedDetail.kind==='project'?'projects':'recent'].find(r=>r.id===selectedDetail.id);
  if(!group){$('detailBody').textContent=t('unavailableDetail');return;}
  $('detailTitle').textContent=displayName(group,t);
  const signature=language+JSON.stringify(group);
  if(signature!==detailSignature){
    const opened=new Set([...$('detailBody').querySelectorAll('details[open]')].map(d=>d.dataset.actor)),scroll=$('detailDialog').scrollTop;
    $('detailBody').innerHTML=detailHTML(group,data.local.timeZone,language);
    for(const d of $('detailBody').querySelectorAll('details'))d.open=opened.has(d.dataset.actor);
    $('detailDialog').scrollTop=scroll;detailSignature=signature;
  }
  $('detailUpdated').textContent=t('autoUpdated',{time:time(data.localUpdatedAt)});
}
document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>{source=b.dataset.source;document.querySelectorAll('[data-source]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderHistory();}));
$('range').addEventListener('change',renderHistory);$('projectSearch').addEventListener('input',renderLists);$('recentSearch').addEventListener('input',renderLists);
function ranks(rows,type){
  if(!rows?.length)return `<p class="empty">${t('noUsage')}</p>`;
  const total=data.local.total.total_tokens;
  return rows.map((r,i)=>{
    const clickable=type==='project'||type==='recent',tag=clickable?'button':'div',name=displayName(r,t);
    const sub=r.hasData===false?t('noProjectUsage'):type==='project'?r.path:type==='recent'?`${t('lastActivity')}: ${time(r.lastActivity)}`:`${t('input')}: ${fmt(r.input_tokens)} · ${t('output')}: ${fmt(r.output_tokens)}`;
    return `<${tag} class="rank${clickable?' rank-button':''}"${clickable?` type="button" data-detail-kind="${type}" data-detail-id="${esc(r.id)}" aria-label="${esc(t('viewModels',{name}))}"`:''}><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-main"><div class="rank-title"><strong>${esc(name)}</strong><b>${r.hasData===false?'—':fmt(r.total_tokens)}</b></div><div class="rank-path">${esc(sub)}${r.hasData===false?'':` · ${t('localShare',{n:fmt(share(r.total_tokens,total))})}`}</div><div class="meter"><span style="width:${share(r.total_tokens,total)}%"></span></div>${clickable?`<span class="detail-link">${t('viewDetails')}</span>`:''}</div></${tag}>`;
  }).join('');
}
function renderLists(){
  if(!data?.local)return;const l=data.local,lower=s=>String(s).toLocaleLowerCase(localeFor(language));
  const projects=l.projects.filter(r=>lower(`${r.name} ${r.path}`).includes(lower($('projectSearch').value)));
  const recent=(l.recent||[]).filter(r=>lower(displayName(r,t)).includes(lower($('recentSearch').value)));
  paint('projects',projects.length?ranks(projects,'project'):`<p class="empty">${t('noProjects')}</p>`);
  $('projectCount').textContent=t('projectCount',{n:fmt(l.projects.length)});
  $('projectListNote').textContent=t('listNote',{shown:fmt(projects.length),total:fmt(l.projects.length)});
  paint('recent',recent.length?ranks(recent,'recent'):`<p class="empty">${t('noRecent')}</p>`);
  $('recentCount').textContent=t('conversationCount',{n:fmt(recent.length)});
}
function renderHistory(){
  if(!data?.local)return;const account=source==='account';
  const raw=account?data.account.usage?.dailyUsageBuckets:data.local.days;
  const rows=(raw||[]).map(r=>({date:r.startDate||r.date,tokens:r.tokens??r.total_tokens})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.tokens==='number').sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length){$('chart').innerHTML=`<div class="empty">${t('noHistory')}</div>`;$('daysTable').innerHTML='';$('historyNote').textContent=t(account?'accountHistoryMissing':'localOnly');return;}
  const count=$('range').value,end=new Date(`${data.local.today}T12:00:00Z`),start=count==='all'?new Date(`${rows[0].date}T12:00:00Z`):new Date(end.getTime()-(Number(count)-1)*86400000);
  const byDay=new Map(rows.map(r=>[r.date,r.tokens])),days=[];
  for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);days.push({date,tokens:byDay.has(date)?byDay.get(date):null});}
  const max=Math.max(...days.map(r=>r.tokens||0),1);
  $('chart').innerHTML=days.map((r,i)=>{const label=f.day(r.date,true),value=r.tokens===null?t('notReported'):`${fmt(r.tokens)} ${t('tokens')}`;return `<div class="bar-col"><div class="bar-space">${r.tokens===null?`<span class="missing" title="${esc(label+': '+value)}"></span>`:`<div class="bar" tabindex="0" role="img" aria-label="${esc(label+': '+value)}" style="height:${Math.max(1,r.tokens/max*85)}%"><span class="tooltip">${esc(label)} · ${value}</span></div>`}</div><span class="bar-label">${days.length<=31||i%7===0?esc(label):''}</span></div>`;}).join('');
  $('daysTable').innerHTML=[...days].reverse().map(r=>`<tr><td>${f.day(r.date)}</td><td>${r.tokens===null?t('notReported'):fmt(r.tokens)}</td></tr>`).join('');
  $('historyNote').textContent=account?t('accountHistoryNote',{date:f.day(rows.at(-1).date)}):t('localHistoryNote',{zone:data.local.timeZone});
}
function render(){
  const l=data.local,a=data.account;if(!l){$('error').hidden=false;$('error').textContent=t('localError');$('status').textContent=t('retrying');$('statusDot').classList.add('off');return;}f=formatting(language,l.timeZone);$('date').textContent=f.today();
  $('today').textContent=l.responses?fmt(l.todayUsage.total_tokens):'—';$('todaySub').textContent=l.responses?`${t('recorded')}: ${f.day(l.today)} · ${l.timeZone}`:t('noUsage');
  $('todayIn').textContent=`${t('inputTotal')}: ${fmt(l.todayUsage.input_tokens)}`;
  $('todayFresh').textContent=fmt(Math.max(0,l.todayUsage.input_tokens-l.todayUsage.cached_input_tokens));$('todayOut').textContent=fmt(l.todayUsage.output_tokens);$('todayCache').textContent=fmt(l.todayUsage.cached_input_tokens);
  $('lifetime').textContent=fmt(a.usage?.summary?.lifetimeTokens);$('lifetimeSub').textContent=a.usageUpdatedAt?t('accountFetched',{time:time(a.usageUpdatedAt)}):t('accountMissing');$('localTotal').textContent=l.responses?fmt(l.total.total_tokens):'—';
  const limits=a.limitsUpdatedAt?a.limits:data.fallbackLimits,main=limits.find(w=>w.id==='codex'&&w.slot==='primary');
  const stamp=a.limitsUpdatedAt||l.latestLimit?.time,historical=!a.limitsUpdatedAt,stale=historical||!!a.limitsError||(stamp&&Date.now()-stamp>120000),expired=main?.resetsAt&&main.resetsAt*1000<Date.now();
  $('remaining').textContent=main?.remaining!=null&&!expired?`${fmt(main.remaining)} %`:'—';$('window').textContent=main?windowLabel(main.minutes):'';$('quotaBar').style.width=`${!expired?main?.remaining||0:0}%`;
  $('reset').textContent=main?.resetsAt?`${t(expired?'lastReset':'resets')}: ${time(main.resetsAt*1000)}`:t('resetMissing');
  $('quotaStamp').textContent=stamp?`${t(historical?'fromLog':stale?'lastAccount':'fromAccount')}: ${time(stamp)}${stale?' · '+t('stale'):''}`:t('waiting');
  renderLists();paint('models',ranks(l.models,'model'));
  $('limits').innerHTML=limits.length?limits.map(w=>{const expired=w.resetsAt&&w.resetsAt*1000<Date.now();return `<div class="limit-item"><div class="limit-top"><strong>${esc(w.name)}</strong><span>${expired?t('expired'):w.remaining===null?t('unknown'):t('remaining',{n:fmt(w.remaining)})}</span></div><div class="meter"><span style="width:${!expired?w.remaining||0:0}%"></span></div><p>${windowLabel(w.minutes)}${w.used!==null?' · '+t('used',{n:fmt(w.used)}):''}<br>${t(expired?'lastReset':'resets')}: ${time(w.resetsAt?w.resetsAt*1000:null)}${stale?'<br>'+t('stale'):''}</p></div>`;}).join(''):`<p class="empty">${t('limitsMissing')}</p>`;
  $('coverage').textContent=t('coverageCount',{files:fmt(l.files),records:fmt(l.responses)})+(l.earliest?` · ${t('from')}: ${time(l.earliest)}`:'')+'. '+t('coverageSource');
  $('warnings').textContent=l.warnings.map(w=>warningText(w,t,fmt)).join(' ');$('updated').textContent=`${t('lastCheck')}: ${time(data.localUpdatedAt)}. ${t('lastRecord')}: ${time(l.latest)}.`;
  const errors=[data.localError,a.limitsError,a.usageError].filter(Boolean);$('error').hidden=!errors.length;$('error').textContent=[...new Set(errors.map(e=>t(errorKey(e))))].join(' ')+' '+t('previousData');
  $('status').textContent=t(errors.length?'retrying':'live');$('statusDot').classList.toggle('off',!!errors.length);renderHistory();renderDetail();
}
function showOffline(){$('status').textContent=t('disconnected');$('statusDot').classList.add('off');$('error').hidden=false;$('error').textContent=t('serverError');}
async function update(schedule=true){
  try{const response=await fetch('/api/usage',{cache:'no-store'});if(!response.ok)throw new Error();data=await response.json();offline=false;render();}
  catch{offline=true;showOffline();}finally{if(schedule)setTimeout(update,5000);}
}
localize();if(projectBridge)projectAction('list');update();
