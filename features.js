"use strict";
/* ---------- Nachtmodus, Profile, Notizen, Gewicht, eigene Kategorien, Termine ---------- */
const SPECIAL_TYPES = ['weight', 'note', 'appt', 'custom'];
const numIn = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : null; };
const deNum = x => x == null || x === '' ? '' : fmtNum(x, 2);
// Zeit aus dem Eingabefeld lesen; unverändert = Original (behält Sekunden)
const readAt = (id, orig) => { const v = $(id)?.value; return !v ? orig : v === toLocalInput(orig) ? orig : fromLocalInput(v); };
function upsertEvent(e, fresh, msg){
  Object.keys(e).forEach(k => { if (e[k] === undefined || e[k] === '') delete e[k]; });
  act(() => { if (fresh) state.events.push(e); else state.events = state.events.map(x => x.id === e.id ? e : x); }, msg, fresh ? e.id : null);
}
function deleteEvent(id, what){
  if (!confirm(t('{x} löschen?', {x: what || t('Eintrag')}))) return false;
  act(() => { state.events = state.events.filter(x => x.id !== id); }, t('{x} gelöscht', {x: what || t('Eintrag')}));
  return true;
}
function openSpecialEdit(e, isNew){
  const ex = isNew ? Object.assign({id:uid(), baby:state.current}, e) : e;
  if (e.type === 'weight') return openWeight(ex, isNew);
  if (e.type === 'note') return openNote(ex, isNew);
  if (e.type === 'appt') return openApptEdit(ex, isNew);
  if (e.type === 'custom') return openCustomLog(e.cat, ex, isNew);
}

/* ===== Nachtmodus ===== */
const THEME_KEY = 'babytracker.theme';
const getTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch(e){ return 'auto'; } };
const darkMq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const effectiveDark = () => getTheme() === 'dark' || (getTheme() === 'auto' && !!darkMq && darkMq.matches);
function applyTheme(){
  const th = getTheme();
  if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  $('#themeColor').content = effectiveDark() ? '#100e0b' : '#f7f4ef';
  $('#themeBtn').textContent = effectiveDark() ? '☀️' : '🌙';
  $('#themeBtn').setAttribute('aria-label', effectiveDark() ? t('Helles Design') : t('Nachtmodus'));
}
function setTheme(th){ try { localStorage.setItem(THEME_KEY, th); } catch(e){} applyTheme(); renderSettings(); }
$('#themeBtn').onclick = () => setTheme(effectiveDark() ? 'light' : 'dark');
if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', applyTheme);
applyTheme();

/* ===== Einstellungen im Daten-Tab ===== */
function renderSettings(){
  const th = getTheme();
  $('#themeSeg').innerHTML = [['auto', t('Automatisch')], ['light', '☀️ ' + t('Hell')], ['dark', '🌙 ' + t('Dunkel')]]
    .map(([k, l]) => `<button class="${th === k ? 'on' : ''}" data-theme-set="${k}">${l}</button>`).join('');
  $('#catList').innerHTML = cats().length ? cats().map(c => `<button class="prow" data-cat-edit="${c.id}"><span class="pi">${esc(c.icon || '⭐')}</span>
    <span class="pn">${esc(c.name)}<small>${[c.options, c.unit ? t('Einheit: {u}', {u:c.unit}) : ''].filter(Boolean).map(esc).join(' · ') || t('nur Zeitpunkt')}</small></span>✏️</button>`).join('')
    : `<div class="muted">${t('Noch keine eigenen Kategorien.')}</div>`;
}
$('#themeSeg').onclick = ev => { const b = ev.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet); };
$('#catList').onclick = ev => { const b = ev.target.closest('[data-cat-edit]'); if (b) openCatEdit(b.dataset.catEdit); };
$('#addCat').onclick = () => openCatEdit(null);
$('#manageProfiles').onclick = () => openProfiles();

/* ===== Mehrere Babys ===== */
function ageTextFor(b){ const cur = state.current; state.current = b.id; const r = b.birth ? ageText() : ''; state.current = cur; return r; }
const babyEmoji = b => b.sex === 'f' ? '👧' : b.sex === 'm' ? '👦' : '👶';
function switchBaby(id){
  state.current = id; localStorage.setItem(KEY, JSON.stringify(state));
  hideToast(); closeSheet(); render();
  toast(t('{who} ausgewählt', {who:`${babyEmoji(curBaby())} ${curBaby().name || t('Baby')}`}));
  refreshQuickNotification();   // Mitteilung mit Knöpfen gilt für das gewählte Baby
}
function openProfiles(){
  openSheet(`<h3>${t('Babys')}</h3>
    ${babies().map(b => `<button class="prow ${b.id === state.current ? 'on' : ''}" data-b="${b.id}"><span class="pi">${babyEmoji(b)}</span>
      <span class="pn">${esc(b.name || t('Ohne Namen'))}<small>${b.birth ? esc(ageTextFor(b)) : t('Geburtsdatum fehlt')}</small></span>${b.id === state.current ? '✓' : ''}</button>`).join('')}
    <button class="btn wide primary" data-a="new">＋ ${t('Weiteres Baby anlegen')}</button>
    <button class="btn wide" data-a="edit">${t('{x} bearbeiten', {x:esc(curBaby().name || t('Aktuelles Baby'))})}</button>
    ${babies().length > 1 ? `<button class="btn wide danger" data-a="del">${t('{x} löschen', {x:esc(curBaby().name || t('Aktuelles Baby'))})}</button>` : ''}
    <button class="btn ghost wide" data-a="close">${t('Schließen')}</button>`);
  $('#sheet').onclick = ev => {
    const b = ev.target.closest('[data-b]'); if (b) return switchBaby(b.dataset.b);
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'edit'){ closeSheet(); return showView('data'); }
    if (a === 'new') return openNewBaby();
    if (a === 'del') return deleteBaby();
  };
}
function openNewBaby(){
  openSheet(`<h3>${t('Weiteres Baby')}</h3>
    <div class="field"><label for="nbName">${t('Name')}</label><input id="nbName" autocomplete="off"></div>
    <div class="field"><label for="nbBirth">${t('Geburtsdatum')}</label><input id="nbBirth" type="date" max="${todayKey()}"></div>
    <div class="field"><label for="nbSex">${t('Geschlecht')}</label><select id="nbSex"><option value="">${t('– nicht angegeben –')}</option><option value="f">${t('Mädchen')}</option><option value="m">${t('Junge')}</option></select></div>
    <button class="btn primary wide" data-a="save">${t('Anlegen')}</button>
    <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    const name = $('#nbName').value.trim();
    if (!name) return alert(t('Bitte einen Namen eingeben.'));
    const b = normMeta({id:uid(), kind:'baby', name, birth:$('#nbBirth').value, sex:$('#nbSex').value});
    state.meta.push(b); save(); switchBaby(b.id);
  };
}
async function deleteBaby(){
  const b = curBaby(), n = state.events.filter(mine).length, p = (state.photos || []).filter(mine);
  if (!confirm(t('„{name}“ mit {n} und {p} endgültig löschen?', {name:b.name || t('Dieses Baby'), n:unit(n, 'entry'), p:unit(p.length, 'photo')}) + (sync.ready ? ' ' + t('Das gilt für alle verbundenen Geräte.') : ''))) return;
  if (!confirm(t('Ganz sicher? Das kann nicht rückgängig gemacht werden.'))) return;
  state.events = state.events.filter(e => !mine(e));
  state.photos = (state.photos || []).filter(x => !mine(x));
  state.meta = state.meta.filter(m => m !== b);
  state = migrate(state); save(); closeSheet(); render();
  for (const x of p) await photoDelRec(x.id).catch(() => {});
  toast(t('Profil gelöscht'));
}
$('#titleBtn').onclick = openProfiles;

/* ===== Notizen ===== */
function openNote(ex, isNew){
  const fresh = !ex || isNew, e = ex ? Object.assign({}, ex) : newEvent('note');
  openSheet(`<h3>📝 ${t('Notiz')}</h3>
    <textarea id="nText" placeholder="${t('z. B. erstes Lächeln, Arztgespräch, Fragen für die Hebamme …')}">${esc(e.note || '')}</textarea>
    <div class="field"><label for="nAt">${t('Zeitpunkt')}</label><input type="datetime-local" id="nAt" value="${toLocalInput(e.start)}"></div>
    <button class="btn primary wide" data-a="save">${t('Speichern')}</button>
    ${fresh ? '' : `<button class="btn wide danger" data-a="del">${t('Löschen')}</button>`}
    <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
  if (fresh) setTimeout(() => $('#nText')?.focus(), 250);
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'del'){ if (deleteEvent(e.id, t('Notiz'))) closeSheet(); return; }
    const text = $('#nText').value.trim();
    if (!text) return alert(t('Bitte einen Text eingeben.'));
    e.note = text; e.start = readAt('#nAt', e.start);
    closeSheet(); upsertEvent(e, fresh, t('Notiz gespeichert'));
  };
}

/* ===== Gewicht ===== */
function openWeight(ex, isNew){
  const fresh = !ex || isNew, e = ex ? Object.assign({}, ex) : newEvent('weight');
  const last = weights().filter(w => w.id !== e.id).pop();
  openSheet(`<h3>⚖️ ${t('Gewicht')}</h3>
    ${last && fresh ? `<div class="hint">${t('Zuletzt: {x}', {x:`${kgTxt(last.g / 1000)} (${dateDE(last.start)})`})}</div>` : ''}
    <div class="field"><label for="wKg">${t('Gewicht in kg')}</label><input id="wKg" inputmode="decimal" placeholder="${t('z. B. 5,42')}" value="${e.g ? deNum(e.g / 1000) : ''}"></div>
    <div class="btnrow">
      <div class="field"><label for="wLen">${t('Länge (cm)')}</label><input id="wLen" inputmode="decimal" placeholder="${t('optional')}" value="${deNum(e.len)}"></div>
      <div class="field"><label for="wHead">${t('Kopfumfang (cm)')}</label><input id="wHead" inputmode="decimal" placeholder="${t('optional')}" value="${deNum(e.head)}"></div>
    </div>
    <div class="field"><label for="wAt">${t('Gemessen am')}</label><input type="datetime-local" id="wAt" value="${toLocalInput(e.start)}"></div>
    <div class="field"><label for="wNote">${t('Notiz')}</label><input id="wNote" value="${esc(e.note || '')}" placeholder="${t('z. B. U4, Hebamme, Waage zu Hause')}"></div>
    <button class="btn primary wide" data-a="save">${t('Speichern')}</button>
    ${fresh ? '' : `<button class="btn wide danger" data-a="del">${t('Löschen')}</button>`}
    <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'del'){ if (deleteEvent(e.id, t('Messung'))) closeSheet(); return; }
    let v = numIn($('#wKg').value);
    if (v == null) return alert(t('Bitte ein Gewicht eingeben, z. B. 5,42'));
    const g = Math.round(v > 100 ? v : v * 1000);          // > 100 = in Gramm eingegeben
    if (g < 300 || g > 40000) return alert(t('Das Gewicht wirkt unplausibel – bitte in kg (z. B. 5,42) oder Gramm (z. B. 5420) eingeben.'));
    e.g = g; e.len = numIn($('#wLen').value) ?? undefined; e.head = numIn($('#wHead').value) ?? undefined;
    e.note = $('#wNote').value.trim() || undefined; e.start = readAt('#wAt', e.start);
    closeSheet(); upsertEvent(e, fresh, t('Gewicht gespeichert · {x}', {x:kgTxt(g / 1000)}));
  };
}

/* ===== Eigene Kategorien ===== */
const CAT_EMOJIS = ['💊','🌡️','🛁','🧴','🦷','💉','🩺','🤧','👃','🚶','🎵','📖','🧸','🌳','🚗','🥛','🍌','💧','🙂','⭐'];
const CAT_PRESETS = [
  {name:t('Medikamente'), icon:'💊', options:t('Vitamin D, Fluorid, Fiebersaft, Nasentropfen')},
  {name:t('Fieber messen'), icon:'🌡️', unit:'°C'},
  {name:t('Baden'), icon:'🛁'},
  {name:t('Zähnchen'), icon:'🦷', options:t('Zahn durchgebrochen, Zähne geputzt')},
  {name:t('Bauchlage'), icon:'🧸', unit:'min'}
];
function renderCustomCards(){
  const ev = sorted(), tk = todayKey();
  $('#customCards').innerHTML = cats().map(c => {
    const list = ev.filter(e => e.type === 'custom' && e.cat === c.id), last = list[list.length - 1];
    const today = list.filter(e => dayKey(e.start) === tk).length;
    return `<div class="card" data-cat="${c.id}"><button class="statbtn" data-cstat="${c.id}" aria-label="Statistik">📊</button>
      <div class="ic">${esc(c.icon || '⭐')}</div><div class="lb">${esc(c.name)}</div>
      <div class="st">${last ? t('Heute {n}×', {n:today}) + ` · ${ago(last.start)}${last.opt ? ' · ' + esc(last.opt) : ''}` : t('Noch kein Eintrag')}</div></div>`;
  }).join('') + `<div class="card" data-cat="__new" style="min-height:0"><div class="ic" style="font-size:26px">＋</div>
      <div class="lb" style="font-size:16px">${t('Eigene Kategorie')}</div><div class="st">${t('z. B. Medikamente, Fieber, Baden')}</div></div>`;
}
$('#customCards').addEventListener('click', ev => {
  const s = ev.target.closest('[data-cstat]'); if (s){ statType = 'c:' + s.dataset.cstat; statRange = 30; return showView('stats'); }
  const c = ev.target.closest('[data-cat]'); if (!c) return;
  if (c.dataset.cat === '__new') return openCatEdit(null);
  openCustomLog(c.dataset.cat);
});
function openCustomLog(catId, ex, isNew){
  const c = cats().find(x => x.id === catId);
  if (!c){   // Kategorie wurde gelöscht – Eintrag kann nur noch entfernt werden
    if (ex && !isNew && confirm(t('Die Kategorie dieses Eintrags wurde gelöscht. Eintrag entfernen?')))
      act(() => { state.events = state.events.filter(x => x.id !== ex.id); }, t('Eintrag gelöscht'));
    return;
  }
  const fresh = !ex || isNew;
  const e = ex ? Object.assign({}, ex, {type:'custom', cat:catId}) : newEvent('custom', {cat:catId});
  const opts = (c.options || '').split(',').map(s => s.trim()).filter(Boolean);
  let opt = e.opt || (fresh && opts.length === 1 ? opts[0] : null);
  const last = sorted().filter(x => x.type === 'custom' && x.cat === catId && x.id !== e.id).pop();
  const draw = () => {
    const val = $('#cVal')?.value ?? deNum(e.val), note = $('#cNote')?.value ?? (e.note || ''), at = $('#cAt')?.value || toLocalInput(e.start);
    openSheet(`<h3>${esc(c.icon || '⭐')} ${esc(c.name)}</h3>
      ${last && fresh ? `<div class="hint">${t('Zuletzt: {x}', {x:esc([last.opt, last.val != null ? deNum(last.val) + (c.unit ? ' ' + c.unit : '') : ''].filter(Boolean).join(' · ') || t('Eintrag'))})} – ${ago(last.start)} (${fmtTime(last.start)})</div>` : ''}
      ${opts.length ? `<div class="lbl">${t('Auswahl')}</div><div class="chips">${opts.map((o, i) => `<button class="chip ${opt === o ? 'on' : ''}" data-opt="${i}">${esc(o)}</button>`).join('')}</div>` : ''}
      ${c.unit ? `<div class="field"><label for="cVal">${t('Wert ({u})', {u:esc(c.unit)})}</label><input id="cVal" inputmode="decimal" value="${esc(val)}"></div>` : ''}
      <div class="field"><label for="cNote">${t('Notiz')}</label><input id="cNote" value="${esc(note)}" placeholder="${t('optional, z. B. Dosis')}"></div>
      <div class="field"><label for="cAt">${t('Zeitpunkt')}</label><input type="datetime-local" id="cAt" value="${at}"></div>
      <button class="btn primary wide" data-a="save">${t('Speichern')}</button>
      ${fresh ? '' : `<button class="btn wide danger" data-a="del">${t('Löschen')}</button>`}
      <button class="btn ghost wide" data-a="cat">${t('Kategorie bearbeiten')}</button>
      <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
  };
  draw();
  $('#sheet').onclick = ev => {
    const o = ev.target.closest('[data-opt]'); if (o){ const v = opts[+o.dataset.opt]; opt = opt === v ? null : v; return draw(); }
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'cat') return openCatEdit(catId);
    if (a === 'del'){ if (deleteEvent(e.id)) closeSheet(); return; }
    e.opt = opt || undefined;
    e.val = c.unit ? (numIn($('#cVal').value) ?? undefined) : undefined;
    e.note = $('#cNote').value.trim() || undefined;
    e.start = readAt('#cAt', e.start);
    closeSheet(); upsertEvent(e, fresh, t('{x} gespeichert', {x:`${c.icon || '⭐'} ${c.name}`}));
  };
}
function openCatEdit(catId){
  const c = catId ? cats().find(x => x.id === catId) : null;
  let d = c ? Object.assign({}, c) : {id:uid(), kind:'cat', name:'', icon:'💊'};
  const draw = () => {
    openSheet(`<h3>${c ? t('Kategorie bearbeiten') : t('Eigene Kategorie')}</h3>
      ${c ? '' : `<div class="lbl">${t('Vorlagen')}</div><div class="chips">${CAT_PRESETS.map((p, i) => `<button class="chip" data-preset="${i}">${p.icon} ${p.name}</button>`).join('')}</div>`}
      <div class="field"><label for="kName">${t('Name')}</label><input id="kName" value="${esc(d.name)}" placeholder="${t('z. B. Medikamente')}"></div>
      <div class="lbl">${t('Symbol')}</div>
      <div class="emojis">${CAT_EMOJIS.map(x => `<button class="${d.icon === x ? 'on' : ''}" data-emoji="${x}">${x}</button>`).join('')}</div>
      <div class="field"><label for="kOpts">${t('Auswahlmöglichkeiten (mit Komma getrennt, optional)')}</label><input id="kOpts" value="${esc(d.options || '')}" placeholder="${t('z. B. Vitamin D, Fluorid')}"></div>
      <div class="field"><label for="kUnit">${t('Einheit für einen Messwert (optional)')}</label><input id="kUnit" value="${esc(d.unit || '')}" placeholder="${t('z. B. °C, ml, Tropfen, min')}"></div>
      <button class="btn primary wide" data-a="save">${t('Speichern')}</button>
      ${c ? `<button class="btn wide danger" data-a="del">${t('Kategorie löschen')}</button>` : ''}
      <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
  };
  const grab = () => { d.name = $('#kName').value.trim(); d.options = $('#kOpts').value.trim(); d.unit = $('#kUnit').value.trim(); };
  draw();
  $('#sheet').onclick = ev => {
    const p = ev.target.closest('[data-preset]'); if (p){ d = Object.assign({id:d.id, kind:'cat'}, CAT_PRESETS[+p.dataset.preset]); return draw(); }
    const em = ev.target.closest('[data-emoji]'); if (em){ grab(); d.icon = em.dataset.emoji; return draw(); }
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'del'){
      const n = state.events.filter(e => e.type === 'custom' && e.cat === c.id).length;
      if (!confirm(t('Kategorie „{name}“ löschen?', {name:c.name}) + (n ? ' ' + t('Die Einträge ({n}) bleiben im Verlauf erhalten.', {n}) : ''))) return;
      state.meta = state.meta.filter(m => m.id !== c.id); save(); closeSheet(); render(); return toast(t('Kategorie gelöscht'));
    }
    grab();
    if (!d.name) return alert(t('Bitte einen Namen eingeben.'));
    const m = normMeta(d);
    state.meta = c ? state.meta.map(x => x.id === c.id ? m : x) : state.meta.concat(m);
    save(); closeSheet(); render(); renderSettings();
    toast(c ? t('Kategorie gespeichert') : t('{x} angelegt – zu finden auf der Startseite', {x:`${m.icon || '⭐'} ${m.name}`}));
  };
}
function customStatsHtml(catId, range){
  const c = cats().find(x => x.id === catId); if (!c) return '';
  const all = sorted().filter(e => e.type === 'custom' && e.cat === catId);
  if (!all.length) return `<div class="panel"><div class="empty">${t('Noch keine Einträge für {x}.', {x:esc(c.name)})}</div></div>`;
  const days = lastDays(range), inR = new Set(days), list = all.filter(e => inR.has(dayKey(e.start)));
  const first = dayKey(all[0].start), nd = Math.max(1, days.filter(d => d >= first).length);
  const vals = list.map(e => e.val).filter(v => typeof v === 'number');
  const counts = {}; list.forEach(e => { if (e.opt) counts[e.opt] = (counts[e.opt] || 0) + 1; });
  const labels = {}; Object.keys(counts).forEach(k => { labels[k] = esc(k); });
  const last = all[all.length - 1], u = c.unit ? ' ' + esc(c.unit) : '';
  return `<div class="tiles">${tile(list.length, t('Einträge ({x})', {x:unit(range, 'day')}))}${tile(fmt1(list.length / nd), t('Ø pro Tag'))}
      ${tile(fmtTime(last.start), t('Zuletzt') + ' · ' + dayLabel(dayKey(last.start)))}
      ${vals.length ? tile(deNum(Math.round(mean(vals) * 10) / 10) + u, t('Ø Wert ({a}–{b})', {a:deNum(Math.min(...vals)), b:deNum(Math.max(...vals))})) : tile(fmtDur(Date.now() - last.start), t('seit dem letzten Mal'))}</div>
    ${bars(days, days.map(d => list.filter(e => dayKey(e.start) === d).length), x => x, t('Einträge pro Tag'))}
    ${dist(t('Auswahl'), counts, labels)}
    <div class="panel"><h4>${t('Letzte Einträge')}</h4><div class="list" style="box-shadow:none">${all.slice(-15).reverse().map(rowHtml).join('')}</div></div>`;
}

/* ===== Termine ===== */
const U_EXAMS = [   // Kinder-Untersuchungen nach Kinder-Richtlinie (G-BA): Zeitfenster ab Geburt
  {n:'U2', from:{d:2}, to:{d:9}, txt:t('{a}.–{b}. Lebenstag', {a:3, b:10})},
  {n:'U3', from:{d:21}, to:{d:34}, txt:t('{a}.–{b}. Lebenswoche', {a:4, b:5})},
  {n:'U4', from:{m:2}, to:{m:4}, txt:t('{a}.–{b}. Lebensmonat', {a:3, b:4})},
  {n:'U5', from:{m:5}, to:{m:7}, txt:t('{a}.–{b}. Lebensmonat', {a:6, b:7})},
  {n:'U6', from:{m:9}, to:{m:12}, txt:t('{a}.–{b}. Lebensmonat', {a:10, b:12})},
  {n:'U7', from:{m:20}, to:{m:24}, txt:t('{a}.–{b}. Lebensmonat', {a:21, b:24})},
  {n:'U7a', from:{m:33}, to:{m:36}, txt:t('{a}.–{b}. Lebensmonat', {a:34, b:36})},
  {n:'U8', from:{m:45}, to:{m:48}, txt:t('{a}.–{b}. Lebensmonat', {a:46, b:48})},
  {n:'U9', from:{m:59}, to:{m:64}, txt:t('{a}.–{b}. Lebensmonat', {a:60, b:64})}
];
function birthPlus(o, endOfRange){
  const d = keyToDate(curBaby().birth);
  if (o.d != null) d.setDate(d.getDate() + o.d);
  if (o.m != null){ d.setMonth(d.getMonth() + o.m); if (endOfRange) d.setDate(d.getDate() - 1); }
  return dayKey(d.getTime());
}
function uExamsHtml(){
  if (!curBaby().birth) return `<div class="hint" style="margin-top:14px">${t('Mit Geburtsdatum (unter Daten) zeigt die App hier die Zeiträume der U-Untersuchungen.')}</div>`;
  const tk = todayKey(), soon = shiftDay(tk, 21);
  const rows = U_EXAMS.map(u => {
    const a = birthPlus(u.from), b = birthPlus(u.to, true);
    const booked = sorted().some(e => e.type === 'appt' && (e.title || '').startsWith(u.n + ' '));
    const cls = b < tk ? 'past' : a <= soon ? 'due' : '';
    if (b < shiftDay(tk, -60)) return '';
    return `<tr class="${cls}" data-u="${u.n}" data-ufrom="${a}"><td><b>${u.n}</b></td><td>${dateDE(keyToDate(a).getTime())} – ${dateDE(keyToDate(b).getTime())}<br><small class="muted">${u.txt}</small></td>
      <td style="text-align:end">${booked ? '✓' : b < tk ? '' : `<button class="chip" style="padding:5px 10px;font-size:13px">＋ ${t('Termin')}</button>`}</td></tr>`;
  }).join('');
  return `<div class="lbl">${t('Vorsorge (U-Untersuchungen)')}</div><table class="utbl">${rows}</table>
    <div class="disc">${t('Zeiträume nach der Kinder-Richtlinie. Termine am besten frühzeitig vereinbaren; Impfungen beim Kinderarzt besprechen.')}</div>`;
}
function apptRow(e){
  const d = new Date(e.start);
  return `<button class="appt" data-appt="${e.id}"><div class="ad">${d.getDate()}.${d.getMonth() + 1}.<small>${WD[d.getDay()]}</small></div>
    <div class="at">${esc(e.title || t('Termin'))}<small>${t('{time} Uhr', {time:fmtTime(e.start)})}${e.place ? ' · ' + esc(e.place) : ''}</small></div></button>`;
}
function openAppointments(){
  const now = Date.now(), list = sorted().filter(e => e.type === 'appt');
  const up = list.filter(e => e.start + (e.dur || 30) * 60000 >= now), past = list.filter(e => !up.includes(e)).slice(-5).reverse();
  openSheet(`<h3>📅 ${t('Termine')}${curBaby().name ? ' · ' + esc(curBaby().name) : ''}</h3>
    <button class="btn primary wide" data-a="new">＋ ${t('Neuer Termin')}</button>
    <div class="lbl">${t('Anstehend')}</div>${up.length ? up.map(apptRow).join('') : `<div class="muted">${t('Keine anstehenden Termine.')}</div>`}
    ${past.length ? `<div class="lbl">${t('Vergangen')}</div>${past.map(apptRow).join('')}` : ''}
    ${uExamsHtml()}
    <button class="btn ghost wide" data-a="close">${t('Schließen')}</button>`);
  $('#sheet').onclick = ev => {
    const r = ev.target.closest('[data-appt]'); if (r) return openApptEdit(state.events.find(e => e.id === r.dataset.appt));
    const u = ev.target.closest('[data-u]');
    if (u && ev.target.closest('button')){
      const from = u.dataset.ufrom, tomorrow = shiftDay(todayKey(), 1), d = from > tomorrow ? from : tomorrow;
      return openApptEdit({id:uid(), type:'appt', baby:state.current, title:`${u.dataset.u} – ${t('Vorsorge beim Kinderarzt')}`, start:keyToDate(d).getTime() + 9 * 3600e3, dur:45}, true);
    }
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') closeSheet();
    if (a === 'new'){ const d = keyToDate(shiftDay(todayKey(), 1)).getTime() + 9 * 3600e3; openApptEdit({id:uid(), type:'appt', baby:state.current, start:d, dur:30}, true); }
  };
}
function openApptEdit(ex, isNew){
  const fresh = !!isNew, e = Object.assign({}, ex);
  openSheet(`<h3>📅 ${fresh ? t('Neuer Termin') : t('Termin')}</h3>
    <div class="field"><label for="aTitle">${t('Was?')}</label><input id="aTitle" value="${esc(e.title || '')}" placeholder="${t('z. B. U4 – Kinderarzt, Hebamme, Impfung')}"></div>
    <div class="field"><label for="aAt">${t('Wann?')}</label><input type="datetime-local" id="aAt" value="${toLocalInput(e.start)}"></div>
    <div class="field"><label for="aDur">${t('Dauer')}</label><select id="aDur">${[15, 30, 45, 60, 90, 120].map(m => `<option value="${m}" ${(e.dur || 30) === m ? 'selected' : ''}>${fmtDur(m * 60000)}</option>`).join('')}</select></div>
    <div class="field"><label for="aPlace">${t('Wo?')}</label><input id="aPlace" value="${esc(e.place || '')}" placeholder="${t('z. B. Praxis Dr. Müller')}"></div>
    <div class="field"><label for="aNote">${t('Notiz')}</label><input id="aNote" value="${esc(e.note || '')}" placeholder="${t('z. B. Impfpass & U-Heft mitnehmen')}"></div>
    <button class="btn primary wide" data-a="save">${fresh ? t('Speichern & in Kalender eintragen') : t('Speichern')}</button>
    ${fresh ? '' : `<button class="btn wide" data-a="ics">📅 ${t('In Kalender eintragen (iPhone/Android)')}</button>
      <button class="btn wide" data-a="gcal">${t('Google Kalender öffnen')}</button>
      <button class="btn wide danger" data-a="del">${t('Löschen')}</button>`}
    <button class="btn ghost wide" data-a="close">${t('Abbrechen')}</button>`);
  const grab = () => { e.title = $('#aTitle').value.trim(); e.start = readAt('#aAt', e.start); e.dur = +$('#aDur').value;
    e.place = $('#aPlace').value.trim() || undefined; e.note = $('#aNote').value.trim() || undefined; };
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'del'){ if (deleteEvent(e.id, t('Termin'))) closeSheet(); return; }
    grab();
    if (a === 'ics') return downloadIcs(e);
    if (a === 'gcal') return openGoogleCal(e);
    if (!e.title) return alert(t('Bitte eintragen, worum es geht.'));
    upsertEvent(Object.assign({}, e, {type:'appt'}), fresh, t('Termin gespeichert'));
    if (fresh) openCalendarOffer(e); else closeSheet();
  };
}
function openCalendarOffer(e){
  openSheet(`<h3>✅ ${t('Termin gespeichert')}</h3>
    <div class="hint">${esc(e.title)} · ${dayLabel(dayKey(e.start))}, ${dateDE(e.start)} · ${t('{time} Uhr', {time:fmtTime(e.start)})}<br>
      ${t('Möchtest du ihn auch in deinen Kalender übernehmen (mit Erinnerung 1 Tag und 1 Stunde vorher)?')}</div>
    <button class="btn primary wide" data-a="ics">📅 ${t('In Kalender eintragen (iPhone/Android)')}</button>
    <button class="btn wide" data-a="gcal">${t('Google Kalender öffnen')}</button>
    <button class="btn ghost wide" data-a="close">${t('Nein, danke')}</button>`);
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'ics') downloadIcs(e);
    if (a === 'gcal') openGoogleCal(e);
    closeSheet();
  };
}
const icsDate = ts => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFor(e){
  const end = e.start + (e.dur || 30) * 60000, who = curBaby().name ? ` (${curBaby().name})` : '';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baby-Tracker//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.id}@baby-tracker`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEsc(e.title + who)}`, e.place ? `LOCATION:${icsEsc(e.place)}` : '', e.note ? `DESCRIPTION:${icsEsc(e.note)}` : '',
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}
function downloadIcs(e){
  // iPhone: Safari zeigt die Kalender-Datei an und bietet „Zum Kalender hinzufügen“; Android: Datei öffnen → Kalender-App
  const blob = new Blob([icsFor(e)], {type:'text/calendar;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${t('termin')}_${dayKey(e.start)}_${safeName(e.title).slice(0, 30) || 'baby'}.ics`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function openGoogleCal(e){
  const who = curBaby().name ? ` (${curBaby().name})` : '';
  const q = new URLSearchParams({action:'TEMPLATE', text:e.title + who, dates:`${icsDate(e.start)}/${icsDate(e.start + (e.dur || 30) * 60000)}`,
    details:e.note || '', location:e.place || ''});
  window.open('https://calendar.google.com/calendar/render?' + q.toString(), '_blank');
}
function apptNoteHtml(){
  const now = Date.now(), next = sorted().find(e => e.type === 'appt' && e.start >= now - 30 * 60000 && e.start <= now + 3 * 864e5);
  if (!next) return '';
  return `<button class="note" data-open-appts="1">📅 <span><b>${dayLabel(dayKey(next.start))}, ${t('{time} Uhr', {time:fmtTime(next.start)})}</b> · ${esc(next.title || t('Termin'))}${next.place ? ' · ' + esc(next.place) : ''}</span></button>`;
}
document.addEventListener('click', ev => { if (ev.target.closest('[data-open-appts]')) openAppointments(); });

/* ===== Status der zusätzlichen Startkarten (läuft jede Sekunde mit) ===== */
function renderExtraCardStatus(ev){
  const w = ev.filter(e => e.type === 'weight' && e.g).pop();
  $('#st-weight').textContent = w ? `${kgTxt(w.g / 1000)} · ${dayLabel(dayKey(w.start))}` : t('Noch kein Eintrag');
  const n = ev.filter(e => e.type === 'note').pop();
  $('#st-note').textContent = n ? `${ago(n.start)}: ${n.note || ''}` : t('Gedanken & Meilensteine');
  const a = ev.find(e => e.type === 'appt' && e.start >= Date.now() - 30 * 60000);
  $('#st-appt').textContent = a ? `${dayLabel(dayKey(a.start))} ${fmtTime(a.start)} · ${a.title || t('Termin')}` : t('Keine anstehenden');
}

/* Klicks in der Statistik (Messungen, Einträge) */
$('#statBody').addEventListener('click', ev => {
  if (ev.target.closest('[data-weight-add]')) return openWeight();
  const r = ev.target.closest('.row[data-id]'); if (r) openEdit(r.dataset.id);
});
