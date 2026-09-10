import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

export function codexExecutable() {
  if (process.env.TOKEN_INFO_CODEX) return process.env.TOKEN_INFO_CODEX;
  if (process.platform === 'win32') {
    const root = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
    try {
      const candidates = fs.readdirSync(root).map(d=>path.join(root,d,'codex.exe')).filter(p=>fs.existsSync(p));
      candidates.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
      if (candidates[0]) return candidates[0];
    } catch {}
  }
  return 'codex';
}
export class AccountClient {
  constructor() { this.pending = new Map(); this.nextId = 1; }
  async connect() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.child = spawn(codexExecutable(), ['app-server', '--listen', 'stdio://'], { windowsHide: true, stdio: ['pipe','pipe','ignore'] });
      const child = this.child;
      const fail = () => { if (this.child !== child) return; this.ready = null; this.child = null; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex-forbindelsen ble lukket.')); } this.pending.clear(); };
      child.on('error', fail); child.on('exit', fail); child.stdin.on('error', ()=>{});
      createInterface({ input: child.stdout }).on('line', line => {
        let m; try { m = JSON.parse(line); } catch { return; }
        const p = this.pending.get(m.id);
        if (!p) return;
        clearTimeout(p.timer); this.pending.delete(m.id);
        m.error ? p.reject(new Error('Codex kunne ikke levere disse kontodataene.')) : p.resolve(m.result);
      });
      await this.request('initialize', {clientInfo:{name:'token_info',title:'Token info',version:'1.0.0'}});
      child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
    })();
    try { await this.ready; } catch (e) { this.close(); throw e; }
  }
  request(method, params) {
    return new Promise((resolve,reject)=>{
      const id = this.nextId++;
      const timer = setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex svarte ikke innen 15 sekunder.'));},15000);
      this.pending.set(id,{resolve,reject,timer});
      this.child?.stdin.write(JSON.stringify({id,method,...(params ? {params} : {})})+'\n');
    });
  }
  async read() {
    await this.connect();
    const [limits, usage] = await Promise.allSettled([this.request('account/rateLimits/read'),this.request('account/usage/read')]);
    if (limits.status === 'rejected' && usage.status === 'rejected') this.close();
    return {limits,usage};
  }
  close() {
    this.child?.kill(); this.child = null; this.ready = null;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex-forbindelsen ble lukket.')); }
    this.pending.clear();
  }
}
