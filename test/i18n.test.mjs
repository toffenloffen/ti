import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {catalogs,languages,resolveLanguage,translator,formatting,loadBrowserLanguage,saveBrowserLanguage,errorKey,warningText} from '../public/i18n.js';
import {detailHTML,displayName} from '../public/detail-view.js';
import {LanguageSettings} from '../language-settings.mjs';
import {dayKey} from '../usage.mjs';

test('all seven catalogs contain every English key and the same interpolation fields',()=>{
  const keys=Object.keys(catalogs.en).sort();assert.ok(keys.length>150);
  const placeholders=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const lang of Object.keys(languages)){
    assert.deepEqual(Object.keys(catalogs[lang]).sort(),keys,lang);
    for(const key of keys){assert.ok(catalogs[lang][key].trim(),`${lang}:${key}`);assert.deepEqual(placeholders(catalogs[lang][key]),placeholders(catalogs.en[key]),`${lang}:${key}`);}
  }
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/data-i18n(?:-aria-label|-placeholder)?="([^"]+)"/g))assert.ok(catalogs.en[match[1]],match[1]);
  for(const file of ['app.js','detail-view.js']){
    const source=fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/\bt\('([^']+)'/g))assert.ok(catalogs.en[match[1]],match[1]);
  }
});
test('first launch always uses English regardless of system languages',()=>{
  for(const preferred of [['nb-NO'],['de-DE'],['nn-NO'],['fr-FR']]){
    for(const saved of [null,undefined,'','bad','DE',{},42])assert.equal(resolveLanguage(saved,preferred),'en');
    for(const saved of ['nb','de'])assert.equal(resolveLanguage(saved,preferred),saved);
  }
  assert.equal(resolveLanguage('es',['de-DE']),'es');
  assert.equal(resolveLanguage('bad',['nn-NO']),'en');
  assert.equal(resolveLanguage(null,['no-NO']),'en');
  assert.equal(resolveLanguage(null,['ja-JP']),'en');
  assert.equal(translator('xx')('projects'),'Projects');
  const saved=catalogs.fr.projects;delete catalogs.fr.projects;
  try{assert.equal(translator('fr')('projects'),'Projects');}finally{catalogs.fr.projects=saved;}
  assert.equal(translator('es')('removeNamed',{name:'$& {n} <test>'}),'Quitar $& {n} <test> de TI');
});
test('desktop preference persists across instances; missing or invalid settings use English without writes',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ti-language-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const filename=path.join(root,'settings','language.json'),settings=new LanguageSettings(filename,['sv-SE']);
  assert.equal(settings.get(),'en');assert.equal(fs.existsSync(filename),false);
  for(const code of ['nb','de']){settings.set(code);assert.equal(new LanguageSettings(filename,['fr']).get(),code);}
  assert.throws(()=>settings.set('bad'));assert.equal(settings.get(),'de');
  for(const value of ['invalid','{}','{"language":"bad"}']){fs.writeFileSync(filename,value);assert.equal(settings.get(),'en');assert.equal(fs.readFileSync(filename,'utf8'),value);}
});
test('web preference persists and unavailable browser storage is handled',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  for(const preferred of [['nb-NO'],['de-DE']])assert.equal(loadBrowserLanguage(storage,preferred),'en');
  assert.equal(map.size,0);
  for(const code of ['nb','de']){assert.equal(saveBrowserLanguage(storage,code),true);assert.equal(loadBrowserLanguage(storage,['da']),code);}
  map.set('ti.language','bad');assert.equal(loadBrowserLanguage(storage,['nb-NO']),'en');
  const denied={getItem(){throw new Error();},setItem(){throw new Error();}};
  assert.equal(loadBrowserLanguage(denied,['fr-FR']),'en');assert.equal(saveBrowserLanguage(denied,'de'),false);
});
test('language changes number/date formatting without changing accounting days',()=>{
  const stamp=Date.parse('2026-09-24T22:30:00Z');
  assert.equal(dayKey(stamp,'Europe/Oslo'),'2026-09-25');
  assert.equal(formatting('en').number(1234.5),'1,234.5');assert.equal(formatting('de').number(1234.5),'1.234,5');
  for(const code of Object.keys(languages)){
    const f=formatting(code,'Europe/Oslo');assert.ok(f.time(stamp).includes('25'));assert.ok(f.day('2026-09-24').includes('24'));
    assert.equal(dayKey(stamp,'Europe/Oslo'),'2026-09-25');
  }
});
test('all detail views translate generated labels but retain real names, model IDs, totals and HTML escaping',()=>{
  const model={id:'model-exact-v1',name:'Samtale uten tittel',input_tokens:100,cached_input_tokens:60,output_tokens:10,total_tokens:110,calls:1,legacyRecords:1,first:0,last:1000,sources:{response:1,turn_context:1,sequence_context:1,unknown:1}};
  const group={name:'<Original project>',details:{...model,records:1,reasoning_output_tokens:3,models:[model,{...model,id:null}],actors:[{...model,id:'actor-id',name:'<Original task>',role:'Hovedoppgave',models:[model],switches:0,timeline:[{...model,model:model.id}]}]}};
  for(const code of Object.keys(languages)){
    const t=translator(code),html=detailHTML(group,'Europe/Oslo',code);
    assert.ok(html.includes(t('missingModelId')));assert.ok(html.includes(t('fresh')));assert.ok(html.includes(t('modelSourceHelp')));
    assert.ok(html.includes('model-exact-v1'));assert.ok(html.includes('Samtale uten tittel'));assert.ok(html.includes('&lt;Original project&gt;'));assert.ok(html.includes('&lt;Original task&gt;'));
    assert.doesNotMatch(html,/<Original/);assert.doesNotMatch(html,/\{\w+\}/);
    assert.equal(displayName({name:'Samtale uten tittel'},t),'Samtale uten tittel');
    assert.equal(displayName({nameKey:'untitled'},t),t('untitled'));
    assert.ok(detailHTML({name:'x'},'Europe/Oslo',code).includes(t('noUsage')));
  }
});
test('backend failures and legacy warnings are localized without passing through raw errors',()=>{
  for(const code of Object.keys(languages)){
    const t=translator(code);assert.equal(t(errorKey('Codex svarte ikke innen 15 sekunder.')),t('timeoutError'));
    assert.equal(t(errorKey('private file path')),t('genericError'));
    assert.equal(warningText('3 ufullstendige eller ugyldige logglinjer',t),t('badLines',{n:3}));
    assert.equal(warningText('2 eldre loggfiler',t),t('legacyFiles',{n:2}));
  }
});
