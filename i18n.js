"use strict";
/* ---------- Mehrsprachigkeit ----------
   Der deutsche Text ist zugleich der Schlüssel: t('Windel gewechselt') → Übersetzung aus lang/<sprache>.js.
   Platzhalter: t('Heute {n}×', {n:3}). Fehlt eine Übersetzung, erscheint der deutsche Text.
   Die Sprachdatei wird synchron im <head> nachgeladen – nur die gewählte Sprache. */
const LANGS = {
  de: {name:'Deutsch',     locale:'de-DE'},
  en: {name:'English',     locale:'en-GB'},
  es: {name:'Español',     locale:'es-ES'},
  tr: {name:'Türkçe',      locale:'tr-TR'},
  pl: {name:'Polski',      locale:'pl-PL'},
  ru: {name:'Русский',     locale:'ru-RU'},
  uk: {name:'Українська',  locale:'uk-UA'},
  ar: {name:'العربية',     locale:'ar-u-nu-latn', rtl:true}
};
const LANG_KEY = 'babytracker.lang';
const LANG = (() => {
  let l = null;
  try { l = localStorage.getItem(LANG_KEY); } catch(e){}
  if (!LANGS[l]){ const n = (navigator.language || 'de').slice(0, 2).toLowerCase(); l = LANGS[n] ? n : 'de'; }
  return l;
})();
const LOCALE = LANGS[LANG].locale;
const I18N = {}, I18N_UNITS = {};
const I18N_MISSING = new Set();
document.documentElement.lang = LANG;
if (LANGS[LANG].rtl) document.documentElement.dir = 'rtl';
if (LANG !== 'de') document.write(`<script src="lang/${LANG}.js"><\/script>`);

function t(s, v){
  let r = s;
  if (LANG !== 'de'){ const d = I18N[LANG]; if (d && d[s] != null) r = d[s]; else I18N_MISSING.add(s); }
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
  return r;
}
function setLang(l){ try { localStorage.setItem(LANG_KEY, l); } catch(e){} location.reload(); }

/* Mengenangaben mit richtiger Mehrzahl (Intl.PluralRules: one/two/few/many/other) */
I18N_UNITS.de = {
  day:{one:'Tag', other:'Tage'}, week:{one:'Woche', other:'Wochen'}, month:{one:'Monat', other:'Monate'}, year:{one:'Jahr', other:'Jahre'},
  photo:{one:'Foto', other:'Fotos'}, entry:{one:'Eintrag', other:'Einträge'}, change:{one:'Änderung', other:'Änderungen'}
};
const pluralRules = new Intl.PluralRules(LOCALE);
function unit(n, u){
  const f = (I18N_UNITS[LANG] || I18N_UNITS.de)[u] || I18N_UNITS.de[u];
  return `${fmtNum(n)} ${f[pluralRules.select(n)] || f.other}`;
}

/* Zahlen, Datum, Wochentage passend zur Sprache */
const fmtNum = (x, d = 1) => Number(x).toLocaleString(LOCALE, {maximumFractionDigits:d});
const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString(LOCALE, opts);
const WD = [0, 1, 2, 3, 4, 5, 6].map(i => new Intl.DateTimeFormat(LOCALE, {weekday:'short'}).format(new Date(2024, 0, 7 + i)).replace(/\.$/, ''));

/* Feste Texte im HTML: data-i18n (Text), data-i18n-html (mit <b>), data-i18n-ph (Platzhalter), data-i18n-aria */
function applyStaticI18n(root){
  (root || document).querySelectorAll('[data-i18n]').forEach(el => {
    if (!el.dataset.i18nKey) el.dataset.i18nKey = el.textContent.replace(/\s+/g, ' ').trim();
    el.textContent = t(el.dataset.i18nKey);
  });
  (root || document).querySelectorAll('[data-i18n-html]').forEach(el => {
    if (!el.dataset.i18nKey) el.dataset.i18nKey = el.innerHTML.replace(/\s+/g, ' ').trim();
    el.innerHTML = t(el.dataset.i18nKey);
  });
  (root || document).querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  (root || document).querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
}
