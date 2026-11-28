"use strict";
/* ---------- Schnellerfassung ohne Umweg durch die App ----------
   1. Links: …/?quick=<aktion>[&baby=<id>] – für iPhone-Kurzbefehle und Android-Schnellaktionen am App-Symbol
   2. Android-Mitteilung mit Knöpfen: Der Service Worker merkt sich getippte Aktionen in IndexedDB
      ("babytracker-quick"); die App übernimmt sie beim nächsten Öffnen bzw. sofort, wenn sie offen ist. */
const QUICK = {
  night:       {label:t('Nachtschlaf (einschlafen / aufwachen)'), icon:'🌙'},
  nap:         {label:t('Nickerchen (Start / Stopp)'), icon:'😴'},
  diaper_wet:  {label:t('Windel nass'), icon:'💧'},
  diaper_stool:{label:t('Windel Stuhl'), icon:'💩'},
  feed_left:   {label:t('Stillen links (Start / Stopp)'), icon:'🤱'},
  feed_right:  {label:t('Stillen rechts (Start / Stopp)'), icon:'🤱'},
  feed_auto:   {label:t('Stillen – empfohlene Seite (Start / Stopp)'), icon:'🤱'}
};
const NOTIF_ACTIONS = ['diaper_wet', 'diaper_stool', 'night'];

/* Ermittelt, was eine Schnellaktion zum Zeitpunkt ts bewirkt: {msg, apply} */
function quickChange(action, ts){
  ts = ts || Date.now();
  const mk = (type, extra) => Object.assign(newEvent(type, extra), {start: ts});
  const before = sorted().filter(e => e.start <= ts);
  if (action === 'night'){
    const l = before.filter(e => e.type === 'wake' || e.type === 'sleep').pop();
    const sleeping = l && l.type === 'sleep' && ts - l.start < 18 * 3600e3;
    const h = new Date(ts).getHours();
    const wokeToday = before.some(e => e.type === 'wake' && dayKey(e.start) === dayKey(ts));
    if (sleeping || (h >= 4 && h < 12 && !wokeToday)){
      const w = mk('wake');
      return {msg:'🌅 ' + t('Aufgewacht um {time}', {time:fmtTime(ts)}) + (sleeping ? ' · ' + t('Nacht {d}', {d:fmtDur(ts - l.start)}) : ''), apply: () => state.events.push(w), id:w.id};
    }
    const s = mk('sleep'), r = running('nap');
    return {msg:t('Eingeschlafen um {time} – gute Nacht 🌙', {time:fmtTime(ts)}), apply: () => { if (r && r.start < ts) r.end = ts; state.events.push(s); }, id:s.id};
  }
  if (action === 'nap'){
    const r = running('nap');
    if (r && r.start < ts) return {msg:'😴 ' + t('Nickerchen beendet · {d}', {d:fmtDur(ts - r.start)}), apply: () => { r.end = ts; }, id:r.id};
    const n = mk('nap', {end:null});
    return {msg:'😴 ' + t('Nickerchen gestartet um {time}', {time:fmtTime(ts)}), apply: () => state.events.push(n), id:n.id};
  }
  if (action === 'diaper_wet' || action === 'diaper_stool'){
    const d = mk('diaper', {kind: action === 'diaper_wet' ? 'wet' : 'stool'});
    return {msg:`${action === 'diaper_wet' ? '💧' : '💩'} ` + t('{x} um {time}', {x:QUICK[action].label, time:fmtTime(ts)}), apply: () => state.events.push(d), id:d.id};
  }
  if (action.startsWith('feed_')){
    const r = running('feed');
    let side = action === 'feed_left' ? 'left' : action === 'feed_right' ? 'right' : null;
    if (r && r.start < ts && (!side || r.side === side))      // gleiche Seite (oder „empfohlen“) läuft → beenden
      return {msg:'🤱 ' + t('Stillen beendet · {d}', {d:fmtDur(ts - r.start)}), apply: () => { r.end = ts; }, id:r.id};
    if (!side){ const last = lastBreastSide(); side = last ? (last.side === 'left' ? 'right' : 'left') : 'left'; }
    const f = mk('feed', {side, end:null});
    return {msg:'🤱 ' + t('{x} gestartet', {x:SIDES_FEED[side]}) + (r ? ' ' + t('(andere Seite beendet)') : ''),
      apply: () => { if (r && r.start < ts) r.end = ts; state.events.push(f); }, id:f.id};
  }
  return null;
}

/* Kurz warten, bis der Sync den aktuellen Stand vom Server hat (damit Umschalter wie Nachtschlaf richtig entscheiden) */
async function waitForSync(ms){
  const t0 = Date.now();
  while (Date.now() - t0 < ms){
    if (sync.stage === 'on' && sync.serverOk) return true;
    if (['unconfigured', 'signedout', 'unverified', 'loadfail'].includes(sync.stage)) return false;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

async function runQuickFromUrl(){
  const p = new URLSearchParams(location.search), action = p.get('quick');
  if (!action) return;
  history.replaceState(null, '', location.pathname);      // nicht erneut auslösen beim Neuladen
  if (!QUICK[action]) return toast(t('Unbekannte Schnellaktion'));
  const b = p.get('baby');
  await waitForSync(4000);
  if (b && babies().some(x => x.id === b)) state.current = b;
  const ch = quickChange(action);
  if (!ch) return;
  act(ch.apply, ch.msg, ch.id);
  // im Browser (z. B. iPhone-Kurzbefehl öffnet Safari) ohne Sync-Anmeldung landen Einträge nicht in der App
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone) setTimeout(() => {
    if (sync.stage !== 'on') toast('⚠️ ' + t('Nur in diesem Browser gespeichert – bitte hier einmal unter Daten → Geräte-Sync anmelden, damit die Einträge in der App ankommen.'));
  }, 1500);
}

/* ---------- Warteschlange aus der Android-Mitteilung ---------- */
function quickDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('babytracker-quick', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('q', {keyPath:'id'});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
let draining = false;
async function drainQuickQueue(){
  if (draining || !('indexedDB' in window)) return;
  draining = true;
  try {
    const db = await quickDb();
    const items = await new Promise((res, rej) => { const rq = db.transaction('q').objectStore('q').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); });
    if (!items.length) return;
    items.sort((a, b) => a.ts - b.ts);
    const prev = state.current, msgs = [];
    for (const it of items){
      if (it.baby && babies().some(x => x.id === it.baby)) state.current = it.baby;
      const ch = quickChange(it.action, it.ts);
      if (ch){ ch.apply(); msgs.push(ch.msg); }
      state.current = prev;
    }
    await new Promise((res, rej) => { const tx = db.transaction('q', 'readwrite'); items.forEach(i => tx.objectStore('q').delete(i.id)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    save(); render();
    toast(msgs.length === 1 ? msgs[0] + ' ' + t('(aus der Mitteilung)') : t('{n} aus der Mitteilung übernommen', {n:unit(msgs.length, 'entry')}));
  } catch(e){ console.warn('Schnellerfassung', e); }
  finally { draining = false; }
}
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.type === 'quick') drainQuickQueue(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(drainQuickQueue, 300); });

/* ---------- Android: Mitteilung mit Knöpfen ---------- */
const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'actions' in Notification.prototype
  && (Notification.maxActions || 0) > 0;
async function showQuickNotification(){
  const reg = await navigator.serviceWorker.ready;
  const n = Math.min(NOTIF_ACTIONS.length, Notification.maxActions || 2);
  await reg.showNotification(t('Baby-Tracker · Schnellerfassung'), {
    body: t('{name} – Knopf antippen zum Speichern', {name:curBaby().name || t('Baby')}),
    tag: 'quick', renotify: false, silent: true, requireInteraction: true,
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    actions: NOTIF_ACTIONS.slice(0, n).map(a => ({action:a, title:`${QUICK[a].icon} ${{diaper_wet:t('Nass'), diaper_stool:t('Stuhl'), night:t('Schlaf')}[a]}`})),
    data: {baby: state.current, name: curBaby().name || t('Baby'),
      saved: t('gespeichert'), labels: {diaper_wet:'💧 ' + t('Windel nass'), diaper_stool:'💩 ' + t('Windel Stuhl'), night:'🌙 ' + t('Nachtschlaf')}}
  });
}
async function enableQuickNotification(){
  if (!notifSupported()) return alert(t('Mitteilungen mit Knöpfen werden auf diesem Gerät nicht unterstützt (nur Android).'));
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return alert(t('Bitte erlaube Mitteilungen für die App (Android-Einstellungen → Apps → Baby-Tracker → Benachrichtigungen).'));
  await showQuickNotification();
  try { localStorage.setItem('babytracker.quicknotif', '1'); } catch(e){}
  toast(t('Mitteilung aktiv – du findest sie in der Benachrichtigungsleiste und auf dem Sperrbildschirm'));
  renderQuickBox();
}
async function disableQuickNotification(){
  try { localStorage.removeItem('babytracker.quicknotif'); } catch(e){}
  const reg = await navigator.serviceWorker.ready;
  (await reg.getNotifications({tag:'quick'})).forEach(n => n.close());
  renderQuickBox();
}
// beim Öffnen erneuern (z. B. nach Neustart oder Baby-Wechsel)
async function refreshQuickNotification(){
  try { if (localStorage.getItem('babytracker.quicknotif') && notifSupported() && Notification.permission === 'granted') await showQuickNotification(); } catch(e){}
}

/* ---------- Einstellungen im Daten-Tab ---------- */
function quickLink(a){
  const u = new URL(location.pathname, location.origin);
  u.searchParams.set('quick', a);
  if (babies().length > 1) u.searchParams.set('baby', state.current);
  return u.toString();
}
function renderQuickBox(){
  const box = $('#quickBox'); if (!box) return;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent), notifOn = (() => { try { return !!localStorage.getItem('babytracker.quicknotif'); } catch(e){ return false; } })();
  const android = `
    <div class="lbl">Android</div>
    <div class="hint">${t('<b>Lange auf das App-Symbol drücken</b> → Schnellaktionen (Nachtschlaf, Windel, Stillen …). Du kannst sie auch einzeln auf den Startbildschirm ziehen.')}</div>
    ${notifSupported() ? `<button class="btn wide ${notifOn ? '' : 'primary'}" data-q="${notifOn ? 'off' : 'on'}">${notifOn ? '🔕 ' + t('Mitteilung mit Knöpfen ausschalten') : '🔔 ' + t('Mitteilung mit Knöpfen einschalten')}</button>
      <div class="disc">${t('Zeigt eine Mitteilung mit den Knöpfen 💧 Nass, 💩 Stuhl und 🌙 Schlaf – auch auf dem Sperrbildschirm. Getippte Einträge übernimmt die App beim nächsten Öffnen.')}</div>` : ''}`;
  const ios = `
    <div class="lbl">${t('iPhone (Kurzbefehle)')}</div>
    <div class="hint">${t('1. App <b>„Kurzbefehle“</b> öffnen → <b>＋</b> → Aktion <b>„URL öffnen“</b> → einen Link unten einfügen → Kurzbefehl benennen.')}<br>
      ${t('2. Auslösen über den <b>Sperrbildschirm</b> (lange drücken → Anpassen → unten einen Knopf durch „Kurzbefehl“ ersetzen, ab iOS 18), das <b>Kontrollzentrum</b>, ein <b>Widget</b> oder <b>zweimal hinten aufs iPhone tippen</b> (Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen).')}<br>
      ${t('3. Der Link öffnet sich in Safari: Dort <b>einmal unter Daten → Geräte-Sync anmelden</b>, sonst landen die Einträge nicht in der App.')}</div>`;
  box.innerHTML = (isIos ? ios + android : android + ios) + `
    <div class="lbl">${t('Links für Kurzbefehle')}${babies().length > 1 ? ` (${t('für {x}', {x:esc(curBaby().name || t('dieses Baby'))})})` : ''}</div>
    ${Object.entries(QUICK).map(([a, q]) => `<div class="prow" style="cursor:default"><span class="pi">${q.icon}</span>
      <span class="pn">${q.label}<small style="word-break:break-all">${esc(quickLink(a))}</small></span>
      <button class="chip" data-copy="${a}">${t('Kopieren')}</button></div>`).join('')}`;
}
document.addEventListener('click', async ev => {
  const q = ev.target.closest('[data-q]'); if (q){ return q.dataset.q === 'on' ? enableQuickNotification() : disableQuickNotification(); }
  const c = ev.target.closest('[data-copy]');
  if (c){
    try { await navigator.clipboard.writeText(quickLink(c.dataset.copy)); c.textContent = '✓ ' + t('Kopiert'); setTimeout(() => { c.textContent = t('Kopieren'); }, 1500); }
    catch(e){ prompt(t('Link kopieren:'), quickLink(c.dataset.copy)); }
  }
});

// Start: Link-Aktion ausführen, Warteschlange übernehmen, Mitteilung erneuern
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { runQuickFromUrl(); drainQuickQueue(); refreshQuickNotification(); }, 50);
});
