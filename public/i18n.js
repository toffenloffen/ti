import { catalogs } from './translations.js';
export { catalogs };
export const languages = {nb:'Norsk bokmål',en:'English',sv:'Svenska',da:'Dansk',de:'Deutsch',fr:'Français',es:'Español'};
export function resolveLanguage(saved) {
  if (Object.hasOwn(languages, saved)) return saved;
  return 'en';
}
export function translator(language = 'en') {
  const code = resolveLanguage(language);
  return (key, values = {}) => (catalogs[code]?.[key] || catalogs.en[key] || key).replace(/\{(\w+)\}/g, (match,name) => Object.hasOwn(values,name) ? String(values[name]) : match);
}
export function localeFor(language) { return {nb:'nb-NO',en:'en-US',sv:'sv-SE',da:'da-DK',de:'de-DE',fr:'fr-FR',es:'es-ES'}[resolveLanguage(language)]; }
export function formatting(language, zone = 'Europe/Oslo') {
  const locale = localeFor(language), t = translator(language);
  return {
    number: n => typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat(locale).format(n) : '—',
    time: (n, seconds = false) => n == null ? t('unknown') : new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),timeZone:zone}).format(new Date(n)),
    day: (key, short = false) => new Intl.DateTimeFormat(locale,{year:short?undefined:'numeric',month:short?'numeric':'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${key}T12:00:00Z`)),
    today: () => new Intl.DateTimeFormat(locale,{weekday:'long',day:'numeric',month:'long',timeZone:zone}).format(new Date())
  };
}
export function loadBrowserLanguage(storage) {
  let saved; try { saved = storage?.getItem('ti.language'); } catch {}
  return resolveLanguage(saved);
}
export function saveBrowserLanguage(storage, language) {
  try { storage?.setItem('ti.language',resolveLanguage(language)); return true; } catch { return false; }
}
// Only known application-generated messages are mapped. User content is never translated.
export function errorKey(message) {
  return ({
    'TI sine prosjektmapper kunne ikke leses. Den lagrede filen er beholdt.':'foldersReadError',
    'Velg en eksisterende mappe.':'folderInvalid',
    'Ugyldig prosjekt.':'folderInvalid',
    'Codex-forbindelsen ble lukket.':'connectionError',
    'Codex kunne ikke levere disse kontodataene.':'accountError',
    'Codex svarte ikke innen 15 sekunder.':'timeoutError',
    'Lokale data kunne ikke oppdateres. Prøver igjen automatisk.':'localError',
    'Ingen forbindelse til lokal Codex. Åpne Codex og kontroller at du er logget inn. Nytt forsøk skjer automatisk.':'connectionError'
  })[message] || (Object.hasOwn(catalogs.en,message) ? message : 'genericError');
}
export function warningText(message,t,number = n => n) {
  const count = number(Number(String(message).match(/^\d+/)?.[0] || 0));
  if (String(message).includes('ugyldige logglinjer')) return t('badLines',{n:count});
  if (String(message).includes('eldre loggfiler')) return t('legacyFiles',{n:count});
  return t('logReadError');
}
