import {detailHTML,share} from './detail-view.js';
const $ = id => document.getElementById(id);
const painted = new Map();
function paint(id, html) { if (painted.get(id) !== html) { $(id).innerHTML = html; painted.set(id, html); } }
const fmt = n => typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat('nb-NO').format(n) : '—';
const time = n => n ? new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo'}).format(new Date(n)) : 'ukjent tidspunkt';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const windowLabel = n => n === 10080 ? 'Ukesgrense' : n === 300 ? '5-timersgrense' : n ? `${fmt(n / 60)} timer` : 'Ukjent periode';
let data, source = 'account';
let selectedDetail=null,detailSignature='';
$('closeDetail').addEventListener('click',()=>$('detailDialog').close());
$('detailDialog').addEventListener('close',()=>{selectedDetail=null;detailSignature='';});
for(const name of ['projects','recent'])$(name).addEventListener('click',event=>{
  const button=event.target.closest('[data-detail-id]');
  if(!button)return;
  selectedDetail={kind:button.dataset.detailKind,id:button.dataset.detailId};detailSignature='';
  renderDetail();$('detailDialog').showModal();
});
function renderDetail() {
  if(!selectedDetail||!data?.local)return;
  const group=data.local[selectedDetail.kind==='project'?'projects':'recent'].find(r=>r.id===selectedDetail.id);
  if(!group){$('detailBody').textContent='Disse lokale dataene er ikke tilgjengelige lenger.';return;}
  $('detailTitle').textContent=group.name;
  const signature=JSON.stringify(group);
  if(signature!==detailSignature){
    const opened=new Set([...$('detailBody').querySelectorAll('details[open]')].map(d=>d.dataset.actor));
    const scroll=$('detailDialog').scrollTop;
    $('detailBody').innerHTML=detailHTML(group,data.local.timeZone);
    for(const detail of $('detailBody').querySelectorAll('details'))detail.open=opened.has(detail.dataset.actor);
    $('detailDialog').scrollTop=scroll;detailSignature=signature;
  }
  $('detailUpdated').textContent=`Oppdateres automatisk · siste lokale sjekk ${time(data.localUpdatedAt)}`;
}
$('date').textContent = new Intl.DateTimeFormat('nb-NO',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Oslo'}).format(new Date());
document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>{source=b.dataset.source;document.querySelectorAll('[data-source]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderHistory();}));
$('range').addEventListener('change',renderHistory);
$('projectSearch').addEventListener('input',renderLists);
$('recentSearch').addEventListener('input',renderLists);
function ranks(rows, type) {
  if (!rows?.length) return '<p class="empty">Ingen lokale tokenposter ennå. Oversikten fylles automatisk når Codex lagrer bruk.</p>';
  const total = data.local.total.total_tokens;
  return rows.map((r,i)=>{
    const clickable=type==='project'||type==='recent',tag=clickable?'button':'div';
    return `<${tag} class="rank${clickable?' rank-button':''}"${clickable?` type="button" data-detail-kind="${type}" data-detail-id="${esc(r.id)}" aria-label="Vis modellbruk for ${esc(r.name)}"`:''}><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-main"><div class="rank-title"><strong>${esc(r.name)}</strong><b>${r.hasData===false?'—':fmt(r.total_tokens)}</b></div><div class="rank-path">${r.hasData===false?'Ingen lokale bruksdata ennå':type==='project'?esc(r.path):type==='recent'?`Siste aktivitet ${time(r.lastActivity)}`:`${fmt(r.input_tokens)} inn · ${fmt(r.output_tokens)} ut`}${r.hasData===false?'':` · ${fmt(share(r.total_tokens,total))} % av alle lokale tokens`}</div><div class="meter"><span style="width:${share(r.total_tokens,total)}%"></span></div>${clickable?'<span class="detail-link">Vis modeller og oppgaver →</span>':''}</div></${tag}>`;
  }).join('');
}
function renderLists() {
  if (!data?.local) return;
  const l=data.local;
  const projects=l.projects.filter(r=>`${r.name} ${r.path}`.toLocaleLowerCase('nb').includes($('projectSearch').value.toLocaleLowerCase('nb')));
  const recent=(l.recent||[]).filter(r=>r.name.toLocaleLowerCase('nb').includes($('recentSearch').value.toLocaleLowerCase('nb')));
  paint('projects',projects.length?ranks(projects,'project'):'<p class="empty">Ingen registrerte prosjekter matcher søket.</p>');
  $('projectCount').textContent=`${l.projects.length} ${l.projects.length===1?'prosjekt':'prosjekter'}`;
  $('projectListNote').textContent=`Viser ${projects.length} av ${l.projects.length}. Bla i listen for å se alle. Andelene gjelder alle tokens på denne PC-en, alle registrerte dager, og endres ikke av søk.`;
  paint('recent',recent.length?ranks(recent,'recent'):'<p class="empty">Ingen samtaler uten prosjekt matcher søket.</p>');
  $('recentCount').textContent=`${recent.length} samtaler`;
}
function renderHistory() {
  if (!data?.local) return;
  const account = source === 'account';
  const raw = account ? data.account.usage?.dailyUsageBuckets : data.local.days;
  const rows = (raw || []).map(r=>({date:r.startDate || r.date,tokens:r.tokens ?? r.total_tokens})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.tokens==='number').sort((a,b)=>a.date.localeCompare(b.date));
  if (!rows.length) {
    $('chart').innerHTML='<div class="empty">Ingen dagshistorikk tilgjengelig fra denne datakilden ennå.</div>';
    $('daysTable').innerHTML='';$('historyNote').textContent=account?'Kontohistorikk er ikke rapportert ennå. Lokal historikk finnes under «Denne PC-en».':'Bare aktivitet lagret på denne PC-en vises her.';return;
  }
  const today = data.local.today, count = $('range').value;
  const end = new Date(`${today}T12:00:00Z`), start = count==='all' ? new Date(`${rows[0].date}T12:00:00Z`) : new Date(end.getTime()-(Number(count)-1)*86400000);
  const byDay = new Map(rows.map(r=>[r.date,r.tokens])), days=[];
  for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)) {const date=d.toISOString().slice(0,10);days.push({date,tokens:byDay.has(date)?byDay.get(date):null});}
  const max = Math.max(...days.map(r=>r.tokens || 0),1);
  $('chart').innerHTML=days.map((r,i)=>{const label = r.date.slice(8)+'.'+r.date.slice(5,7), text=r.tokens===null?'Ikke rapportert':fmt(r.tokens)+' tokens';return `<div class="bar-col"><div class="bar-space">${r.tokens===null?`<span class="missing" title="${label}: Ikke rapportert"></span>`:`<div class="bar" tabindex="0" role="img" aria-label="${label}: ${text}" style="height:${Math.max(1,r.tokens/max*85)}%"><span class="tooltip">${label} · ${text}</span></div>`}</div><span class="bar-label">${days.length<=31||i%7===0?label:''}</span></div>`;}).join('');
  $('daysTable').innerHTML=[...days].reverse().map(r=>`<tr><td>${r.date}</td><td>${r.tokens===null?'Ikke rapportert':fmt(r.tokens)}</td></tr>`).join('');
  $('historyNote').textContent=account?`Kontoens rapporterte dagstall · sist rapporterte dag: ${rows.at(-1).date}. Dagens lokale bruk vises i kortet øverst. Kontodagenes tidssone er ikke oppgitt av datakilden.`:`Lokale dagstall i ${data.local.timeZone}. Prikkede dager mangler registrerte data.`;
}
function render() {
  const l=data.local, a=data.account;
  if (!l) return;
  $('date').textContent = new Intl.DateTimeFormat('nb-NO',{weekday:'long',day:'numeric',month:'long',timeZone:l.timeZone}).format(new Date());
  $('today').textContent=l.responses ? fmt(l.todayUsage.total_tokens) : '—';
  $('todaySub').textContent=l.responses ? `Registrert ${l.today} · ${l.timeZone}` : 'Ingen lokale tokenposter tilgjengelig ennå.';
  $('todayIn').textContent=`Samlet input: ${fmt(l.todayUsage.input_tokens)} · inkludert gjenbrukt input`;
  $('todayFresh').textContent=fmt(Math.max(0,l.todayUsage.input_tokens-l.todayUsage.cached_input_tokens));$('todayOut').textContent=fmt(l.todayUsage.output_tokens);$('todayCache').textContent=fmt(l.todayUsage.cached_input_tokens);
  $('lifetime').textContent=fmt(a.usage?.summary?.lifetimeTokens);
  $('lifetimeSub').textContent=a.usageUpdatedAt?`Kontoens rapporterte total · hentet ${time(a.usageUpdatedAt)}`:'Kontototalen er foreløpig ikke tilgjengelig.';
  $('localTotal').textContent=l.responses?fmt(l.total.total_tokens):'—';
  const limits=a.limitsUpdatedAt?a.limits:data.fallbackLimits;
  const main=limits.find(w=>w.id==='codex'&&w.slot==='primary');
  const stamp=a.limitsUpdatedAt || l.latestLimit?.time;
  const historical=!a.limitsUpdatedAt, stale=historical || !!a.limitsError || (stamp && Date.now()-stamp>120000);
  const expired=main?.resetsAt && main.resetsAt*1000<Date.now();
  $('remaining').textContent=main?.remaining != null && !expired?`${fmt(main.remaining)} %`:'—';
  $('window').textContent=main?windowLabel(main.minutes):'';
  $('quotaBar').style.width=`${!expired ? main?.remaining || 0 : 0}%`;
  $('reset').textContent=main?.resetsAt?`${expired?'Sist kjente nullstilling':'Nullstilles'} ${time(main.resetsAt*1000)}`:'Tidspunkt for nullstilling er ikke tilgjengelig.';
  $('quotaStamp').textContent=stamp?`${historical?'Sist lagret i lokal logg':stale?'Sist kjente kontoverdi':'Hentet fra konto'} ${time(stamp)}${stale?' · kan være utdatert':''}`:'Venter på Codex-forbindelsen …';
  renderLists();
  paint('models',ranks(l.models,'model'));
  $('limits').innerHTML=limits.length?limits.map(w=>{const expired=w.resetsAt&&w.resetsAt*1000<Date.now();return `<div class="limit-item"><div class="limit-top"><strong>${esc(w.name)}</strong><span>${expired?'Utdatert':w.remaining===null?'Ukjent':fmt(w.remaining)+' % igjen'}</span></div><div class="meter"><span style="width:${!expired?w.remaining||0:0}%"></span></div><p>${windowLabel(w.minutes)}${w.used!==null?' · '+fmt(w.used)+' % brukt':''}<br>${expired?'Sist kjente nullstilling':'Nullstilles'} ${time(w.resetsAt? w.resetsAt*1000:null)}${stale?'<br>Sist kjente verdi · kan være utdatert':''}</p></div>`;}).join(''):'<p class="empty">Kontogrenser er ikke tilgjengelige ennå. Programmet prøver igjen automatisk.</p>';
  $('coverage').textContent=`${l.files} lokale loggfiler · ${fmt(l.responses)} unike tokenposter${l.earliest?' · fra '+time(l.earliest):''}. Bare registrerte Codex-prosjekter vises som prosjekter. Samtaler uten prosjekttilknytning vises under Nylige.`;
  $('warnings').textContent=l.warnings.join(' ');
  $('updated').textContent=`Siste lokale sjekk: ${time(data.localUpdatedAt)}. Siste tokenpost: ${time(l.latest)}.`;
  const errors=[data.localError,a.limitsError,a.usageError].filter(Boolean);
  $('error').hidden=!errors.length;$('error').textContent=[...new Set(errors)].join(' ')+' Tidligere hentede tall beholdes med sitt opprinnelige tidspunkt.';
  $('status').textContent=errors.length?'Kjører · prøver forbindelsen igjen':'Følger med automatisk';$('statusDot').classList.toggle('off',!!errors.length);
  renderHistory();
  renderDetail();
}
async function update() {
  try {const response=await fetch('/api/usage',{cache:'no-store'});if(!response.ok)throw new Error();data=await response.json();render();}
  catch {$('status').textContent='Forbindelsen er brutt';$('statusDot').classList.add('off');$('error').hidden=false;$('error').textContent='Programmet svarer ikke. Viste tall er sist hentede verdier. Start Token info igjen hvis det er stoppet.';}
  finally {setTimeout(update,5000);}
}
update();
