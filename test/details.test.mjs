import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LocalUsage,parseLog} from '../usage.mjs';
import {detailHTML,share} from '../public/detail-view.js';
const at=n=>`2026-09-10T12:${String(n).padStart(2,'0')}:00Z`;
const row=(type,payload,n=0)=>JSON.stringify({type,payload,timestamp:at(n)});
const meta=(id,extra={})=>row('session_meta',{id,cwd:'C:/work/project',...extra});
const context=(turn_id,model,n)=>row('turn_context',{turn_id,model},n);
const usage={input_tokens:100,cached_input_tokens:60,output_tokens:10,reasoning_output_tokens:3,total_tokens:110};
const response=(thread_id,turn_id,response_id,n,extra={})=>row('token_usage_record',{thread_id,turn_id,response_id,usage,...extra},n);
test('historical turn ID wins over most recent turn; explicit response model wins; missing linkage stays unknown',()=>{
 const events=parseLog([meta('a'),context('t1','model-old',0),context('t2','model-new',1),response('a','t1','r1',2),response('a','t2','r2',3,{model:'model-explicit'}),response('a','missing','r3',4)].join('\n')).events;
 assert.deepEqual(events.map(e=>e.model),['model-old','model-explicit','Ukjent modell']);
 assert.deepEqual(events.map(e=>e.modelSource),['turn_context','response','unknown']);
});
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'token-info-detail-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 fs.mkdirSync(path.join(home,'sessions'));fs.mkdirSync(path.join(home,'archived_sessions'));
 fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify({'local-projects':{p:{id:'p',name:'Registered project',rootPaths:['C:/work/project']}},'thread-project-assignments':{a:{projectId:'p'}}}));
 fs.writeFileSync(path.join(home,'session_index.jsonl'),row('unused',{})+'\n'+JSON.stringify({id:'a',thread_name:'Human task'}));
 fs.writeFileSync(path.join(home,'models_cache.json'),JSON.stringify({models:[{slug:'model-a',display_name:'Model A'},{slug:'model-b',display_name:'Model B'}]}));
 const a=[meta('a'),context('t1','model-a',0),response('a','t1','r1',1),context('t2','model-b',2),response('a','t2','r2',3),context('t3','model-a',4),response('a','t3','r3',5)];
 fs.writeFileSync(path.join(home,'sessions','a.jsonl'),a.join('\n'));
 fs.writeFileSync(path.join(home,'archived_sessions','copy.jsonl'),a.join('\n'));
 fs.writeFileSync(path.join(home,'sessions','child.jsonl'),[meta('child',{parent_thread_id:'a',agent_nickname:'Helper'}),context('ct','model-b',1),response('child','ct','c1',2),response('child','missing','c2',3)].join('\n'));
 return {home,scan:new LocalUsage(home)};
}
test('project detail preserves every model, deduplicates subagents and records per-actor switches',t=>{
 const {scan}=fixture(t),result=scan.scan(),d=result.projects[0].details;
 assert.equal(result.total.total_tokens,550);assert.equal(d.total_tokens,550);assert.equal(d.calls,5);
 assert.deepEqual(d.models.map(m=>[m.id,m.total_tokens]),[['model-a',220],['model-b',220],[null,110]]);
 assert.equal(d.models[0].name,'Model A');
 assert.equal(d.actors.length,2);
 assert.equal(d.actors.find(a=>a.id==='a').switches,2);
 assert.equal(d.actors.find(a=>a.id==='child').switches,0);
 assert.deepEqual(d.actors.find(a=>a.id==='a').timeline.map(s=>s.model),['model-a','model-b','model-a']);
 assert.equal(d.models.reduce((n,m)=>n+m.total_tokens,0),d.total_tokens);
 assert.equal(d.actors.reduce((n,a)=>n+a.total_tokens,0),d.total_tokens);
 assert.equal(d.sources.unknown,1);assert.equal(d.sources.turn_context,4);
 for(const m of d.models)assert.equal(m.input_tokens-m.cached_input_tokens+m.cached_input_tokens+m.output_tokens,m.total_tokens);
});
test('detail changes on appended responses without discarding previous model usage',t=>{
 const {home,scan}=fixture(t);const before=scan.scan().projects[0].details;
 fs.appendFileSync(path.join(home,'sessions','a.jsonl'),'\n'+context('t4','model-c',6)+'\n'+response('a','t4','r4',7));
 const after=scan.scan().projects[0].details;
 assert.equal(after.total_tokens,before.total_tokens+110);assert.equal(after.calls,6);assert.equal(after.models.length,4);
 assert.equal(after.models.find(m=>m.id==='model-a').total_tokens,220);assert.equal(after.last,Date.parse(at(7)));
});
test('projectless detail has same models and total after reclassification; titles escaped in UI',t=>{
 const {home,scan}=fixture(t);const before=scan.scan().total.total_tokens;
 fs.writeFileSync(path.join(home,'.codex-global-state.json'),'{}');
 const result=scan.scan();assert.equal(result.projects.length,0);assert.equal(result.recent.length,1);
 assert.equal(result.total.total_tokens,before);assert.equal(result.recent[0].details.calls,5);
 const html=detailHTML({...result.recent[0],name:'<unsafe>'},'Europe/Oslo','nb');
 assert.match(html,/Model A/);assert.match(html,/Modell-ID mangler/);assert.match(html,/Samlet for &lt;unsafe&gt;/);
 assert.match(html,/550 tokens/);assert.doesNotMatch(html,/<unsafe>/);
 assert.equal((html.match(/class="model-card"/g)||[]).length,3);
});
test('share uses fixed total rather than filtered rows, with 0 denominator handled',()=>{
 assert.equal(share(250,1000),25);assert.equal(share(750,1000),75);assert.equal(share(0,0),0);
});
