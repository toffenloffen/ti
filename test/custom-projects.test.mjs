import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CustomProjects } from '../custom-projects.mjs';
import { LocalUsage } from '../usage.mjs';
import { createService } from '../server.mjs';
function fixture(t) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'ti-folders-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  fs.mkdirSync(path.join(home,'sessions'));
  const folder=path.join(home,'CLI project'), nested=path.join(folder,'nested');
  fs.mkdirSync(nested,{recursive:true});
  const store=new CustomProjects(path.join(home,'ti','projects.json'));
  const log=(id,cwd,parent)=>{
    const text=[{type:'session_meta',payload:{id,cwd,parent_thread_id:parent}},
      {type:'token_usage_record',timestamp:'2026-09-24T10:00:00Z',payload:{thread_id:id,response_id:id,model:'demo',usage:{input_tokens:100,output_tokens:10}}}].map(JSON.stringify).join('\n');
    fs.writeFileSync(path.join(home,'sessions',id+'.jsonl'),text);
  };
  return {home,folder,nested,store,log,scan:new LocalUsage(home)};
}
test('folders persist, duplicate selection is idempotent, removal preserves source data',t=>{
  const {home,folder,store}=fixture(t);
  const rows=store.add(folder);assert.equal(rows.length,1);
  assert.deepEqual(store.add(folder+path.sep),rows);
  assert.deepEqual(new CustomProjects(store.filename).list(),rows);
  assert.throws(()=>store.add('relative'));
  assert.throws(()=>store.add(path.join(home,'absent')));
  assert.throws(()=>store.add(store.filename));
  store.remove(rows[0].id);assert.deepEqual(store.list(),[]);assert.ok(fs.statSync(folder).isDirectory());
  assert.equal(store.add(folder)[0].id,rows[0].id);
});
test('invalid saved settings are preserved, not silently overwritten',t=>{
  const {store,folder}=fixture(t);store.add(folder);
  fs.writeFileSync(store.filename,'broken');
  assert.throws(()=>store.add(folder),/beholdt/);assert.equal(fs.readFileSync(store.filename,'utf8'),'broken');
});
test('custom folders reclassify CLI and explicit projectless history, conserve totals and details, undo on removal',t=>{
  const {home,folder,store,log,scan}=fixture(t);
  log('parent',folder);log('child',path.join(home,'elsewhere'),'parent');log('other',folder+'-other');
  fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify({'projectless-thread-ids':['parent']}));
  fs.copyFileSync(path.join(home,'sessions','parent.jsonl'),path.join(home,'sessions','duplicate.jsonl'));
  assert.equal(scan.scan().recent.length,2);
  const settings=store.add(folder);let result=scan.scan(Date.now(),settings);
  assert.equal(result.projects.length,1);assert.equal(result.projects[0].total_tokens,220);
  assert.equal(result.projects[0].details.actors.length,2);
  assert.equal(result.recent.length,1);assert.equal(result.total.total_tokens,330);
  log('new',folder);result=scan.scan(Date.now(),settings);assert.equal(result.projects[0].total_tokens,330);
  result=scan.scan(Date.now(),store.remove(settings[0].id));assert.equal(result.projects.length,0);assert.equal(result.total.total_tokens,440);
  assert.equal(result.recent.reduce((n,r)=>n+r.total_tokens,0),440);
});
test('most specific folder wins, explicit Codex assignment wins, same registered root is merged',t=>{
  const {home,folder,nested,store,log,scan}=fixture(t);
  store.add(folder);const rows=store.add(nested);log('a',nested);
  let result=scan.scan(Date.now(),rows);assert.equal(result.projects.find(p=>p.total_tokens).path,nested);
  const state={'local-projects':{p:{id:'p',name:'Codex name',rootPaths:[folder]}},'thread-project-assignments':{a:{projectId:'p'}}};
  fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify(state));
  result=scan.scan(Date.now(),rows);assert.equal(result.projects.length,2);assert.equal(result.projects.find(p=>p.total_tokens).id,'p');
  assert.equal(result.total.total_tokens,110);
});
test('worktree resolves to manually selected repository; empty or unavailable folder remains visible',t=>{
  const {home,folder,store,log,scan}=fixture(t);
  const checkout=path.join(home,'checkout'),gitDir=path.join(folder,'.git','worktrees','check');
  fs.mkdirSync(gitDir,{recursive:true});fs.mkdirSync(checkout);
  fs.writeFileSync(path.join(checkout,'.git'),`gitdir: ${gitDir}`);fs.writeFileSync(path.join(gitDir,'commondir'),'../..');
  log('worktree',checkout);store.add(folder);
  const empty=path.join(home,'empty');fs.mkdirSync(empty);const rows=store.add(empty);fs.rmdirSync(empty);
  const result=scan.scan(Date.now(),rows);assert.equal(result.projects.length,2);
  assert.equal(result.projects.find(p=>p.path===folder).total_tokens,110);
  assert.equal(result.projects.find(p=>p.path===empty).hasData,false);
});
test('desktop service reclassifies immediately and still rejects HTTP writes',async t=>{
  const {home,folder,store,log}=fixture(t);log('cli',folder);
  const oldHome=process.env.CODEX_HOME,oldCodex=process.env.TOKEN_INFO_CODEX;
  process.env.CODEX_HOME=home;process.env.TOKEN_INFO_CODEX=path.join(home,'absent.exe');
  const service=createService({port:0,getCustomProjects:()=>store.list()});
  t.after(async()=>{await service.close();if(oldHome===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=oldHome;if(oldCodex===undefined)delete process.env.TOKEN_INFO_CODEX;else process.env.TOKEN_INFO_CODEX=oldCodex;});
  const origin=await service.start();
  let data=await (await fetch(origin+'/api/usage')).json();assert.equal(data.local.recent.length,1);
  const rows=store.add(folder);service.refreshLocal();
  data=await (await fetch(origin+'/api/usage')).json();assert.equal(data.local.projects[0].total_tokens,110);assert.equal(data.local.recent.length,0);
  assert.equal((await fetch(origin+'/api/projects',{method:'POST',body:'{}'})).status,405);
  store.remove(rows[0].id);service.refreshLocal();
  data=await (await fetch(origin+'/api/usage')).json();assert.equal(data.local.projects.length,0);assert.equal(data.local.total.total_tokens,110);
});
test('selecting one root of a multi-root Codex project does not override projectless status in other roots',t=>{
  const {home,folder,store,log,scan}=fixture(t);
  const other=path.join(home,'other');fs.mkdirSync(other);
  log('a',folder);log('b',other);
  fs.writeFileSync(path.join(home,'.codex-global-state.json'),JSON.stringify({'local-projects':{p:{id:'p',name:'Multi-root',rootPaths:[folder,other]}},'projectless-thread-ids':['a','b']}));
  const result=scan.scan(Date.now(),store.add(folder));
  assert.equal(result.projects.length,1);assert.equal(result.projects[0].total_tokens,110);
  assert.equal(result.recent.length,1);assert.equal(result.recent[0].id,'b');
});
