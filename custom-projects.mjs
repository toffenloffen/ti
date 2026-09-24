import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const folderKey = value => String(value || '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
export class CustomProjects {
  constructor(filename) { this.filename = filename; }
  list() {
    try {
      const rows = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (!Array.isArray(rows) || rows.some(p => !p || typeof p.id !== 'string' || !p.id.startsWith('ti:') || typeof p.path !== 'string' || !path.isAbsolute(p.path) || typeof p.name !== 'string')) throw new Error();
      return rows;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('TI sine prosjektmapper kunne ikke leses. Den lagrede filen er beholdt.');
    }
  }
  save(rows) {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(rows, null, 2));
    fs.renameSync(temporary, this.filename);
    return rows;
  }
  add(folder) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || !fs.statSync(folder).isDirectory()) throw new Error('Velg en eksisterende mappe.');
    const resolved = path.resolve(folder), rows = this.list();
    if (rows.some(p => folderKey(p.path) === folderKey(resolved))) return rows;
    return this.save([...rows, { id: 'ti:' + createHash('sha256').update(folderKey(resolved)).digest('hex').slice(0,24), name: path.basename(resolved) || resolved, path: resolved }]);
  }
  remove(id) { return this.save(this.list().filter(p => p.id !== id)); }
}
