"use strict";
/* ---------- Konstanten ---------- */
const KEY = 'babytracker.v1';
const TYPES = {
  wake:   {label:t('Aufgewacht'),    icon:'🌅'},
  sleep:  {label:t('Eingeschlafen'), icon:'🌙'},
  nap:    {label:t('Nickerchen'),    icon:'😴'},
  diaper: {label:t('Windel'),        icon:'🧷'},
  feed:   {label:t('Füttern'),       icon:'🍼'},
  weight: {label:t('Gewicht'),       icon:'⚖️'},
  note:   {label:t('Notiz'),         icon:'📝'},
  appt:   {label:t('Termin'),        icon:'📅'},
  custom: {label:t('Eigene Kategorie'), icon:'⭐'}
};
const STAT_TYPES = ['night', 'nap', 'diaper', 'feed', 'weight'];
const STAT_LABELS = {night:{label:t('Nachtschlaf'), icon:'🌙'}};
// Nachtschlaf „läuft“, wenn der letzte Aufwach-/Einschlaf-Eintrag ein Einschlafen ist (höchstens 18 h her)
function nightRunning(){
  const l = sorted().filter(e => e.type === 'wake' || e.type === 'sleep').pop();
  return l && l.type === 'sleep' && Date.now() - l.start < 18 * 3600e3 ? l : null;
}
const DIAPER_KIND  = {wet:t('Nass'), stool:t('Stuhl'), both:t('Nass + Stuhl')};
const DIAPER_ICON  = {wet:'💧', stool:'💩', both:'💧💩'};
const STOOL_CONS   = {liquid:t('Flüssig'), soft:t('Breiig'), normal:t('Normal'), hard:t('Fest / hart')};
const STOOL_COLOR  = {yellow:t('Gelb'), brown:t('Braun'), green:t('Grün'), black:t('Schwarz'), red:t('Rötlich'), pale:t('Hell / weißlich / grau'), other:t('Andere')};
const SIDES        = {left:t('Links'), right:t('Rechts'), bottle:t('Fläschchen'), solid:t('Beikost')};
const SIDES_FEED   = {left:t('Stillen links'), right:t('Stillen rechts'), bottle:t('Fläschchen'), solid:t('Beikost')};
const BOTTLE_FOOD  = {formula:t('Pre-/Säuglingsmilch'), pumped:t('Muttermilch (abgepumpt)'), water:t('Wasser / Tee'), other:t('Sonstiges')};
const SOLID_FOOD   = {veg:t('Gemüse'), fruit:t('Obst'), grain:t('Getreide'), meat:t('Fleisch / Fisch'), dairy:t('Milch-Getreide-Brei'), family:t('Familienkost'), other:t('Sonstiges')};
const MEAL_GAP     = 20 * 60000; // Stillvorgänge mit < 20 min Pause = eine Mahlzeit

/* ---------- Speicher ---------- */
/* state = {events, photos, meta, current}
   meta: synchronisierte Stammdaten – Baby-Profile {kind:'baby', name, birth, sex} und eigene Kategorien {kind:'cat', ...}.
   Ereignisse/Fotos ohne "baby"-Feld gehören zum ersten Profil "main" (Daten aus älteren Versionen). */
function normMeta(m){
  if ((m.kind || 'baby') === 'baby'){
    const o = {id:m.id, kind:'baby', name:m.name || '', birth:m.birth || ''};
    if (m.sex) o.sex = m.sex;
    return o;
  }
  const o = {id:m.id, kind:m.kind, name:m.name || ''};
  ['icon', 'unit', 'options'].forEach(k => { if (m[k]) o[k] = m[k]; });
  return o;
}
function migrate(s){
  s = s && typeof s === 'object' ? s : {};
  s.events = Array.isArray(s.events) ? s.events : [];
  s.photos = Array.isArray(s.photos) ? s.photos : [];
  if (!Array.isArray(s.meta)) s.meta = [normMeta({id:'main', kind:'baby', name:s.name, birth:s.birth})];
  delete s.name; delete s.birth;
  if (!s.meta.some(m => m.kind === 'baby')) s.meta.unshift(normMeta({id:'main', kind:'baby'}));
  if (!s.meta.some(m => m.kind === 'baby' && m.id === s.current)) s.current = s.meta.find(m => m.kind === 'baby').id;
  return s;
}
function load(){
  try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch(e){ return migrate(null); }
}
const babies = () => state.meta.filter(m => m.kind === 'baby');
const curBaby = () => state.meta.find(m => m.kind === 'baby' && m.id === state.current) || babies()[0];
const cats = () => state.meta.filter(m => m.kind === 'cat');
const babyOf = x => x.baby || 'main';
const mine = x => babyOf(x) === state.current;
let state = load();
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); scheduleFlush(); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});

/* ---------- Helfer ---------- */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const pad = n => String(n).padStart(2,'0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dayKey(ts){ const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function keyToDate(k){ const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); }
function shiftDay(k, n){ const d = keyToDate(k); d.setDate(d.getDate()+n); return dayKey(d.getTime()); }
const todayKey = () => dayKey(Date.now());
function fmtTime(ts){ const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtMin(m){ m = Math.round(m); m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m/60)) + ':' + pad(m % 60); }
function fmtDur(ms){
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return t('{n} min', {n:m});
  const h = Math.floor(m/60), r = m % 60;
  return r ? t('{h} h {m} min', {h, m:r}) : t('{h} h', {h});
}
function fmtHM(ms){ const m = Math.round(ms/60000); return Math.floor(m/60) + ':' + pad(m%60); }
function fmtClock(ms){ const s = Math.max(0, Math.floor(ms/1000)); return Math.floor(s/3600) + ':' + pad(Math.floor(s/60)%60) + ':' + pad(s%60); }
function ago(ts){
  const ms = Date.now() - ts, d = Math.floor(ms / 864e5);
  if (d >= 1){ const h = Math.floor(ms / 36e5) % 24; return t('vor {x}', {x: unit(d, 'day') + (h ? ' ' + t('{h} h', {h}) : '')}); }
  return t('vor {x}', {x: fmtDur(ms)});
}
function dayLabel(k){
  if (k === todayKey()) return t('Heute');
  if (k === shiftDay(todayKey(), -1)) return t('Gestern');
  const d = keyToDate(k); return `${WD[d.getDay()]} ${fmtDate(d, {day:'numeric', month:'numeric'})}`;
}
function dayShort(k){ const d = keyToDate(k); return `${WD[d.getDay()]} ${d.getDate()}.`; }
function minOfDay(ts){ const d = new Date(ts); return d.getHours()*60 + d.getMinutes(); }
function toLocalInput(ts){ const d = new Date(ts); return `${dayKey(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalInput(v){
  if (!v) return null;
  const [dp, tp] = v.split('T'); const [y,m,d] = dp.split('-').map(Number); const [h,mi] = (tp||'0:0').split(':').map(Number);
  return new Date(y, m-1, d, h, mi).getTime();
}
const mean = a => a.length ? a.reduce((x,y)=>x+y,0) / a.length : null;
const bedDay = ts => dayKey(ts - 5*3600e3); // Einschlafen nach Mitternacht zählt zum Vortag
const isTimed = e => e.type === 'nap' || (e.type === 'feed' && (e.side === 'left' || e.side === 'right'));
const sorted = () => state.events.filter(mine).sort((a,b) => a.start - b.start);
const running = type => state.events.find(e => mine(e) && e.type === type && isTimed(e) && e.end === null);
const catOf = e => state.meta.find(m => m.kind === 'cat' && m.id === e.cat);
const typeLabel = e => e.type === 'custom' ? (catOf(e)?.name || t('Gelöschte Kategorie')) : e.type === 'appt' ? (e.title || t('Termin')) : TYPES[e.type].label;
const typeIcon = e => e.type === 'custom' ? (catOf(e)?.icon || '⭐') : e.type === 'diaper' && e.kind ? DIAPER_ICON[e.kind]
  : e.type === 'feed' ? (e.side === 'solid' ? '🥣' : e.side === 'bottle' ? '🍼' : '🤱') : TYPES[e.type].icon;
const fmtKg = g => (g / 1000).toLocaleString(LOCALE, {minimumFractionDigits:2, maximumFractionDigits:3}) + ' kg';

function detail(e){
  if (e.type === 'weight') return [e.g ? fmtKg(e.g) : '', e.len ? `${fmtNum(e.len)} cm` : '', e.head ? t('KU {n} cm', {n:fmtNum(e.head)}) : ''].filter(Boolean).join(' · ');
  if (e.type === 'appt') return [e.place, e.dur ? fmtDur(e.dur * 60000) : ''].filter(Boolean).join(' · ');
  if (e.type === 'custom') return [e.opt, e.val != null && e.val !== '' ? `${fmtNum(e.val, 2)}${catOf(e)?.unit ? ' ' + catOf(e).unit : ''}` : ''].filter(Boolean).join(' · ');
  if (e.type === 'note') return '';
  if (e.type === 'diaper'){
    let s = DIAPER_KIND[e.kind] || '';
    if (e.kind !== 'wet'){ const p = [STOOL_CONS[e.cons], STOOL_COLOR[e.color]].filter(Boolean); if (p.length) s += ' · ' + p.join(', '); }
    return s;
  }
  if (e.type === 'feed'){
    let s = SIDES[e.side] || '';
    if (e.side === 'bottle') return (BOTTLE_FOOD[e.food] || t('Fläschchen')) + (e.ml ? ` · ${e.ml} ml` : '');
    if (e.side === 'solid') return t('Beikost') + (SOLID_FOOD[e.food] ? ': ' + SOLID_FOOD[e.food] : '') + (e.gr ? ` · ${e.gr} g` : '');
    return s + (e.end ? ` · ${fmtDur(e.end - e.start)} (${t('bis {time}', {time:fmtTime(e.end)})})` : ' · ' + t('läuft'));
  }
  if (e.type === 'nap') return e.end ? `${fmtDur(e.end - e.start)} (${t('bis {time}', {time:fmtTime(e.end)})})` : t('läuft');
  return '';
}
function rowHtml(e){
  return `<div class="row" data-id="${e.id}"><div class="ri">${typeIcon(e)}</div>
    <div class="rt">${fmtTime(e.start)}</div>
    <div class="rd">${esc(typeLabel(e))}<small>${esc([detail(e), e.note].filter(Boolean).join(' · ')) || '&nbsp;'}</small></div></div>`;
}

/* ---------- Aktionen mit Rückgängig ---------- */
function act(fn, msg, editId){
  const snap = JSON.stringify(state.events);
  fn(); save(); render();
  toast(msg, snap, editId);
}
function addEvent(e, msg){ act(() => state.events.push(e), msg, e.id); }
function newEvent(type, extra){ return Object.assign({id:uid(), type, start:Date.now(), baby:state.current}, extra || {}); }

let toastTimer;
function toast(msg, snap, editId){
  const box = $('#toast');
  box.innerHTML = `<span>${esc(msg)}</span>${snap ? `<button data-t="undo">${t('Rückgängig')}</button>` : ''}${editId ? `<button data-t="edit">${t('Zeit ändern')}</button>` : ''}`;
  box.hidden = false;
  box.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    hideToast();
    if (b.dataset.t === 'undo'){ state.events = JSON.parse(snap); save(); render(); }
    else if (state.events.some(e => e.id === editId)) openEdit(editId);
  };
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000);
}
function hideToast(){ $('#toast').hidden = true; }

/* ---------- Sheet ---------- */
// Android-Zurück-Taste / Wischgeste schließt ein offenes Sheet statt die App zu verlassen
function openSheet(html){
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  if ($('#sheet').hidden) history.pushState({sheet:true}, '');
  $('#sheet').hidden = false; $('#backdrop').hidden = false;
}
function hideSheet(){ $('#sheet').hidden = true; $('#backdrop').hidden = true; $('#sheet').onclick = null; }
let ignorePop = false;
function closeSheet(){ if ($('#sheet').hidden) return; hideSheet(); if (history.state && history.state.sheet){ ignorePop = true; history.back(); } }
window.addEventListener('popstate', () => {
  if (ignorePop){ ignorePop = false; return; }
  if (!$('#sheet').hidden) hideSheet(); else if (view !== 'home') showView('home', true);
});
$('#backdrop').onclick = closeSheet;
const chips = (map, sel, name) => Object.entries(map).map(([k,v]) =>
  `<button class="chip ${sel===k?'on':''}" data-${name}="${k}">${v}</button>`).join('');

/* ---------- Karten-Klicks ---------- */
$('#cards').addEventListener('click', ev => {
  const sb = ev.target.closest('[data-stat]');
  if (sb){ statType = sb.dataset.stat; showView('stats'); return; }
  const card = ev.target.closest('.card'); if (!card) return;
  const ty = card.dataset.type;
  if (ty === 'night') toggleNight();
  if (ty === 'nap'){
    const r = running('nap');
    if (r) act(() => { r.end = Date.now(); }, t('Nickerchen beendet · {d}', {d:fmtDur(Date.now() - r.start)}), r.id);
    else addEvent(newEvent('nap', {end:null}), t('Nickerchen gestartet'));
  }
  if (ty === 'diaper') openDiaper();
  if (ty === 'feed') openFeed();
  if (ty === 'weight') openWeight();
  if (ty === 'note') openNote();
  if (ty === 'appt') openAppointments();
});

/* Nachtschlaf: ein Knopf für Einschlafen und Aufwachen */
function logWake(){
  const w = newEvent('wake'), s = nightRunning();
  addEvent(w, t('Guten Morgen ☀️ Aufgewacht um {time}', {time:fmtTime(w.start)}) + (s ? ' · ' + t('Nachtschlaf') + ' ' + fmtDur(w.start - s.start) : ''));
}
function logSleep(){
  const r = running('nap'), s = newEvent('sleep');
  act(() => { if (r) r.end = s.start; state.events.push(s); }, t('Eingeschlafen um {time} – gute Nacht 🌙', {time:fmtTime(s.start)}), s.id);
}
function toggleNight(){
  if (nightRunning()) return logWake();
  const h = new Date().getHours();
  // morgens ohne erfasstes Einschlafen: kurz nachfragen statt zu raten
  if (h >= 4 && h < 12){
    openSheet(`<h3>🌙 ${t('Nachtschlaf')}</h3>
      <div class="hint">${t('Für letzte Nacht ist kein Einschlafen erfasst. Was möchtest du speichern?')}</div>
      <div class="choices">
        <button class="choice suggest" data-n="wake">🌅<span>${t('Aufgewacht')}</span><small>${t('jetzt')}</small></button>
        <button class="choice" data-n="sleep">🌙<span>${t('Eingeschlafen')}</span><small>${t('jetzt')}</small></button>
      </div>
      <button class="btn ghost wide" data-n="close">${t('Abbrechen')}</button>`);
    $('#sheet').onclick = ev => {
      const a = ev.target.closest('[data-n]')?.dataset.n; if (!a) return;
      closeSheet();
      if (a === 'wake') logWake();
      if (a === 'sleep') logSleep();
    };
    return;
  }
  logSleep();
}

function openDiaper(){
  let kind = null, cons = null, color = null;
  const draw = () => openSheet(`<h3>${t('Windel gewechselt')}</h3>
    <div class="choices">${Object.keys(DIAPER_KIND).map(k =>
      `<button class="choice ${kind===k?'on':''}" data-kind="${k}">${DIAPER_ICON[k]}<span>${DIAPER_KIND[k]}</span></button>`).join('')}</div>
    ${kind && kind !== 'wet' ? `
      <div class="lbl">${t('Konsistenz')}</div><div class="chips">${chips(STOOL_CONS, cons, 'cons')}</div>
      <div class="lbl">${t('Farbe')}</div><div class="chips">${chips(STOOL_COLOR, color, 'color')}</div>
      <button class="btn wide" data-cam="1">📷 ${t('Farbe per Foto bestimmen')}</button>
      <button class="btn primary wide" data-save="1">${t('Speichern')}</button>` : `<div class="muted" style="margin-top:10px">${t('Tippe auf „Nass“ zum direkten Speichern.')}</div>`}
    <button class="btn ghost wide" data-close="1">${t('Abbrechen')}</button>`);
  draw();
  $('#sheet').onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.close) return closeSheet();
    if (b.dataset.cam) return openStoolCam({kind, cons});
    if (b.dataset.kind){
      kind = b.dataset.kind;
      if (kind === 'wet'){ closeSheet(); return addEvent(newEvent('diaper', {kind}), t('Windel: {x}', {x:DIAPER_KIND.wet})); }
      return draw();
    }
    if (b.dataset.cons){ cons = cons === b.dataset.cons ? null : b.dataset.cons; return draw(); }
    if (b.dataset.color){ color = color === b.dataset.color ? null : b.dataset.color; return draw(); }
    if (b.dataset.save){
      closeSheet();
      const e = newEvent('diaper', {kind}); if (cons) e.cons = cons; if (color) e.color = color;
      addEvent(e, t('Windel: {x}', {x:detail(e)}));
      stoolAlert(e);
    }
  };
}

function lastBreastSide(){
  const f = sorted().filter(e => e.type === 'feed' && isTimed(e));
  return f.length ? f[f.length-1] : null;
}
const lastFood = side => { const f = sorted().filter(e => e.type === 'feed' && e.side === side && e.food); return f.length ? f[f.length-1].food : null; };
function openFeed(){
  const r = running('feed');
  if (r){
    const other = r.side === 'left' ? 'right' : 'left';
    openSheet(`<h3>${t('Stillen läuft – {side}', {side:SIDES[r.side]})}</h3>
      <div class="hint">${t('Seit {time}', {time:fmtTime(r.start)})} · ${fmtDur(Date.now() - r.start)}</div>
      <button class="btn primary wide" data-a="stop">${t('Beenden')}</button>
      <button class="btn wide" data-a="switch">${t('Seite wechseln → {side}', {side:SIDES[other]})}</button>
      <button class="btn wide danger" data-a="discard">${t('Verwerfen')}</button>
      <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
    $('#sheet').onclick = ev => {
      const a = ev.target.closest('button')?.dataset.a; if (!a) return;
      closeSheet();
      if (a === 'stop') act(() => { r.end = Date.now(); }, t('Stillen beendet · {d}', {d:fmtDur(Date.now() - r.start)}), r.id);
      if (a === 'switch') act(() => { r.end = Date.now(); state.events.push(newEvent('feed', {side:other, end:null})); }, t('Gewechselt auf {side}', {side:SIDES[other]}));
      if (a === 'discard') act(() => { state.events = state.events.filter(e => e.id !== r.id); }, t('Stillvorgang verworfen'));
    };
    return;
  }
  const last = lastBreastSide();
  const suggest = last ? (last.side === 'left' ? 'right' : 'left') : null;
  let mode = null, food = null;
  const draw = () => {
    const amount = mode === 'bottle' ? $('#amt')?.value : mode === 'solid' ? $('#amt')?.value : '';
    const what = $('#what')?.value || '';
    openSheet(`<h3>${t('Füttern')}</h3>
      ${last ? `<div class="hint">${t('Zuletzt gestillt: {side}, {ago}', {side:SIDES[last.side], ago:ago(last.end || last.start)})}</div>` : ''}
      <div class="choices">
        ${['left','right'].map(s => `<button class="choice ${suggest===s?'suggest':''}" data-side="${s}">🤱<span>${SIDES_FEED[s]}</span>${suggest===s?`<small>${t('empfohlen')}</small>`:''}</button>`).join('')}
        <button class="choice ${mode==='bottle'?'on':''}" data-mode="bottle">🍼<span>${t('Fläschchen')}</span></button>
        <button class="choice ${mode==='solid'?'on':''}" data-mode="solid">🥣<span>${t('Beikost')}</span></button>
      </div>
      ${mode === 'bottle' ? `<div class="lbl">${t('Was ist im Fläschchen?')}</div><div class="chips">${chips(BOTTLE_FOOD, food, 'food')}</div>
        <div class="field"><label for="amt">${t('Menge (ml)')}</label><input id="amt" type="number" inputmode="numeric" value="${esc(amount)}" placeholder="${t('z. B. 120')}"></div>
        <button class="btn primary wide" data-save="bottle">🍼 ${t('Speichern')}</button>` : ''}
      ${mode === 'solid' ? `<div class="lbl">${t('Art der Beikost')}</div><div class="chips">${chips(SOLID_FOOD, food, 'food')}</div>
        <div class="field"><label for="what">${t('Was genau? (optional)')}</label><input id="what" value="${esc(what)}" placeholder="${t('z. B. Karotte-Kartoffel')}"></div>
        <div class="field"><label for="amt">${t('Menge in Gramm (optional)')}</label><input id="amt" type="number" inputmode="numeric" value="${esc(amount)}" placeholder="${t('z. B. 80')}"></div>
        <button class="btn primary wide" data-save="solid">🥣 ${t('Speichern')}</button>` : ''}
      <button class="btn ghost wide" data-close="1">${t('Abbrechen')}</button>`);
  };
  draw();
  $('#sheet').onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.close) return closeSheet();
    if (b.dataset.side){ closeSheet(); return addEvent(newEvent('feed', {side:b.dataset.side, end:null}), t('Stillen gestartet · {side}', {side:SIDES[b.dataset.side]})); }
    if (b.dataset.mode){ mode = b.dataset.mode; food = lastFood(mode) || (mode === 'bottle' ? 'formula' : null); return draw(); }
    if (b.dataset.food){ food = food === b.dataset.food ? null : b.dataset.food; return draw(); }
    if (b.dataset.save){
      const n = parseInt($('#amt').value, 10), what = $('#what')?.value.trim();
      const e = newEvent('feed', {side:b.dataset.save});
      if (food) e.food = food;
      if (n > 0) e[b.dataset.save === 'bottle' ? 'ml' : 'gr'] = n;
      if (what) e.note = what;
      closeSheet(); addEvent(e, t('{x} gespeichert', {x:detail(e)}));
    }
  };
}

/* ---------- Bearbeiten / Nachtragen ---------- */
function openEdit(id, newType){
  const isNew = !id;
  const orig = isNew ? null : state.events.find(e => e.id === id);
  if (orig && SPECIAL_TYPES.includes(orig.type)) return openSpecialEdit(orig);
  const e = isNew ? {id:uid(), type:newType || 'diaper', start:Date.now(), baby:state.current} : Object.assign({}, orig);
  if (isNew && e.type === 'diaper') e.kind = 'wet';
  if (isNew && e.type === 'feed') e.side = 'left';
  const startInit = toLocalInput(e.start), endInit = e.end ? toLocalInput(e.end) : '';

  const draw = () => {
    const timed = isTimed(e);
    openSheet(`<h3>${isNew ? t('Eintrag nachtragen') : TYPES[e.type].icon + ' ' + t('{x} bearbeiten', {x:TYPES[e.type].label})}</h3>
      ${isNew ? `<div class="field"><label>${t('Art')}</label><select id="fType">${
          ['wake','sleep','nap','diaper','feed','weight','note','appt'].map(k =>
          `<option value="${k}" ${e.type===k?'selected':''}>${TYPES[k].icon} ${TYPES[k].label}</option>`).join('')
          + cats().map(c => `<option value="c:${c.id}">${esc(c.icon || '⭐')} ${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      ${e.type === 'feed' ? `<div class="field"><label>${t('Art')}</label><select id="fSide">${Object.entries(SIDES_FEED).map(([k,v]) =>
          `<option value="${k}" ${e.side===k?'selected':''}>${v}</option>`).join('')}</select></div>` : ''}
      ${e.type === 'feed' && (e.side === 'bottle' || e.side === 'solid') ? `<div class="field"><label>${t('Nahrung')}</label><select id="fFood"><option value="">–</option>${
          Object.entries(e.side === 'bottle' ? BOTTLE_FOOD : SOLID_FOOD).map(([k,v]) => `<option value="${k}" ${e.food===k?'selected':''}>${v}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>${timed ? t('Beginn') : t('Zeitpunkt')}</label><input type="datetime-local" id="fStart" value="${toLocalInput(e.start)}"></div>
      ${timed ? `<div class="field"><label>${isNew ? t('Ende') : t('Ende (leer = läuft noch)')}</label><input type="datetime-local" id="fEnd" value="${e.end ? toLocalInput(e.end) : ''}"></div>` : ''}
      ${e.type === 'feed' && e.side === 'bottle' ? `<div class="field"><label>${t('Menge (ml)')}</label><input type="number" inputmode="numeric" id="fMl" value="${e.ml || ''}"></div>` : ''}
      ${e.type === 'feed' && e.side === 'solid' ? `<div class="field"><label>${t('Menge (g)')}</label><input type="number" inputmode="numeric" id="fGr" value="${e.gr || ''}"></div>` : ''}
      ${e.type === 'diaper' ? `
        <div class="lbl">${t('Windel')}</div><div class="chips">${chips(DIAPER_KIND, e.kind, 'kind')}</div>
        ${e.kind !== 'wet' ? `<div class="lbl">${t('Konsistenz')}</div><div class="chips">${chips(STOOL_CONS, e.cons, 'cons')}</div>
        <div class="lbl">${t('Farbe')}</div><div class="chips">${chips(STOOL_COLOR, e.color, 'color')}</div>` : ''}` : ''}
      <div class="field"><label>${t('Notiz')}</label><input id="fNote" value="${esc(e.note || '')}" placeholder="${t('optional')}"></div>
      <button class="btn primary wide" data-a="save">${t('Speichern')}</button>
      ${isNew ? '' : `<button class="btn wide danger" data-a="del">${t('Löschen')}</button>`}
      <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
    const ft = $('#fType'); if (ft) ft.onchange = () => {
      grab();
      if (ft.value.startsWith('c:')) return openSpecialEdit({type:'custom', cat:ft.value.slice(2), start:e.start}, true);
      if (SPECIAL_TYPES.includes(ft.value)) return openSpecialEdit({type:ft.value, start:e.start}, true);
      e.type = ft.value;
      if (e.type === 'diaper' && !e.kind) e.kind = 'wet'; if (e.type === 'feed' && !e.side) e.side = 'left'; draw(); };
    const fs = $('#fSide'); if (fs) fs.onchange = () => { grab(); e.side = fs.value; delete e.food; draw(); };
    const ff = $('#fFood'); if (ff) ff.onchange = () => { e.food = ff.value || undefined; };
  };
  // aktuelle Eingaben ins Objekt übernehmen, bevor neu gezeichnet wird
  const grab = () => {
    const s = $('#fStart')?.value; if (s) e.start = s === startInit && orig ? orig.start : fromLocalInput(s);
    const en = $('#fEnd'); if (en) e.end = en.value ? (en.value === endInit && orig ? orig.end : fromLocalInput(en.value)) : null;
    const ml = $('#fMl'); if (ml) e.ml = parseInt(ml.value, 10) || undefined;
    const gr = $('#fGr'); if (gr) e.gr = parseInt(gr.value, 10) || undefined;
    const ff = $('#fFood'); if (ff) e.food = ff.value || undefined;
    const n = $('#fNote'); if (n) e.note = n.value.trim() || undefined;
  };
  draw();
  $('#sheet').onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.kind){ grab(); e.kind = b.dataset.kind; return draw(); }
    if (b.dataset.cons){ grab(); e.cons = e.cons === b.dataset.cons ? undefined : b.dataset.cons; return draw(); }
    if (b.dataset.color){ grab(); e.color = e.color === b.dataset.color ? undefined : b.dataset.color; return draw(); }
    const a = b.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'del'){ closeSheet(); return act(() => { state.events = state.events.filter(x => x.id !== id); }, t('Eintrag gelöscht')); }
    if (a === 'save'){
      grab();
      if (!e.start) return alert(t('Bitte einen Zeitpunkt angeben.'));
      if (isTimed(e)){
        if (isNew && !e.end) return alert(t('Bitte auch ein Ende angeben.'));
        if (e.end && e.end < e.start) return alert(t('Das Ende liegt vor dem Beginn.'));
        if (e.end === undefined) e.end = null;
      } else delete e.end;
      if (e.type !== 'feed'){ delete e.side; delete e.ml; delete e.gr; delete e.food; }
      if (e.type === 'feed' && e.side !== 'bottle') delete e.ml;
      if (e.type === 'feed' && e.side !== 'solid') delete e.gr;
      if (e.type === 'feed' && isTimed(e)) delete e.food;
      if (e.type !== 'diaper'){ delete e.kind; delete e.cons; delete e.color; }
      if (e.type === 'diaper' && e.kind === 'wet'){ delete e.cons; delete e.color; }
      Object.keys(e).forEach(k => e[k] === undefined && delete e[k]);
      closeSheet();
      act(() => {
        if (isNew) state.events.push(e);
        else state.events = state.events.map(x => x.id === id ? e : x);
      }, isNew ? t('Eintrag nachgetragen') : t('Gespeichert'));
    }
  };
}
$('#addPast').onclick = () => openEdit(null);

/* ---------- Ansicht: Start ---------- */
function renderCards(){
  const now = Date.now(), tk = todayKey();
  const ev = sorted();
  const today = ev.filter(e => dayKey(e.start) === tk);
  const lastOf = ty => { const l = ev.filter(e => e.type === ty); return l[l.length-1]; };

  const ns = nightRunning();
  document.querySelector('.card[data-type=night]').classList.toggle('running', !!ns);
  $('#ic-night').textContent = ns ? '😴' : '🌙';
  $('#lb-night').textContent = ns ? t('Nachtschlaf läuft') : t('Nachtschlaf');
  if (ns) $('#st-night').textContent = t('Eingeschlafen {time} · {clock} · tippen = aufgewacht', {time:fmtTime(ns.start), clock:fmtClock(now - ns.start)});
  else {
    const w = today.filter(e => e.type === 'wake')[0], lw = lastOf('wake');
    const lastNight = lw ? ev.filter(e => e.type === 'sleep' && e.start < lw.start && lw.start - e.start < 18 * 3600e3).pop() : null;
    $('#st-night').textContent = w
      ? t('Heute aufgewacht {time}', {time:fmtTime(w.start)}) + (lastNight ? ' · ' + t('Nacht {d}', {d:fmtDur(w.start - lastNight.start)}) : '') + ' · ' + t('tippen = eingeschlafen')
      : t('Tippen = eingeschlafen · morgens: aufgewacht');
  }

  const rn = running('nap');
  document.querySelector('.card[data-type=nap]').classList.toggle('running', !!rn);
  $('#lb-nap').textContent = rn ? t('Nickerchen beenden') : t('Nickerchen');
  if (rn) $('#st-nap').textContent = t('läuft {clock}', {clock:fmtClock(now - rn.start)});
  else {
    const naps = today.filter(e => e.type === 'nap' && e.end);
    const tot = naps.reduce((a,e) => a + e.end - e.start, 0);
    $('#st-nap').textContent = naps.length ? t('Heute {n}×', {n:naps.length}) + ' · ' + fmtDur(tot) : t('Tippen zum Starten');
  }

  const d = today.filter(e => e.type === 'diaper'), ld = lastOf('diaper');
  $('#st-diaper').textContent = ld ? t('Heute {n}×', {n:d.length}) + ' · ' + t('zuletzt {ago}', {ago:ago(ld.start)}) : t('Noch kein Eintrag');

  const rf = running('feed');
  document.querySelector('.card[data-type=feed]').classList.toggle('running', !!rf);
  $('#lb-feed').textContent = rf ? t('Stillen – {side}', {side:SIDES[rf.side]}) : t('Füttern');
  $('#ic-feed').textContent = rf ? '🤱' : '🍼';
  if (rf) $('#st-feed').textContent = fmtClock(now - rf.start) + ' · ' + t('tippen zum Beenden');
  else {
    const meals = mealsOf(ev).filter(m => dayKey(m.start) === tk);
    const lf = lastOf('feed');
    $('#st-feed').textContent = lf ? t('Heute {n}×', {n:meals.length}) + ` · ${ago(lf.end || lf.start)} ${typeIcon(lf)}` : t('Stillen, Fläschchen, Beikost');
  }
  renderExtraCardStatus(ev);
}
function renderToday(){
  const tk = todayKey();
  const list = sorted().filter(e => dayKey(e.start) === tk).reverse();
  $('#today').innerHTML = list.length ? list.map(rowHtml).join('') : `<div class="empty">${t('Noch keine Einträge heute')}</div>`;
}
$('#today').onclick = $('#historyList').onclick = ev => { const r = ev.target.closest('.row'); if (r) openEdit(r.dataset.id); };

/* ---------- Ansicht: Verlauf ---------- */
function renderHistory(){
  const ev = sorted().reverse();
  if (!ev.length){ $('#historyList').innerHTML = `<div class="empty">${t('Noch keine Einträge')}</div>`; return; }
  let html = '', cur = null;
  ev.forEach(e => {
    const k = dayKey(e.start);
    if (k !== cur){ if (cur) html += '</div>'; cur = k; html += `<div class="dayhead">${dayLabel(k)} · ${fmtDate(keyToDate(k))}</div><div class="list">`; }
    html += rowHtml(e);
  });
  $('#historyList').innerHTML = html + '</div>';
}

/* ---------- Statistik ---------- */
let statType = 'night', statRange = 7;
function lastDays(n){ const out = [], tk = todayKey(); for (let i = n-1; i >= 0; i--) out.push(shiftDay(tk, -i)); return out; }
// Milchmahlzeiten (Stillen + Fläschchen mit Milch); Beikost und Wasser zählen nicht mit
const isMilk = e => e.type === 'feed' && e.side !== 'solid' && e.food !== 'water';
function mealsOf(ev){
  const meals = [];
  ev.filter(isMilk).forEach(e => {
    const end = e.end || (e.end === null ? Date.now() : e.start);
    const m = meals[meals.length-1];
    if (m && e.start - m.end < MEAL_GAP){ m.end = Math.max(m.end, end); m.parts.push(e); }
    else meals.push({start:e.start, end, parts:[e]});
  });
  meals.forEach(m => m.breast = m.parts.filter(isTimed).reduce((a,e) => a + ((e.end || Date.now()) - e.start), 0));
  return meals;
}
const tile = (v, l) => `<div class="tile"><div class="tv">${v ?? '–'}</div><div class="tl">${l}</div></div>`;
function bars(days, vals, fmt, title){
  const max = Math.max(1, ...vals), n = days.length;
  return `<div class="panel"><h4>${title}</h4><div class="chart">${days.map((d,i) => `<div class="bc">
    <div class="bv">${n <= 14 && vals[i] ? fmt(vals[i]) : ''}</div>
    <div class="bw"><div class="bar" style="height:${vals[i] / max * 100}%;${vals[i] ? '' : 'opacity:.15'}"></div></div>
    <div class="bl">${n <= 14 || (n-1-i) % 5 === 0 ? (n <= 7 ? dayShort(d) : keyToDate(d).getDate() + '.') : ''}</div></div>`).join('')}</div></div>`;
}
function timeRows(days, map, title){
  const vals = days.map(d => map[d]).filter(v => v != null);
  if (!vals.length) return `<div class="panel"><h4>${title}</h4><div class="empty">${t('Keine Daten im Zeitraum')}</div></div>`;
  const lo = Math.floor((Math.min(...vals) - 30) / 60) * 60, hi = Math.ceil((Math.max(...vals) + 30) / 60) * 60;
  return `<div class="panel"><h4>${title}</h4>${days.slice().reverse().map(d => map[d] == null ? '' : `<div class="trow">
    <div class="tdl">${dayShort(d)}</div><div class="trk"><div class="dot" style="left:${(map[d]-lo)/(hi-lo)*100}%"></div></div>
    <div class="ttv">${fmtMin(map[d])}</div></div>`).join('')}
    <div class="axis"><span>${fmtMin(lo)}</span><span>${fmtMin(hi)}</span></div></div>`;
}
function dist(title, counts, labels, unit){
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  if (!total) return '';
  return `<div class="panel"><h4>${title}</h4>${Object.keys(labels).filter(k => counts[k]).map(k => `<div class="dist">
    <div class="dn">${labels[k]}</div><div class="dt"><div class="df" style="width:${counts[k]/total*100}%"></div></div>
    <div class="dc">${unit ? unit(counts[k]) : counts[k] + '×'}</div></div>`).join('')}</div>`;
}
function nights(ev){ // je Nacht: letztes Einschlafen + nächstes Aufwachen
  const byDay = {};
  ev.filter(e => e.type === 'sleep').forEach(e => { byDay[bedDay(e.start)] = e; });
  const wakes = ev.filter(e => e.type === 'wake');
  const out = {};
  Object.entries(byDay).forEach(([k, s]) => {
    const w = wakes.find(x => x.start > s.start && x.start - s.start < 18*3600e3);
    out[k] = {bed:s.start, wake:w ? w.start : null};
  });
  return out;
}

function renderStats(){
  if (statType === 'wake' || statType === 'sleep') statType = 'night';
  if (statType.startsWith('c:') && !cats().some(c => 'c:' + c.id === statType)) statType = 'night';
  $('#statTypes').innerHTML = STAT_TYPES.map(k => { const ty = STAT_LABELS[k] || TYPES[k];
    return `<button class="chip ${statType===k?'on':''}" data-st="${k}">${ty.icon} ${ty.label}</button>`; }).join('')
    + cats().map(c => `<button class="chip ${statType==='c:'+c.id?'on':''}" data-st="c:${c.id}">${esc(c.icon || '⭐')} ${esc(c.name)}</button>`).join('');
  if (statType === 'weight' || statType.startsWith('c:')){
    $('#statRange').innerHTML = statType === 'weight' ? '' : [7,30,90].map(n => `<button class="${statRange===n?'on':''}" data-r="${n}">${unit(n, 'day')}</button>`).join('');
    $('#statRange').hidden = statType === 'weight';
    $('#statBody').innerHTML = statType === 'weight' ? weightStatsHtml() : customStatsHtml(statType.slice(2), statRange);
    return;
  }
  $('#statRange').hidden = false;
  if (![7,14,30].includes(statRange)) statRange = 7;
  $('#statRange').innerHTML = [7,14,30].map(n => `<button class="${statRange===n?'on':''}" data-r="${n}">${unit(n, 'day')}</button>`).join('');

  const ev = sorted(), days = lastDays(statRange), inR = new Set(days);
  const tracked = days.filter(d => ev.some(e => dayKey(e.start) === d));
  const nd = Math.max(1, tracked.length);
  const per = (filter, val) => days.map(d => ev.filter(e => dayKey(e.start) === d && filter(e)).reduce((a,e) => a + val(e), 0));
  let html = '';

  if (statType === 'night'){
    const n = nights(ev), bedMap = {}, dur = {}, wakeMap = {};
    days.forEach(d => { if (n[d]){ let m = minOfDay(n[d].bed); if (m < 300) m += 1440; bedMap[d] = m; if (n[d].wake) dur[d] = n[d].wake - n[d].bed; } });
    ev.filter(e => e.type === 'wake' && inR.has(dayKey(e.start))).forEach(e => { const k = dayKey(e.start); if (wakeMap[k] == null) wakeMap[k] = minOfDay(e.start); });
    const bv = Object.values(bedMap), dv = Object.values(dur), wv = Object.values(wakeMap);
    const awake = days.map(d => { const w = ev.find(e => e.type === 'wake' && dayKey(e.start) === d); const b = n[d]; return w && b && b.bed > w.start ? b.bed - w.start : null; }).filter(x => x);
    html = `<div class="tiles">${tile(dv.length ? t('{h} h', {h:fmtHM(mean(dv))}) : null, t('Ø Nachtschlaf'))}${tile(awake.length ? t('{h} h', {h:fmtHM(mean(awake))}) : null, t('Ø Tag (wach → Nacht)'))}
      ${tile(bv.length ? fmtMin(mean(bv)) : null, t('Ø Einschlafzeit'))}${tile(wv.length ? fmtMin(mean(wv)) : null, t('Ø Aufwachzeit'))}
      ${tile(dv.length ? t('{h} h', {h:fmtHM(Math.max(...dv))}) : null, t('Längste Nacht'))}${tile(dv.length ? t('{h} h', {h:fmtHM(Math.min(...dv))}) : null, t('Kürzeste Nacht'))}</div>
      ${bars(days, days.map(d => dur[d] || 0), fmtHM, t('Nachtschlaf (Einschlafen → Aufwachen)'))}
      ${timeRows(days, bedMap, t('Einschlafzeit pro Abend'))}
      ${timeRows(days, wakeMap, t('Aufwachzeit pro Morgen'))}
      <div class="muted" style="margin-top:8px">${t('Die Nacht wird dem Abend zugeordnet, an dem das Baby eingeschlafen ist.')}</div>`;
  }

  if (statType === 'nap'){
    const naps = ev.filter(e => e.type === 'nap' && inR.has(dayKey(e.start)));
    const len = e => (e.end || Date.now()) - e.start;
    const done = naps.filter(e => e.end).map(len);
    const tot = per(e => e.type === 'nap', len), cnt = per(e => e.type === 'nap', () => 1);
    html = `<div class="tiles">${tile(fmtNum(naps.length / nd), t('Ø Nickerchen / Tag'))}
      ${tile(naps.length ? t('{h} h', {h:fmtHM(tot.reduce((a,b)=>a+b,0) / nd)}) : null, t('Ø Tagschlaf / Tag'))}
      ${tile(done.length ? fmtDur(mean(done)) : null, t('Ø Dauer'))}${tile(done.length ? fmtDur(Math.max(...done)) : null, t('Längstes'))}</div>
      ${bars(days, tot, fmtHM, t('Tagschlaf pro Tag (Std:Min)'))}
      ${bars(days, cnt, x => x, t('Anzahl Nickerchen pro Tag'))}`;
  }

  if (statType === 'diaper'){
    const d = ev.filter(e => e.type === 'diaper' && inR.has(dayKey(e.start)));
    const stools = d.filter(e => e.kind !== 'wet');
    const lastStool = ev.filter(e => e.type === 'diaper' && e.kind !== 'wet').pop();
    const c = (list, f) => list.reduce((o,e) => (e[f] && (o[e[f]] = (o[e[f]] || 0) + 1), o), {});
    html = `<div class="tiles">${tile(fmtNum(d.length / nd), t('Ø Windeln / Tag'))}
      ${tile(fmtNum(stools.length / nd), t('Ø Stuhlgänge / Tag'))}
      ${tile(lastStool ? fmtTime(lastStool.start) : null, lastStool ? t('Letzter Stuhl') + ' · ' + dayLabel(dayKey(lastStool.start)) : t('Letzter Stuhl'))}
      ${tile(d.filter(e => dayKey(e.start) === todayKey()).length, t('Windeln heute'))}</div>
      ${bars(days, per(e => e.type === 'diaper', () => 1), x => x, t('Windeln pro Tag'))}
      ${bars(days, per(e => e.type === 'diaper' && e.kind !== 'wet', () => 1), x => x, t('Stuhlgänge pro Tag'))}
      ${dist(t('Art'), c(d, 'kind'), DIAPER_KIND)}${dist(t('Konsistenz (Stuhl)'), c(stools, 'cons'), STOOL_CONS)}${dist(t('Farbe (Stuhl)'), c(stools, 'color'), STOOL_COLOR)}`;
  }

  if (statType === 'feed'){
    const meals = mealsOf(ev).filter(m => inR.has(dayKey(m.start)));
    const gaps = []; for (let i = 1; i < meals.length; i++) gaps.push(meals[i].start - meals[i-1].start);
    const br = meals.filter(m => m.breast > 0).map(m => m.breast);
    const feeds = ev.filter(e => e.type === 'feed' && inR.has(dayKey(e.start)));
    const ml = feeds.filter(isMilk).reduce((a,e) => a + (e.ml || 0), 0);
    const sideCnt = {}, sideMin = {}, bottleMl = {}, solidCnt = {};
    feeds.forEach(e => { sideCnt[e.side] = (sideCnt[e.side] || 0) + 1; if (isTimed(e)) sideMin[e.side] = (sideMin[e.side] || 0) + ((e.end || Date.now()) - e.start); });
    feeds.filter(e => e.side === 'bottle').forEach(e => { const k = e.food || 'other'; bottleMl[k] = (bottleMl[k] || 0) + (e.ml || 0); });
    feeds.filter(e => e.side === 'solid').forEach(e => { const k = e.food || 'other'; solidCnt[k] = (solidCnt[k] || 0) + 1; });
    const solids = feeds.filter(e => e.side === 'solid');
    const mealCnt = days.map(d => meals.filter(m => dayKey(m.start) === d).length);
    html = `<div class="tiles">${tile(fmtNum(meals.length / nd), t('Ø Mahlzeiten / Tag'))}
      ${tile(gaps.length ? t('{h} h', {h:fmtHM(mean(gaps))}) : null, t('Ø Abstand'))}
      ${tile(br.length ? fmtDur(mean(br)) : null, t('Ø Stilldauer / Mahlzeit'))}
      ${tile(gaps.length ? t('{h} h', {h:fmtHM(Math.max(...gaps))}) : null, t('Längster Abstand'))}
      ${tile(br.length ? t('{h} h', {h:fmtHM(br.reduce((a,b)=>a+b,0) / nd)}) : null, t('Ø Stillzeit / Tag'))}
      ${tile(ml ? Math.round(ml / nd) + ' ml' : null, t('Ø Milch aus Fläschchen / Tag'))}
      ${solids.length ? tile(fmt1(solids.length / nd), t('Ø Beikost-Mahlzeiten / Tag')) : ''}
      ${solids.length ? tile(solids.some(e => e.gr) ? Math.round(solids.reduce((a,e) => a + (e.gr || 0), 0) / nd) + ' g' : null, t('Ø Beikost / Tag')) : ''}</div>
      ${bars(days, mealCnt, x => x, t('Milchmahlzeiten pro Tag'))}
      ${solids.length ? bars(days, per(e => e.type === 'feed' && e.side === 'solid', () => 1), x => x, t('Beikost-Mahlzeiten pro Tag')) : ''}
      ${dist(t('Fläschchen nach Inhalt (ml)'), bottleMl, BOTTLE_FOOD, v => v + ' ml')}
      ${dist(t('Beikost nach Art'), solidCnt, SOLID_FOOD)}
      ${bars(days, days.map(d => meals.filter(m => dayKey(m.start) === d).reduce((a,m) => a + m.breast, 0)), fmtHM, t('Stillzeit pro Tag (Std:Min)'))}
      ${dist(t('Art – Anzahl'), sideCnt, SIDES)}${dist(t('Stillseite – Dauer'), sideMin, {left:SIDES.left, right:SIDES.right}, fmtHM)}
      <div class="muted" style="margin-top:8px">${t('Milchmahlzeiten = Stillen und Fläschchen (ohne Wasser). Stillvorgänge mit weniger als 20 min Pause (z. B. Seitenwechsel) zählen als eine Mahlzeit.')}</div>`;
  }

  if (!tracked.length) html = `<div class="panel"><div class="empty">${t('Im gewählten Zeitraum gibt es noch keine Daten.')}</div></div>`;
  $('#statBody').innerHTML = adviceHtml(statType) + html;
}
$('#statTypes').onclick = ev => { const b = ev.target.closest('[data-st]'); if (b){ statType = b.dataset.st; renderStats(); } };
$('#statRange').onclick = ev => { const b = ev.target.closest('[data-r]'); if (b){ statRange = +b.dataset.r; renderStats(); } };

/* ---------- Daten / Export ---------- */
function renderData(){
  const b = curBaby();
  if (document.activeElement !== $('#babyName')) $('#babyName').value = b.name || '';
  if (document.activeElement !== $('#babyBirth')) $('#babyBirth').value = b.birth || '';
  $('#babySex').value = b.sex || '';
  $('#babyBirth').max = todayKey();
  renderSync(); renderSettings(); renderQuickBox();
  const ev = sorted();
  $('#countInfo').textContent = ev.length ? t('{n} seit {date}', {n:unit(ev.length, 'entry'), date:fmtDate(ev[0].start)}) : t('Noch keine Einträge');
}
// Profilfelder: Objekt ersetzen (nicht verändern), damit der Sync die Änderung erkennt
function updateBaby(fields){
  const b = curBaby();
  state.meta = state.meta.map(m => m === b ? normMeta(Object.assign({}, m, fields)) : m);
  save(); renderHeader();
}
$('#babyName').oninput = ev => updateBaby({name: ev.target.value.trim()});
$('#babyBirth').onchange = ev => updateBaby({birth: ev.target.value || ''});
$('#babySex').onchange = ev => updateBaby({sex: ev.target.value || ''});

const stamp = () => { const d = new Date(); return `${dayKey(d.getTime())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
const safeName = s => (s || '').replace(/[^\wäöüÄÖÜß-]+/g, '');
const fileBase = () => 'babytracker' + (curBaby().name ? '_' + safeName(curBaby().name) : '') + '_' + stamp();
const dateDE = ts => fmtDate(ts);

function toCsv(){
  const q = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = [t('Baby'),t('Typ'),t('Datum'),t('Beginn'),t('Ende'),t('Dauer (min)'),t('Seite/Art'),t('Nahrung'),t('Menge (ml)'),t('Menge (g)'),t('Windel'),t('Konsistenz'),t('Farbe'),
    t('Gewicht (g)'),t('Länge (cm)'),t('Kopfumfang (cm)'),t('Auswahl'),t('Wert'),t('Ort'),t('Notiz'),t('Beginn ISO'),t('Ende ISO')];
  const name = id => (babies().find(b => b.id === id) || {}).name || '';
  const rows = state.events.slice().sort((a,b) => a.start - b.start).map(e => [name(babyOf(e)), typeLabel(e), dateDE(e.start), fmtTime(e.start),
    e.end ? fmtTime(e.end) : (e.end === null ? t('läuft') : ''),
    e.end ? Math.round((e.end - e.start) / 60000) : (e.dur || ''), SIDES[e.side] || '', BOTTLE_FOOD[e.food] && e.side === 'bottle' ? BOTTLE_FOOD[e.food] : SOLID_FOOD[e.food] || '',
    e.ml || '', e.gr || '', DIAPER_KIND[e.kind] || '', STOOL_CONS[e.cons] || '', STOOL_COLOR[e.color] || '',
    e.g || '', e.len || '', e.head || '', e.opt || '', e.val ?? '', e.place || '', e.note || '',
    new Date(e.start).toISOString(), e.end ? new Date(e.end).toISOString() : '']);
  return '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
}
function toText(){
  let out = `${t('Baby-Tracker')}${curBaby().name ? ' – ' + curBaby().name : ''}${curBaby().birth ? ' (' + t('geb. {date}', {date:fmtDate(keyToDate(curBaby().birth))}) + ')' : ''}\n${t('Exportiert: {date}', {date:dateDE(Date.now()) + ' ' + fmtTime(Date.now())})}\n`;
  let cur = null;
  sorted().forEach(e => {
    const k = dayKey(e.start);
    if (k !== cur){ cur = k; const d = keyToDate(k); out += `\n== ${WD[d.getDay()]} ${fmtDate(d)} ==\n`; }
    out += `${fmtTime(e.start)}  ${typeLabel(e)}${detail(e) ? ' – ' + detail(e) : ''}${e.note ? ' (' + e.note + ')' : ''}\n`;
  });
  return out;
}
async function shareFile(name, text, mime){
  const file = new File([text], name, {type: mime});
  if (navigator.canShare && navigator.canShare({files:[file]})){
    try { await navigator.share({files:[file], title:name}); return; }
    catch(err){ if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const needData = () => { if (!state.events.length){ alert(t('Noch keine Daten zum Exportieren.')); return false; } return true; };
$('#expCsv').onclick  = () => needData() && shareFile(fileBase() + '.csv', toCsv(), 'text/csv');
$('#expTxt').onclick  = () => needData() && shareFile(fileBase() + '.txt', toText(), 'text/plain');
$('#expJson').onclick = () => needData() && shareFile(fileBase() + '.json', JSON.stringify({app:'babytracker', version:1, exported:new Date().toISOString(), ...state}, null, 1), 'application/json');
$('#impJson').onclick = () => $('#impFile').click();
$('#impFile').onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data.events;
    if (!Array.isArray(list)) throw new Error();
    const have = new Set(state.events.map(e => e.id));
    const add = list.filter(e => e && e.id && TYPES[e.type] && typeof e.start === 'number' && !have.has(e.id));
    const metaIds = new Set(state.meta.map(m => m.id));
    const addMeta = (Array.isArray(data.meta) ? data.meta : []).filter(m => m && m.id && !metaIds.has(m.id)).map(normMeta);
    if (!confirm(t('{n} neue Einträge importieren?', {n:add.length}) + (addMeta.length ? ' ' + t('(dazu {n} Profile/Kategorien)', {n:addMeta.length}) : '') + ' ' + t('(Bereits vorhandene werden übersprungen.)'))) return;
    state.events.push(...add); state.meta.push(...addMeta);
    if (!curBaby().name && data.name) updateBaby({name: data.name});
    save(); render(); alert(t('{n} Einträge importiert.', {n:add.length}));
  } catch(e){ alert(t('Die Datei konnte nicht gelesen werden. Bitte ein Backup (JSON) aus dieser App wählen.')); }
};
$('#wipe').onclick = () => {
  const n = state.events.filter(mine).length;
  if (!n) return;
  if (!confirm(t('Wirklich alle {n} Einträge von „{name}“ löschen? Das kann nicht rückgängig gemacht werden. Tipp: vorher ein Backup teilen.', {n, name:curBaby().name || t('diesem Baby')})
    + (sync.ready ? '\n\n' + t('Achtung: Der Sync ist aktiv – die Einträge werden auf ALLEN Geräten gelöscht.') : '')
    + '\n\n' + t('Fotos und andere Babys bleiben erhalten.'))) return;
  if (!confirm(t('Ganz sicher?'))) return;
  state.events = state.events.filter(e => !mine(e)); save(); render();
};

/* ---------- Geräte-Sync (Firebase) ----------
   Alle Geräte teilen einen Datensatz in Firestore (Sammlung "events" + Dokument "meta/main").
   "base" = zuletzt vom Server bestätigter Stand. Alles, was lokal davon abweicht, ist eine
   noch nicht übertragene Änderung und wird hochgeladen – auch nach Offline-Phasen oder App-Neustart. */
// Web-App-Konfiguration aus der Firebase-Konsole (diese Werte sind nicht geheim):
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDMhQdcevPn91vs4u6XDrB-BMWomdJTC2Q',
  authDomain: 'baby-tracker-e94f5.firebaseapp.com',
  projectId: 'baby-tracker-e94f5',
  storageBucket: 'baby-tracker-e94f5.firebasestorage.app',
  messagingSenderId: '790005890513',
  appId: '1:790005890513:web:a3951d155459f219a034f0'
};
const FB_URL = 'https://www.gstatic.com/firebasejs/10.12.2/';
const BASE_KEY = 'babytracker.syncbase.v1';
const sync = {fb:null, user:null, stage:'off', ready:false, serverOk:false, pendingWrites:false, error:'', unsubs:[], rendered:null, sent:{}};
let base = (() => { try { return JSON.parse(localStorage.getItem(BASE_KEY)); } catch(e){ return null; } })();
const saveBase = () => localStorage.setItem(BASE_KEY, JSON.stringify(base));
const ej = e => JSON.stringify(e, Object.keys(e).sort());
// Synchronisierte Sammlungen: Einträge und Stammdaten (Profile + Kategorien) nach demselben Prinzip
const COLLS = {
  events: {get: () => state.events, set: a => { state.events = a; }, norm: (d, id) => Object.assign(d, {id})},
  meta:   {get: () => state.meta,   set: a => { state.meta = a; },   norm: (d, id) => normMeta(Object.assign(d, {id})),
           // leeres Standardprofil eines neuen Geräts nicht hochladen – sonst überschreibt es das Profil vom Partner
           skip: m => m.kind === 'baby' && !m.name && !m.birth && !m.sex && !(base && base.meta && base.meta[m.id])}
};
function ensureBase(){
  base = base || {};
  base.events = base.events || {}; base.photos = base.photos || {};
  if (!base.meta){                       // Übernahme aus älterer Version (nur Name/Geburtstag)
    base.meta = {};
    if (base.name != null) base.meta.main = ej(normMeta({id:'main', kind:'baby', name:base.name, birth:base.birth}));
  }
}
if (base) ensureBase();
function pendingOf(c){
  const b = (base && base[c]) || {}, list = COLLS[c].get(), skip = COLLS[c].skip || (() => false);
  const ups = list.filter(x => b[x.id] !== ej(x) && !skip(x));
  const ids = new Set(list.map(x => x.id));
  return {ups, dels: Object.keys(b).filter(id => !ids.has(id))};
}
function pendingChanges(){
  let count = 0; const out = {};
  for (const c in COLLS){ out[c] = pendingOf(c); count += out[c].ups.length + out[c].dels.length; }
  const pp = photoPending();
  out.count = count + pp.ups.length + pp.dels.length;
  return out;
}

let flushTimer = null;
function scheduleFlush(){ clearTimeout(flushTimer); flushTimer = setTimeout(flush, 300); }
function flush(){
  if (!sync.ready) return setSyncStatus();
  const {db, f} = sync.fb, sent = sync.sent, ops = [];
  for (const c in COLLS){
    const p = pendingOf(c);
    p.ups.forEach(x => { const j = ej(x), k = c + '/' + x.id; if (sent[k] !== j){ sent[k] = j; ops.push(b => b.set(f.doc(db, c, x.id), x)); } });
    p.dels.forEach(id => { const k = c + '/' + id; if (sent[k] !== '-'){ sent[k] = '-'; ops.push(b => b.delete(f.doc(db, c, id))); } });
  }
  for (let i = 0; i < ops.length; i += 450){
    const batch = f.writeBatch(db);
    ops.slice(i, i + 450).forEach(op => op(batch));
    batch.commit().catch(err => { sync.sent = {}; syncError(err); });
  }
  photoFlush();
  setSyncStatus();
}

const onColl = c => snap => {
  const p = pendingOf(c);
  const docs = snap.docs.map(d => COLLS[c].norm(d.data(), d.id));
  const map = new Map(docs.map(x => [x.id, x]));
  p.ups.forEach(x => map.set(x.id, x));      // lokale, noch nicht bestätigte Änderungen behalten
  p.dels.forEach(id => map.delete(id));
  COLLS[c].set([...map.values()]);
  if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites){
    ensureBase(); base[c] = {};
    docs.forEach(x => { base[c][x.id] = ej(x); });
    saveBase();
    Object.keys(sync.sent).forEach(k => { if (k.startsWith(c + '/')) delete sync.sent[k]; });
  }
  if (c === 'meta'){                          // Platzhalter entfernen, sobald echte Profile da sind
    const real = state.meta.filter(m => m.kind === 'baby' && !(COLLS.meta.skip(m) && docs.some(d => d.kind === 'baby')));
    if (real.length) state.meta = state.meta.filter(m => m.kind !== 'baby' || real.includes(m));
    state = migrate(state);
  }
  if (c === 'events'){ sync.serverOk = !snap.metadata.fromCache; sync.pendingWrites = snap.metadata.hasPendingWrites; sync.error = ''; }
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
  if (pendingChanges().count) scheduleFlush(); else setSyncStatus();
};
const onEvents = onColl('events');

function syncError(err){
  console.warn('Sync', err);
  const code = err && err.code;
  sync.error = code === 'permission-denied'
    ? t('Kein Zugriff – ist diese E-Mail-Adresse in den Firestore-Regeln freigegeben?')
    : t('Sync-Fehler: {x}', {x: code || (err && err.message) || err});
  if (code === 'permission-denied') stopListening();
  setSyncStatus(); renderSync(true);
}
function stopListening(){ sync.unsubs.forEach(u => u()); sync.unsubs = []; sync.ready = false; }
function startListening(){
  stopListening();
  const u = sync.user;
  sync.stage = !u ? 'signedout' : !u.emailVerified ? 'unverified' : 'on';
  sync.error = ''; sync.serverOk = false; sync.sent = {};
  if (sync.stage === 'on'){
    const {db, f} = sync.fb;
    sync.unsubs.push(f.onSnapshot(f.collection(db, 'events'), {includeMetadataChanges:true}, onEvents, syncError));
    sync.unsubs.push(f.onSnapshot(f.collection(db, 'meta'), {includeMetadataChanges:true}, onColl('meta'), syncError));
    sync.photoErr = '';
    sync.unsubs.push(f.onSnapshot(f.collection(db, 'photos'), {includeMetadataChanges:true}, onPhotos, photoSyncError));
    sync.ready = true; flush();
  }
  renderSync(true);
}

async function initSync(){
  if (!FIREBASE_CONFIG){ sync.stage = 'unconfigured'; return renderSync(); }
  sync.stage = 'loading'; renderSync();
  try {
    const [appM, authM, fsM] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(FB_URL + f)));
    const app = appM.initializeApp(FIREBASE_CONFIG);
    let db;
    try { db = fsM.initializeFirestore(app, {ignoreUndefinedProperties:true,
            localCache: fsM.persistentLocalCache({tabManager: fsM.persistentMultipleTabManager()})}); }
    catch(e){ db = fsM.initializeFirestore(app, {ignoreUndefinedProperties:true}); }
    const auth = authM.getAuth(app);
    sync.fb = {app, db, auth, a:authM, f:fsM};
    authM.onAuthStateChanged(auth, user => { sync.user = user; startListening(); });
  } catch(e){
    console.warn('Sync laden', e);
    sync.stage = 'loadfail'; renderSync(); setSyncStatus();
  }
}

function syncInfo(){
  const s = sync.stage;
  if (s === 'loadfail') return {icon:'⚠️', short:t('Sync aus'), text:t('Sync konnte nicht geladen werden (offline?). Deine Einträge bleiben gespeichert und werden später übertragen.')};
  if (s === 'signedout') return {icon:'☁️', short:t('Nicht angemeldet'), text:t('Nicht angemeldet – Einträge bleiben nur auf diesem Gerät.')};
  if (s === 'unverified') return {icon:'✉️', short:t('E-Mail bestätigen'), text:t('E-Mail-Adresse noch nicht bestätigt.')};
  if (s !== 'on') return null;
  if (sync.error) return {icon:'⚠️', short:t('Sync-Fehler'), text:sync.error};
  if (sync.photoErr) return {icon:'⚠️', short:t('Fotos: kein Sync'), text:sync.photoErr};
  const n = pendingChanges().count;
  if (!sync.serverOk) return {icon:'📴', short:t('Offline') + (n ? ` · ${n}` : ''), text:t('Offline') + ' – ' + (n ? t('{x} warten auf Übertragung.', {x:unit(n, 'change')}) : t('neue Einträge werden später übertragen.'))};
  if (n || sync.pendingWrites) return {icon:'🔄', short:t('Sync …'), text:t('Wird synchronisiert …')};
  return {icon:'✅', short:t('Synchron'), text:t('Alles synchron.')};
}
function setSyncStatus(){
  const i = syncInfo(), ind = $('#syncInd');
  ind.hidden = !i;
  if (i) ind.textContent = i.icon + ' ' + i.short;
  const st = $('#syncStatus'); if (st && i) st.textContent = i.icon + ' ' + i.text;
}
$('#syncInd').onclick = () => showView('data');

function renderSync(force){
  const s = sync.stage;
  if (!force && sync.rendered === s) return setSyncStatus();
  sync.rendered = s;
  const u = sync.user, box = $('#syncBox');
  const logout = `<button class="btn ghost wide" data-s="logout">${t('Abmelden')}</button>`;
  if (s === 'unconfigured' || s === 'off') box.innerHTML = `<div class="hint">${t('Der Sync ist noch nicht eingerichtet. Die Daten bleiben vorerst nur auf diesem Gerät.')}</div>`;
  else if (s === 'loading') box.innerHTML = `<div class="hint">${t('Sync wird geladen …')}</div>`;
  else if (s === 'loadfail') box.innerHTML = `<div class="syncstatus" id="syncStatus"></div><button class="btn wide" data-s="retryload">${t('Erneut versuchen')}</button>`;
  else if (s === 'signedout') box.innerHTML = `
    <div class="hint">${t('Mit einem freigegebenen Konto anmelden, damit alle Geräte denselben Datensatz nutzen. Einträge, die schon auf diesem Gerät sind, werden dabei übernommen.')}</div>
    <div class="field"><label for="sEmail">${t('E-Mail')}</label><input id="sEmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off"></div>
    <div class="field"><label for="sPass">${t('Passwort')}</label><input id="sPass" type="password" autocomplete="current-password"></div>
    <button class="btn primary wide" data-s="login">${t('Anmelden')}</button>
    <button class="btn wide" data-s="signup">${t('Neues Konto erstellen')}</button>
    <button class="btn ghost wide" data-s="reset">${t('Passwort vergessen?')}</button>
    <div class="syncmsg" id="syncMsg"></div>`;
  else if (s === 'unverified') box.innerHTML = `
    <div class="hint">${t('Wir haben eine Bestätigungs-Mail an {email} geschickt (ggf. im Spam-Ordner schauen). Öffne den Link darin und tippe dann hier auf „Ich habe bestätigt“.', {email:`<b>${esc(u.email)}</b>`})}</div>
    <button class="btn primary wide" data-s="verified">${t('Ich habe bestätigt')}</button>
    <button class="btn wide" data-s="resend">${t('Mail erneut senden')}</button>${logout}
    <div class="syncmsg" id="syncMsg"></div>`;
  else if (s === 'on') box.innerHTML = `
    <div class="muted">${t('Angemeldet als {email}', {email:`<b>${esc(u.email)}</b>`})}</div>
    <div class="syncstatus" id="syncStatus"></div>
    ${sync.error ? `<button class="btn wide" data-s="retry">${t('Erneut versuchen')}</button>` : ''}${logout}`;
  setSyncStatus();
}

const AUTH_ERR = {
  'auth/invalid-credential':t('E-Mail oder Passwort ist falsch.'), 'auth/wrong-password':t('E-Mail oder Passwort ist falsch.'),
  'auth/user-not-found':t('Zu dieser E-Mail gibt es kein Konto.'), 'auth/invalid-email':t('Die E-Mail-Adresse ist ungültig.'),
  'auth/email-already-in-use':t('Für diese E-Mail gibt es schon ein Konto – bitte anmelden.'),
  'auth/weak-password':t('Das Passwort muss mindestens 6 Zeichen haben.'), 'auth/missing-password':t('Bitte ein Passwort eingeben.'),
  'auth/network-request-failed':t('Keine Internetverbindung.'), 'auth/too-many-requests':t('Zu viele Versuche – bitte kurz warten.'),
  'auth/operation-not-allowed':t('E-Mail/Passwort-Anmeldung ist in Firebase noch nicht aktiviert.')
};
function syncMsg(text, err){ const m = $('#syncMsg'); if (m){ m.textContent = text; m.className = 'syncmsg' + (err ? ' err' : ''); } }
$('#syncBox').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-s]'); if (!b) return;
  const a = b.dataset.s;
  if (a === 'retryload') return initSync();
  if (a === 'retry') return startListening();
  const {auth, a:A} = sync.fb || {};
  const email = ($('#sEmail')?.value || '').trim(), pass = $('#sPass')?.value || '';
  b.disabled = true;
  try {
    if (a === 'login'){ syncMsg(t('Anmelden …')); await A.signInWithEmailAndPassword(auth, email, pass); }
    if (a === 'signup'){
      syncMsg(t('Konto wird erstellt …'));
      const cred = await A.createUserWithEmailAndPassword(auth, email, pass);
      await A.sendEmailVerification(cred.user);
    }
    if (a === 'reset'){
      if (!email) throw {code:'auth/invalid-email'};
      await A.sendPasswordResetEmail(auth, email); syncMsg(t('Mail zum Zurücksetzen wurde gesendet.'));
    }
    if (a === 'resend'){ await A.sendEmailVerification(auth.currentUser); syncMsg(t('Mail wurde erneut gesendet.')); }
    if (a === 'verified'){
      await auth.currentUser.reload(); await auth.currentUser.getIdToken(true);
      if (!auth.currentUser.emailVerified) syncMsg(t('Noch nicht bestätigt – bitte den Link in der Mail öffnen.'), true);
      else { sync.user = auth.currentUser; startListening(); }
    }
    if (a === 'logout'){ stopListening(); await A.signOut(auth); }
  } catch(err){
    syncMsg(AUTH_ERR[err.code] || t('Fehler: {x}', {x: err.code || err.message}), true);
  } finally { b.disabled = false; }
});

/* ---------- Navigation & Rendern ---------- */
let view = 'home';
function showView(v, fromBack){
  // Zurück-Taste aus einem anderen Tab führt zur Startseite
  if (!fromBack && v !== 'home' && view === 'home') history.pushState({tab:v}, '');
  else if (!fromBack && v === 'home' && view !== 'home' && history.state && history.state.tab){ history.back(); return; }
  view = v;
  ['home','stats','photos','history','data'].forEach(x => $('#v-' + x).hidden = x !== v);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  window.scrollTo(0, 0); render();
}
$('#tabs').onclick = ev => { const b = ev.target.closest('[data-view]'); if (b) showView(b.dataset.view); };
function renderHeader(){
  $('#title').textContent = curBaby().name || (babies().length > 1 ? t('Baby {n}', {n:babies().indexOf(curBaby()) + 1}) : t('Baby-Tracker'));
  const age = curBaby().birth ? ageText() : '';
  $('#subtitle').textContent = fmtDate(Date.now(), {weekday:'long', day:'numeric', month:'long'})
    + (age ? ' · ' + age : '');
}
function render(){
  renderHeader();
  if (view === 'home'){ renderCards(); renderCustomCards(); renderToday(); $('#homeNotes').innerHTML = homeAlertsHtml() + apptNoteHtml() + photoReminderHtml(); }
  if (view === 'stats') renderStats();
  if (view === 'photos') renderPhotos();
  if (view === 'history') renderHistory();
  if (view === 'data') renderData();
}
setInterval(() => { if (view === 'home' && !document.hidden) renderCards(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden){ state = load(); render(); } });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
// Start erst, wenn auch advice.js und photos.js geladen sind
document.addEventListener('DOMContentLoaded', () => {
  applyStaticI18n();
  const sel = $('#langSel');
  sel.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${v.name}</option>`).join('');
  sel.onchange = () => setLang(sel.value);
  render(); initSync();
});
