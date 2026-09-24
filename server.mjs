import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LocalUsage, normalizeLimits, logLimits } from './usage.mjs';
import { AccountClient } from './account.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
export function createService(options = {}) {
let port = options.port ?? Number(process.env.TOKEN_INFO_PORT || 43117);
const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const local = new LocalUsage(home, process.env.TOKEN_INFO_TIMEZONE || 'Europe/Oslo');
const account = new AccountClient();
let snapshot, localUpdatedAt, localError = null, accountBusy = false;
const accountState = { limits: [], usage: null, limitsUpdatedAt: null, usageUpdatedAt: null, limitsError: null, usageError: null };
function refreshLocal() {
  try { snapshot = local.scan(Date.now(), options.getCustomProjects?.() || []); localUpdatedAt = Date.now(); localError = null; }
  catch { localError = 'Lokale data kunne ikke oppdateres. Prøver igjen automatisk.'; }
}
async function refreshAccount() {
  if (accountBusy) return;
  accountBusy = true;
  try {
    const result = await account.read();
    for (const key of ['limits','usage']) {
      if (result[key].status === 'fulfilled') {
        accountState[key] = key === 'limits' ? normalizeLimits(result[key].value) : result[key].value;
        accountState[`${key}UpdatedAt`] = Date.now(); accountState[`${key}Error`] = null;
      } else accountState[`${key}Error`] = result[key].reason.message;
    }
  } catch {
    accountState.limitsError = accountState.usageError = 'Ingen forbindelse til lokal Codex. Åpne Codex og kontroller at du er logget inn. Nytt forsøk skjer automatisk.';
  } finally { accountBusy = false; }
}
function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
const server = http.createServer((req,res)=>{
  if (![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)) return send(res,403,{error:'Kun lokal tilgang.'});
  if (req.method !== 'GET') return send(res,405,{error:'Bare lesetilgang.'});
  const url = new URL(req.url,`http://127.0.0.1:${port}`);
  if (url.pathname === '/api/health') return send(res,200,{app:'token-info',version});
  if (url.pathname === '/api/usage') return send(res,200,{
    local: snapshot, localUpdatedAt, localError, account: accountState, accountBusy,
    fallbackLimits: accountState.limitsUpdatedAt ? [] : logLimits(snapshot?.latestLimit),
    intervals: {local:10,account:60}, startedAt
  });
  const files = {'/':'index.html','/app.js':'app.js','/detail-view.js':'detail-view.js','/style.css':'style.css'};
  if (!files[url.pathname]) return send(res,404,{error:'Ikke funnet.'});
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
  send(res,200,fs.readFileSync(path.join(root,'public',files[url.pathname])),types[path.extname(files[url.pathname])]);
});
const startedAt = Date.now();
let timers = [];
return {
  refreshLocal,
  start() {
    return new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',()=>{
        server.removeListener('error',reject);
        port = server.address().port;
        refreshLocal();
        timers = [setInterval(refreshLocal,10000),setInterval(refreshAccount,60000)];
        refreshAccount();
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  },
  close() {
    timers.forEach(clearInterval); account.close();
    return new Promise(resolve=>{ server.close(resolve); server.closeAllConnections(); });
  }
};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const service = createService();
  service.start().then(url=>console.log(`Token info: ${url}`)).catch(e=>{console.error(e.message);process.exit(1);});
  const stop = () => service.close().then(()=>process.exit(0));
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
}
