import fs from 'node:fs';
import path from 'node:path';
import { UsageDetails } from './details.mjs';

const fields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const empty = () => Object.fromEntries(fields.map(k => [k, 0]));
const number = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function cleanUsage(u) {
  if (!u || !number(u.input_tokens) || !number(u.output_tokens)) return null;
  return Object.fromEntries(fields.map(k => [k, k === 'total_tokens' ? u.input_tokens + u.output_tokens : number(u[k]) ? u[k] : 0]));
}
export function dayKey(date, timeZone = 'Europe/Oslo') {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}
function filesIn(dir, warnings) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesIn(path.join(dir, e.name), warnings) : e.name.endsWith('.jsonl') ? [path.join(dir, e.name)] : []); }
  catch (e) { if (e.code !== 'ENOENT') warnings.push('En loggmappe kunne ikke leses.'); return []; }
}
export function parseLog(text, filename = '') {
  let meta, model = 'Ukjent modell', badLines = 0, lastLimit = null;
  const modern = [], legacy = [];
  const contexts = new Map();
  let previous = empty();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { badLines++; continue; }
    const p = row.payload || {};
    if (row.type === 'session_meta' && !meta) meta = p;
    if (row.type === 'turn_context') {
      model = p.model || 'Ukjent modell';
      if(p.turn_id)contexts.set(p.turn_id,model);
    }
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time)) continue;
    if (row.type === 'token_usage_record') {
      const usage = cleanUsage(p.usage);
      const explicit=p.model || p.model_id;
      const matched=p.turn_id?contexts.get(p.turn_id):null;
      const eventModel=explicit || matched || (!p.turn_id?model:null) || 'Ukjent modell';
      const modelSource=eventModel==='Ukjent modell'?'unknown':explicit?'response':matched?'turn_context':'sequence_context';
      if (usage) modern.push({ key: p.response_id || `${p.thread_id || meta?.id}:${row.timestamp}:${JSON.stringify(usage)}`, thread: p.thread_id || meta?.id, time, model:eventModel,modelSource,kind:'response',turnId:p.turn_id||null, usage });
    }
    if (row.type === 'event_msg' && p.type === 'token_count') {
      if (p.rate_limits) lastLimit = { time, data: p.rate_limits };
      const total = cleanUsage(p.info?.total_token_usage);
      if (!total) continue;
      // Cumulative counters can repeat and can reset after a context change.
      const reset = total.total_tokens < previous.total_tokens;
      const delta = Object.fromEntries(fields.map(k => [k, Math.max(0, total[k] - (reset ? 0 : previous[k]))]));
      previous = total;
      if (delta.total_tokens > 0) legacy.push({ key: `legacy:${meta?.id || filename}:${row.timestamp}:${JSON.stringify(total)}`, thread: meta?.id, time, model,modelSource:model==='Ukjent modell'?'unknown':'sequence_context',kind:'legacy', usage: delta });
    }
  }
  // Modern per-response records are authoritative; never add their mirrored token_count events.
  const events = modern.length ? modern : legacy;
  return { meta: meta || {}, events, lastLimit, badLines, legacy: !modern.length && !!legacy.length };
}
const normalize = s => String(s || '').replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
function worktreeRoot(cwd) {
  // Git's own worktree metadata links a checkout back to its registered repository.
  try {
    const dotGit = fs.readFileSync(path.join(cwd, '.git'), 'utf8').trim();
    if (!dotGit.startsWith('gitdir:')) return null;
    const gitDir = path.resolve(cwd, dotGit.slice(7).trim());
    const common = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
    const commonDir = path.resolve(gitDir, common);
    return path.basename(commonDir) === '.git' ? path.dirname(commonDir) : null;
  } catch { return null; }
}
function projectFor(meta, thread, state) {
  const projects = Object.values(state['local-projects'] || {});
  const assignment = state['thread-project-assignments']?.[thread];
  const assigned = projects.find(p => p.id === assignment?.projectId);
  const projectless = state['projectless-thread-ids'] || [];
  if (!assigned && (Array.isArray(projectless) ? projectless.includes(thread) : projectless[thread])) return null;
  const cwd = meta.cwd || '';
  const worktree = worktreeRoot(cwd);
  const matched = assigned || projects.filter(p => (p.rootPaths || []).some(root => normalize(cwd) === normalize(root) || normalize(cwd).startsWith(normalize(root) + '/') || (worktree && normalize(worktree) === normalize(root)))).sort((a,b) => Math.max(...b.rootPaths.map(r=>r.length)) - Math.max(...a.rootPaths.map(r=>r.length)))[0];
  if (matched) return { id: matched.id, name: matched.name || path.win32.basename(matched.rootPaths[0]), path: matched.rootPaths[0] };
  return null;
}
export class LocalUsage {
  constructor(home, timeZone = 'Europe/Oslo') { this.home = home; this.timeZone = timeZone; this.cache = new Map(); }
  scan(now = Date.now()) {
    const warnings = [];
    const files = [...filesIn(path.join(this.home, 'sessions'), warnings), ...filesIn(path.join(this.home, 'archived_sessions'), warnings)];
    for (const cached of this.cache.keys()) if (!files.includes(cached)) this.cache.delete(cached);
    for (const file of files) {
      try {
        const s = fs.statSync(file), signature = `${s.size}:${s.mtimeMs}`;
        if (this.cache.get(file)?.signature !== signature) this.cache.set(file, { signature, ...parseLog(fs.readFileSync(file, 'utf8'), file) });
      } catch { warnings.push('En loggfil kunne ikke leses denne gangen.'); this.cache.delete(file); }
    }
    let state = {};
    try { state = JSON.parse(fs.readFileSync(path.join(this.home, '.codex-global-state.json'), 'utf8')); } catch {}
    const metas = new Map([...this.cache.values()].map(f => [f.meta.id, f.meta]));
    const titles = new Map();
    try { for (const line of fs.readFileSync(path.join(this.home,'session_index.jsonl'),'utf8').split('\n')) { try { const t=JSON.parse(line); if(t.id&&t.thread_name)titles.set(t.id,t.thread_name); } catch {} } } catch {}
    const labels=new Map();
    try {for(const m of JSON.parse(fs.readFileSync(path.join(this.home,'models_cache.json'),'utf8')).models||[])if(m.slug&&m.display_name)labels.set(m.slug,m.display_name);}catch{}
    const detailData=new UsageDetails(labels);
    const seen = new Set(), days = new Map(), projects = new Map(), models = new Map(), recent = new Map(), assignments = new Map();
    for (const p of Object.values(state['local-projects'] || {})) projects.set(p.id,{id:p.id,name:p.name || 'Uten prosjektnavn',path:(p.rootPaths||[])[0] || '',hasData:false,...empty()});
    const rootTask = meta => {
      const visited = new Set();
      while (meta.parent_thread_id && metas.has(meta.parent_thread_id) && !visited.has(meta.id)) { visited.add(meta.id);meta=metas.get(meta.parent_thread_id); }
      return meta;
    };
    const total = empty(), todayUsage = empty(), today = dayKey(now, this.timeZone);
    let earliest = null, latest = null, latestLimit = null, badLines = 0, legacyFiles = 0;
    for (const f of this.cache.values()) {
      badLines += f.badLines; legacyFiles += Number(f.legacy);
      if (f.lastLimit && (!latestLimit || f.lastLimit.time > latestLimit.time)) latestLimit = f.lastLimit;
      for (const e of f.events) {
        if (seen.has(e.key)) continue;
        seen.add(e.key);
        const day = dayKey(e.time, this.timeZone);
        const ownTask=metas.get(e.thread)||f.meta;
        const task = rootTask(ownTask);
        if (!assignments.has(e.thread)) assignments.set(e.thread, projectFor(metas.get(e.thread) || f.meta,e.thread,state) || projectFor(task,task.id,state));
        const project = assignments.get(e.thread);
        if (!days.has(day)) days.set(day, { date: day, ...empty() });
        let group;
        if (project) {
          if (!projects.has(project.id)) projects.set(project.id,{...project,...empty()});
          group = projects.get(project.id);group.hasData = true;
        } else {
          const id = task.id || e.thread || 'unknown';
          if (!recent.has(id)) recent.set(id,{id,name:titles.get(id)||task.title||'Samtale uten tittel',hasData:true,lastActivity:e.time,...empty()});
          group = recent.get(id);group.lastActivity = Math.max(group.lastActivity,e.time);
        }
        if (!models.has(e.model)) models.set(e.model, { id:e.model, name:labels.get(e.model)||e.model, ...empty() });
        detailData.record(`${project?'project':'recent'}:${group.id}`,e,{
          id:e.thread||ownTask.id||'unknown',
          name:titles.get(e.thread)||ownTask.title||(ownTask.parent_thread_id?`Underagent${ownTask.agent_nickname?' · '+ownTask.agent_nickname:''}`:'Samtale uten tittel'),
          role:ownTask.parent_thread_id?'Underagent':'Hovedoppgave',parentId:ownTask.parent_thread_id||null,
          parentName:titles.get(ownTask.parent_thread_id)||null
        });
        for (const bucket of [total, days.get(day), group, models.get(e.model), ...(day === today ? [todayUsage] : [])]) for (const k of fields) bucket[k] += e.usage[k];
        earliest = earliest === null ? e.time : Math.min(earliest, e.time);
        latest = latest === null ? e.time : Math.max(latest, e.time);
      }
    }
    if (badLines) warnings.push(`${badLines} ufullstendige eller ugyldige logglinjer er hoppet over; de prøves igjen når filen endres.`);
    if (legacyFiles) warnings.push(`${legacyFiles} eldre loggfiler bruker differanser i kumulative tellere; tidspunkt og forgreninger kan være mindre presise.`);
    for(const p of projects.values())p.details=detailData.get(`project:${p.id}`);
    for(const r of recent.values())r.details=detailData.get(`recent:${r.id}`);
    return { today, timeZone: this.timeZone, todayUsage, total, days: [...days.values()].sort((a,b)=>a.date.localeCompare(b.date)), projects: [...projects.values()].sort((a,b)=>b.total_tokens-a.total_tokens), recent: [...recent.values()].sort((a,b)=>b.lastActivity-a.lastActivity), models: [...models.values()].sort((a,b)=>b.total_tokens-a.total_tokens), earliest, latest, latestLimit, files: files.length, responses: seen.size, warnings: [...new Set(warnings)] };
  }
}
export function normalizeLimits(result) {
  const buckets = result?.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length ? result.rateLimitsByLimitId : result?.rateLimits ? { [result.rateLimits.limitId || 'codex']: result.rateLimits } : {};
  return Object.entries(buckets).flatMap(([id,b]) => ['primary','secondary'].flatMap(slot => {
    const w = b[slot];
    if (!w) return [];
    return [{ id, name: b.limitName || (id === 'codex' ? 'Codex' : id), slot, used: number(w.usedPercent) ? w.usedPercent : null, remaining: number(w.usedPercent) ? Math.max(0, Math.min(100, 100 - w.usedPercent)) : null, minutes: w.windowDurationMins ?? null, resetsAt: w.resetsAt ?? null }];
  })).sort((a,b) => Number(b.id === 'codex') - Number(a.id === 'codex'));
}
export function logLimits(snapshot) {
  if (!snapshot) return [];
  const b = snapshot.data;
  const window = w => w ? { usedPercent: w.used_percent, windowDurationMins: w.window_minutes, resetsAt: w.resets_at } : null;
  return normalizeLimits({rateLimits: {limitId:b.limit_id, limitName:b.limit_name,primary:window(b.primary),secondary:window(b.secondary)}});
}
