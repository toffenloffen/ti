// Run with Electron: .runtime/electron/electron.exe scripts/desktop-smoke.cjs
// This exercises the real preload, IPC, service and renderer with isolated data.
const {app,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'.runtime','locale-qa');
fs.mkdirSync(path.join(qa,'appdata'),{recursive:true});fs.mkdirSync(path.join(qa,'home','sessions'),{recursive:true});
const folder=path.join(qa,'Original project'),phase=process.argv.includes('--verify-restart')?'restart':process.argv.includes('--account-data')?'account':'full';fs.mkdirSync(folder,{recursive:true});
const settings=path.join(qa,'appdata','Token info','language.json');
if(phase!=='restart'){fs.mkdirSync(path.dirname(settings),{recursive:true});fs.writeFileSync(settings,JSON.stringify({language:'en'}));}
fs.writeFileSync(path.join(qa,'home','sessions','example.jsonl'),[
 {type:'session_meta',payload:{id:'task1',cwd:folder,title:'Original conversation'}},
 {type:'token_usage_record',timestamp:'2026-09-24T10:00:00Z',payload:{thread_id:'task1',response_id:'response1',model:'original-model-id',usage:{input_tokens:123456,output_tokens:1100,cached_input_tokens:100000}}},
 {type:'token_usage_record',timestamp:'2026-09-24T10:01:00Z',payload:{thread_id:'task1',turn_id:'unmatched',response_id:'response2',usage:{input_tokens:100,output_tokens:10}}}
].map(JSON.stringify).join('\n'));
app.setPath('appData',path.join(qa,'appdata'));process.env.CODEX_HOME=path.join(qa,'home');process.env.TOKEN_INFO_CODEX=path.join(qa,'missing.exe');
let chosenTitle;
dialog.showOpenDialog=async(_win,options)=>{chosenTitle=options.title;return {canceled:false,filePaths:[folder]};};
app.once('browser-window-created',(_event,win)=>{
 win.webContents.once('did-finish-load',async()=>{
  const run=script=>win.webContents.executeJavaScript(script);
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async(script)=>{for(let i=0;i<100;i++){if(await run(script))return;await pause(50);}throw new Error('Timeout: '+script);};
  const report=[];
  try{
   await wait("document.getElementById('language').options.length===7 && document.getElementById('localTotal').textContent!=='—'");
   if(phase==='account')await wait("document.getElementById('lifetime').textContent!=='—'");
   else await wait("!document.getElementById('error').hidden");
   if(phase==='restart'){
    assert.equal(await run('document.documentElement.lang'),'de');
    assert.match(await run("document.getElementById('projects').textContent"),/Original project/);
    report.push('German language and custom project restored across process restart');
   }else{
    assert.equal(await run('document.documentElement.lang'),'en');
    await run("document.getElementById('addProject').click()");
    await wait("document.getElementById('projects').textContent.includes('Original project')");
    const {catalogs}=await import(require('node:url').pathToFileURL(path.join(root,'public','translations.js')).href);
    const {formatting}=await import(require('node:url').pathToFileURL(path.join(root,'public','i18n.js')).href);
    for(const code of ['en','nb','sv','da','de','fr','es']){
     await run(`document.getElementById('language').value=${JSON.stringify(code)};document.getElementById('language').dispatchEvent(new Event('change'))`);
     await wait(`document.documentElement.lang===${JSON.stringify(code)} && !document.getElementById('language').disabled`);
     assert.equal(await run("document.querySelector('h1').textContent"),catalogs[code].heading);
     assert.equal(await run("document.getElementById('localTotal').textContent"),formatting(code).number(124666));
     if(phase!=='account')assert.match(await run("document.getElementById('error').textContent"),new RegExp(catalogs[code].connectionError.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
     await run("document.querySelector('#projects button').click()");
     assert.ok((await run("document.getElementById('detailBody').textContent")).includes(catalogs[code].missingModelId));
     assert.ok((await run("document.getElementById('detailBody').textContent")).includes('original-model-id'));
     assert.equal(await run("document.getElementById('detailTitle').textContent"),'Original project');
     await run("document.getElementById('closeDetail').click()");
     await run("window.tiProjects.add()");assert.equal(chosenTitle,catalogs[code].folderDialog);
     win.setSize(1260,900);await pause(100);
     assert.equal(await run('document.documentElement.scrollWidth<=window.innerWidth'),true);
     if(phase==='account'){await run('window.scrollTo(0,0)');await pause(100);fs.writeFileSync(path.join(qa,code+'-account.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await run("document.getElementById('lifetime').textContent"),formatting(code).number(1357906274));assert.equal(await run("document.getElementById('error').hidden"),true);}
     if(['de','fr'].includes(code)){
      await run("document.querySelector('#projects').scrollIntoView({block:'center'})");await pause(100);
      fs.writeFileSync(path.join(qa,code+'-projects.png'),(await win.webContents.capturePage()).toPNG());
      await run("document.querySelector('#projects button').click()");await pause(100);
      fs.writeFileSync(path.join(qa,code+'-details.png'),(await win.webContents.capturePage()).toPNG());
      await run("document.getElementById('closeDetail').click()");
      win.setSize(780,900);await pause(100);
      assert.equal(await run('document.documentElement.scrollWidth<=window.innerWidth'),true);
      fs.writeFileSync(path.join(qa,code+'-narrow.png'),(await win.webContents.capturePage()).toPNG());
     }
     report.push(code+': dashboard, details, numbers, names, error state, folder title and layout passed');
    }
    // Switching language while a detail panel is open keeps its content coherent.
    await run("document.querySelector('#projects button').click();document.getElementById('language').value='de';document.getElementById('language').dispatchEvent(new Event('change'))");
    await wait("document.documentElement.lang==='de' && !document.getElementById('language').disabled");
    assert.ok((await run("document.getElementById('detailBody').textContent")).includes(catalogs.de.missingModelId));
    await run("document.getElementById('closeDetail').click()");
    await run("document.getElementById('projectSearch').value='NO_MATCH';document.getElementById('projectSearch').dispatchEvent(new Event('input'))");
    assert.equal(await run("document.getElementById('projects').textContent"),catalogs.de.noProjects);
    report.push('Open detail language refresh and localized empty search passed');
   }
   fs.writeFileSync(path.join(qa,phase+'-report.json'),JSON.stringify({success:true,report},null,2));app.quit();
  }catch(error){fs.writeFileSync(path.join(qa,phase+'-report.json'),JSON.stringify({success:false,error:error.stack},null,2));app.exit(1);}
 });
});
(async()=>{
 if(phase==='account'){
  const {AccountClient}=await import(require('node:url').pathToFileURL(path.join(root,'account.mjs')).href);
  AccountClient.prototype.read=async()=>({limits:{status:'fulfilled',value:{rateLimits:{limitId:'codex',primary:{usedPercent:40,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+5000}}}},usage:{status:'fulfilled',value:{summary:{lifetimeTokens:1357906274},dailyUsageBuckets:[{startDate:'2026-09-23',tokens:9876543}]}}});
 }
 require(path.join(root,'desktop.cjs'));
})();
