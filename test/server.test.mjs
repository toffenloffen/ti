import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
test('local server serves UI, rejects writes, and imports new logs without manual refresh',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'token-info-server-'));
  const port=43219;
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,CODEX_HOME:home,TOKEN_INFO_PORT:String(port),TOKEN_INFO_CODEX:path.join(home,'missing-codex')},stdio:'ignore',windowsHide:true});
  t.after(async()=>{child.kill();await delay(400);fs.rmSync(home,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${port}`;
  let response;
  for(let i=0;i<30;i++){try{response=await fetch(url+'/api/health');if(response.ok)break;}catch{}await delay(100);}
  assert.equal((await response.json()).app,'token-info');
  assert.match(await (await fetch(url)).text(),/Where do your tokens go/);
  assert.equal((await fetch(url+'/api/usage',{method:'POST'})).status,405);
  assert.equal((await fetch(url+'/README.md')).status,404);
  let data=await (await fetch(url+'/api/usage')).json();assert.equal(data.local.responses,0);
  fs.mkdirSync(path.join(home,'sessions'));
  fs.writeFileSync(path.join(home,'sessions','new.jsonl'),[
    {type:'session_meta',payload:{id:'test',cwd:'C:\\Example'},timestamp:new Date().toISOString()},
    {type:'token_usage_record',payload:{thread_id:'test',response_id:'test-response',usage:{input_tokens:100,output_tokens:5}},timestamp:new Date().toISOString()}
  ].map(JSON.stringify).join('\n'));
  await delay(10500);
  data=await (await fetch(url+'/api/usage')).json();assert.equal(data.local.total.total_tokens,105);assert.equal(data.local.projects.length,0);assert.equal(data.local.recent.length,1);
  assert.ok(data.account.limitsError);assert.equal(data.account.limitsUpdatedAt,null);assert.equal(data.account.usage,null);
});
