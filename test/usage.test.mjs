import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLog, LocalUsage, dayKey, normalizeLimits } from '../usage.mjs';
const row=(type,payload,timestamp='2026-09-10T12:00:00Z')=>JSON.stringify({type,payload,timestamp});
const usage=(input,output=10)=>({input_tokens:input,output_tokens:output,cached_input_tokens:input/2,reasoning_output_tokens:5,total_tokens:input+output});
const meta=id=>row('session_meta',{id,cwd:'C:\\work\\Demo'});
const record=(id,input=100,time)=>row('token_usage_record',{thread_id:'a',response_id:id,usage:usage(input)},time);
const legacy=(input,time)=>row('event_msg',{type:'token_count',info:{total_token_usage:usage(input)}},time);
test('counts response once, with cache and reasoning included rather than added',()=>{
 const parsed=parseLog([meta('a'),record('r'),legacy(100)].join('\n'));
 assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].usage.total_tokens,110);
});
test('legacy repeated counters and resets produce nonnegative deltas',()=>{
 const parsed=parseLog([meta('a'),legacy(100),legacy(100),legacy(200),legacy(50)].join('\n'));
 assert.deepEqual(parsed.events.map(e=>e.usage.total_tokens),[110,100,60]);
});
test('Oslo midnight and winter timezone',()=>{
 assert.equal(dayKey('2026-09-10T22:30:00Z'),'2026-09-11');
 assert.equal(dayKey('2026-01-10T22:30:00Z'),'2026-01-10');
});
test('invalid and partial lines do not prevent valid record import',()=>{
 const p=parseLog([meta('a'),'{broken',record('r'),row('token_usage_record',{usage:{input_tokens:-1,output_tokens:2}})].join('\n'));
 assert.equal(p.events.length,1);assert.equal(p.badLines,1);
});
test('multiple model contexts retain model per response',()=>{
 const p=parseLog([meta('a'),row('turn_context',{model:'alpha'}),record('1'),row('turn_context',{model:'beta'}),record('2')].join('\n'));
 assert.deepEqual(p.events.map(e=>e.model),['alpha','beta']);
});
test('scan deduplicates copied responses, discovers projects, updates and archives',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'token-info-test-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 fs.mkdirSync(path.join(home,'sessions'));fs.mkdirSync(path.join(home,'archived_sessions'));
 const f=path.join(home,'sessions','a.jsonl');fs.writeFileSync(f,[meta('a'),record('r')].join('\n'));
 fs.writeFileSync(path.join(home,'archived_sessions','copy.jsonl'),[meta('a'),record('r')].join('\n'));
 const scan=new LocalUsage(home);let result=scan.scan(Date.parse('2026-09-10T15:00:00Z'));
 assert.equal(result.total.total_tokens,110);assert.equal(result.projects.length,0);assert.equal(result.recent.length,1);assert.equal(result.todayUsage.total_tokens,110);
 fs.appendFileSync(f,'\n'+record('r2',200));result=scan.scan();assert.equal(result.total.total_tokens,320);
 fs.writeFileSync(path.join(home,'sessions','b.jsonl'),[row('session_meta',{id:'b',cwd:'C:\\work\\New'}),row('token_usage_record',{thread_id:'b',response_id:'b1',usage:usage(50)})].join('\n'));
 assert.equal(scan.scan().projects.length,0);assert.equal(scan.scan().recent.length,2);
 fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify({'local-projects':{p:{id:'p',name:'Riktig prosjektnavn',rootPaths:['C:\\work\\Demo']}},'thread-project-assignments':{a:{projectId:'p'}}}));
 assert.equal(scan.scan().projects[0].name,'Riktig prosjektnavn');
 assert.equal(scan.scan().projects[0].total_tokens,320);
 assert.equal(scan.scan().recent[0].total_tokens,60);
 assert.equal(scan.scan().total.total_tokens,380);
});
test('registered empty projects remain visible; projectless tasks and subagents keep titles and totals',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'token-info-classify-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 fs.mkdirSync(path.join(home,'sessions'));
 fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify({'local-projects':{p:{id:'p',name:'Registered',rootPaths:['C:\\work\\Demo']},empty:{id:'empty',name:'Empty',rootPaths:['C:\\empty']}},'projectless-thread-ids':['a']}));
 fs.writeFileSync(path.join(home,'session_index.jsonl'),JSON.stringify({id:'a',thread_name:'Menneskelig oppgavenavn'}));
 fs.writeFileSync(path.join(home,'sessions','a.jsonl'),[meta('a'),record('a1')].join('\n'));
 fs.writeFileSync(path.join(home,'sessions','child.jsonl'),[row('session_meta',{id:'child',parent_thread_id:'a',cwd:'C:\\outside'}),row('token_usage_record',{thread_id:'child',response_id:'child1',usage:usage(200)})].join('\n'));
 const data=new LocalUsage(home).scan();
 assert.equal(data.projects.length,2);assert.ok(data.projects.every(p=>!p.hasData));
 assert.equal(data.recent.length,1);assert.equal(data.recent[0].name,'Menneskelig oppgavenavn');assert.equal(data.recent[0].total_tokens,320);
 assert.equal(data.total.total_tokens,320);
});
test('Git worktree is assigned only to an existing registered project',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'token-info-worktree-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const repo=path.join(home,'repo'),checkout=path.join(home,'checkout'),gitdir=path.join(repo,'.git','worktrees','test');
 fs.mkdirSync(gitdir,{recursive:true});fs.mkdirSync(checkout);fs.mkdirSync(path.join(home,'sessions'));
 fs.writeFileSync(path.join(checkout,'.git'),`gitdir: ${gitdir}`);fs.writeFileSync(path.join(gitdir,'commondir'),'../..');
 fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify({'local-projects':{p:{id:'p',name:'Registered repo',rootPaths:[repo]}}}));
 fs.writeFileSync(path.join(home,'sessions','a.jsonl'),[row('session_meta',{id:'a',cwd:checkout}),record('a1')].join('\n'));
 const data=new LocalUsage(home).scan();assert.equal(data.projects[0].total_tokens,110);assert.equal(data.recent.length,0);
});
test('all quota buckets and missing values remain honest',()=>{
 const windows=normalizeLimits({rateLimits:{primary:{usedPercent:90}},rateLimitsByLimitId:{codex:{primary:{usedPercent:58,windowDurationMins:10080,resetsAt:123},secondary:{usedPercent:null}},spark:{primary:{usedPercent:0}}}});
 assert.equal(windows.length,3);assert.equal(windows[0].remaining,42);assert.equal(windows[1].remaining,null);assert.equal(windows[2].remaining,100);
 assert.equal(normalizeLimits({rateLimits:{primary:{usedPercent:110}}})[0].remaining,0);
});
