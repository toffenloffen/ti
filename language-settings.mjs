import fs from 'node:fs';
import path from 'node:path';
import { languages, resolveLanguage } from './public/i18n.js';
export class LanguageSettings {
  constructor(filename) { this.filename=filename; }
  get() {
    let value;
    try { value=JSON.parse(fs.readFileSync(this.filename,'utf8')).language; } catch {}
    return resolveLanguage(value);
  }
  set(language) {
    if (!Object.hasOwn(languages,language)) throw new Error('languageInvalid');
    fs.mkdirSync(path.dirname(this.filename),{recursive:true});
    fs.writeFileSync(this.filename+'.tmp',JSON.stringify({language}));
    fs.renameSync(this.filename+'.tmp',this.filename);
    return language;
  }
}
