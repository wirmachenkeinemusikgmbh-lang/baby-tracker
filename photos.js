"use strict";
/* ---------- Tagesfotos & Zeitraffer ----------
   Pro Tag ein quadratisches Foto (ID = Datum). Bilder liegen lokal in IndexedDB;
   beim Sync: kleines Index-Dokument in "photos", Bilddaten in "photoData" (nur bei Bedarf geladen). */
const PHOTO_SIZE = 960, THUMB_SIZE = 240, MAX_PHOTO_BYTES = 700 * 1024;

/* --- IndexedDB --- */
let photoDbP = null;
function photoDb(){
  return photoDbP || (photoDbP = new Promise((res, rej) => {
    const r = indexedDB.open('babytracker-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', {keyPath:'id'});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function pstore(mode, fn){
  const db = await photoDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', mode), req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(req ? req.result : undefined);
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
const photoRec = id => pstore('readonly', s => s.get(id));
const photoKeys = () => pstore('readonly', s => s.getAllKeys());
const photoPutRec = rec => pstore('readwrite', s => s.put(rec));
const photoDelRec = id => pstore('readwrite', s => s.delete(id));

/* --- Bild-Helfer --- */
const jpeg = buf => new Blob([buf], {type:'image/jpeg'});
function loadImg(blob){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}
const canvasBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
async function thumbFrom(source){
  const t = document.createElement('canvas'); t.width = t.height = THUMB_SIZE;
  const ctx = t.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return (await canvasBlob(t, 0.75)).arrayBuffer();
}
async function encodePhoto(draw){
  const c = document.createElement('canvas'); c.width = c.height = PHOTO_SIZE;
  draw(c.getContext('2d'), PHOTO_SIZE);
  let full;
  for (const q of [0.85, 0.75, 0.65, 0.5]){ full = await canvasBlob(c, q); if (full.size <= MAX_PHOTO_BYTES) break; }
  return {full: await full.arrayBuffer(), thumb: await thumbFrom(c)};
}

const photosSorted = () => (state.photos || []).slice().sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
const thumbUrls = new Map();
async function thumbUrl(p){
  const c = thumbUrls.get(p.id); if (c && c.v === p.v) return c.url;
  const rec = await photoRec(p.id); if (!rec || rec.v !== p.v) return null;
  if (c) URL.revokeObjectURL(c.url);
  const url = URL.createObjectURL(jpeg(rec.thumb)); thumbUrls.set(p.id, {v:p.v, url}); return url;
}
const dateLong = k => keyToDate(k).toLocaleDateString('de-DE', {day:'numeric', month:'long', year:'numeric'});
const photoAge = k => state.birth ? ageText(keyToDate(k).getTime() + 12*3600e3) : '';

async function savePhoto(day, enc){
  const v = uid();
  state.photos = (state.photos || []).filter(p => p.id !== day).concat({id:day, day, v});
  await photoPutRec({id:day, v, full:enc.full, thumb:enc.thumb});
  save(); render();
}
async function deletePhoto(day){
  state.photos = (state.photos || []).filter(p => p.id !== day);
  save(); render();
  await photoDelRec(day).catch(() => {});
}

/* --- Ansicht --- */
function photoReminderHtml(){
  if ((state.photos || []).some(p => p.id === todayKey())) return '';
  return `<button class="note" id="photoRemind">📷 <span><b>Heute noch kein Foto</b> – jetzt fürs Tagebuch aufnehmen</span></button>`;
}
document.addEventListener('click', ev => { if (ev.target.closest('#photoRemind')) { showView('photos'); } });

let photoRenderSeq = 0;
async function renderPhotos(){
  const list = photosSorted(), t = todayKey(), today = list.find(p => p.id === t);
  const first = list[0];
  $('#photoHead').innerHTML = `
    <div class="phtoday">
      ${today ? `<img id="phTodayImg" alt="Foto von heute">
        <div class="muted" style="margin-top:8px">✅ Foto von heute gespeichert${photoAge(t) ? ' · ' + esc(photoAge(t)) : ''}</div>
        <button class="btn wide" data-p="replace">Foto von heute ersetzen</button>`
      : `<button class="btn primary wide" data-p="today" style="margin-top:0">📷 Foto von heute aufnehmen</button>`}
      <button class="btn ghost wide" data-p="other">＋ Foto für einen anderen Tag</button>
    </div>
    <button class="btn wide ${list.length >= 2 ? 'primary' : ''}" data-p="timelapse">🎬 Zeitraffer erstellen</button>
    <div class="muted" style="margin-top:10px">${list.length ? `${list.length} Foto${list.length > 1 ? 's' : ''} seit ${dateLong(first.day)}` : 'Noch keine Fotos – am besten jeden Tag ungefähr gleich fotografieren (gleiche Stelle, gleiches Licht).'}</div>`;
  const seq = ++photoRenderSeq;
  $('#photoGrid').innerHTML = list.slice().reverse().map(p => `<button class="ph" data-pid="${p.id}"><img alt=""><span>${dayShort(p.day)}${keyToDate(p.day).getFullYear() !== new Date().getFullYear() ? keyToDate(p.day).getMonth()+1 + '.' + keyToDate(p.day).getFullYear() : ''}</span></button>`).join('');
  if (today){ const u = await thumbUrl(today); if (seq === photoRenderSeq && u && $('#phTodayImg')) $('#phTodayImg').src = u; }
  for (const p of list.slice().reverse()){
    if (seq !== photoRenderSeq) return;
    const u = await thumbUrl(p).catch(() => null);
    const img = document.querySelector(`.ph[data-pid="${p.id}"] img`);
    if (img && u) img.src = u;
  }
}
$('#photoHead').addEventListener('click', ev => {
  const a = ev.target.closest('[data-p]')?.dataset.p; if (!a) return;
  if (a === 'today' || a === 'replace') pickPhoto(todayKey());
  if (a === 'other') openPhotoDayPicker();
  if (a === 'timelapse') openTimelapse();
});
$('#photoGrid').addEventListener('click', ev => { const b = ev.target.closest('[data-pid]'); if (b) openPhotoDetail(b.dataset.pid); });

let pickDay = null;
function pickPhoto(day){ pickDay = day; const f = $('#photoFile'); f.value = ''; f.click(); }
$('#photoFile').onchange = async ev => {
  const file = ev.target.files[0]; if (!file) return;
  try { openCrop(await loadImg(file), pickDay); }
  catch(e){ alert('Das Foto konnte nicht geöffnet werden. Bitte ein anderes Bild (JPEG/PNG) wählen.'); }
};
function openPhotoDayPicker(){
  openSheet(`<h3>Foto für einen anderen Tag</h3>
    <div class="field"><label for="pDay">Tag</label><input type="date" id="pDay" value="${shiftDay(todayKey(), -1)}" max="${todayKey()}"></div>
    <button class="btn primary wide" data-c="pick">Foto auswählen</button>
    <button class="btn ghost wide" data-c="close">Abbrechen</button>`);
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-c]')?.dataset.c; if (!a) return;
    if (a === 'close') return closeSheet();
    const d = $('#pDay').value; if (!d) return;
    if ((state.photos || []).some(p => p.id === d) && !confirm(`Für ${dateLong(d)} gibt es schon ein Foto. Ersetzen?`)) return;
    closeSheet(); pickPhoto(d);
  };
}

async function openPhotoDetail(id){
  const p = (state.photos || []).find(x => x.id === id); if (!p) return;
  openSheet(`<h3>${dateLong(p.day)}</h3>
    <img class="bigimg" id="phBig" alt="">
    <div class="muted" style="margin-top:8px">${esc(photoAge(p.day))}</div>
    <button class="btn primary wide" data-c="share">Teilen / Sichern</button>
    <button class="btn wide" data-c="replace">Ersetzen</button>
    <button class="btn wide danger" data-c="del">Löschen</button>
    <button class="btn ghost wide" data-c="close">Schließen</button>`);
  const rec = await photoRec(id);
  let url = null;
  if (rec && rec.v === p.v){ url = URL.createObjectURL(jpeg(rec.full)); $('#phBig').src = url; }
  else $('#phBig').alt = 'Wird geladen …';
  $('#sheet').onclick = async ev => {
    const a = ev.target.closest('[data-c]')?.dataset.c; if (!a) return;
    if (a === 'share'){
      if (!rec) return alert('Das Foto wird noch geladen.');
      return shareFile(`baby_${p.day}.jpg`, jpeg(rec.full), 'image/jpeg');
    }
    if (url) URL.revokeObjectURL(url);
    if (a === 'close') return closeSheet();
    if (a === 'replace'){ closeSheet(); return pickPhoto(p.day); }
    if (a === 'del'){
      if (!confirm(`Foto vom ${dateLong(p.day)} löschen?` + (sync.ready ? ' Es wird auf allen Geräten gelöscht.' : ''))) return;
      closeSheet(); await deletePhoto(p.day); toast('Foto gelöscht');
    }
  };
}

/* --- Zuschneiden mit Ausrichthilfe (vorheriges Foto halbtransparent darüber) --- */
async function openCrop(img, day){
  const before = photosSorted().filter(p => p.day < day).pop() || photosSorted().find(p => p.day > day);
  let ghost = null;
  if (before){ const r = await photoRec(before.id).catch(() => null); if (r) ghost = await loadImg(jpeg(r.full)).catch(() => null); }
  let showGhost = !!ghost, zoom = 1;
  const iw = img.naturalWidth, ih = img.naturalHeight, baseSide = Math.min(iw, ih);
  let cx = iw / 2, cy = ih / 2;
  openSheet(`<h3>📷 ${day === todayKey() ? 'Foto von heute' : dateLong(day)}</h3>
    <canvas id="cropC"></canvas>
    <div class="muted" style="margin:8px 2px">Mit einem Finger verschieben, mit zwei Fingern oder dem Regler zoomen.${ghost ? ' Das blasse Bild ist das vorige Foto – richte dein Baby daran aus, dann wird der Zeitraffer ruhiger.' : ''}</div>
    <input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" style="padding:0;border:0;background:none">
    ${ghost ? '<button class="btn wide" data-c="ghost">Vorheriges Foto ausblenden</button>' : ''}
    <button class="btn primary wide" data-c="save">Speichern</button>
    <button class="btn ghost wide" data-c="close">Abbrechen</button>`);
  const c = $('#cropC'), S = Math.round(c.clientWidth * (window.devicePixelRatio || 1)); c.width = c.height = S;
  const clamp = () => { const side = baseSide / zoom; cx = Math.min(Math.max(cx, side/2), iw - side/2); cy = Math.min(Math.max(cy, side/2), ih - side/2); };
  const paint = (ctx, size, withGhost) => {
    const side = baseSide / zoom; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - side/2, cy - side/2, side, side, 0, 0, size, size);
    if (withGhost && ghost && showGhost){ ctx.globalAlpha = 0.35; ctx.drawImage(ghost, 0, 0, size, size); ctx.globalAlpha = 1; }
  };
  const draw = () => {
    clamp(); const ctx = c.getContext('2d'); paint(ctx, S, true);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = Math.max(1, S / 400);
    for (const k of [1, 2]){ ctx.beginPath(); ctx.moveTo(S*k/3, 0); ctx.lineTo(S*k/3, S); ctx.moveTo(0, S*k/3); ctx.lineTo(S, S*k/3); ctx.stroke(); }
  };
  const pts = new Map(); let pinch = null;
  c.onpointerdown = e => {
    c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2){ const [a, b] = [...pts.values()]; pinch = {d: Math.hypot(a[0]-b[0], a[1]-b[1]) || 1, z: zoom}; }
  };
  c.onpointermove = e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch){ const [a, b] = [...pts.values()]; zoom = Math.min(4, Math.max(1, pinch.z * Math.hypot(a[0]-b[0], a[1]-b[1]) / pinch.d)); $('#cropZoom').value = zoom; }
    else if (pts.size === 1){ const k = (baseSide / zoom) / c.clientWidth; cx -= (e.clientX - prev[0]) * k; cy -= (e.clientY - prev[1]) * k; }
    draw();
  };
  c.onpointerup = c.onpointercancel = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  $('#cropZoom').oninput = e => { zoom = +e.target.value; draw(); };
  draw();
  $('#sheet').onclick = async ev => {
    const b = ev.target.closest('[data-c]'), a = b?.dataset.c; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'ghost'){ showGhost = !showGhost; b.textContent = showGhost ? 'Vorheriges Foto ausblenden' : 'Vorheriges Foto einblenden'; return draw(); }
    if (a === 'save'){
      b.disabled = true; b.textContent = 'Speichern …';
      try { await savePhoto(day, await encodePhoto((ctx, size) => paint(ctx, size, false))); closeSheet(); toast('Foto gespeichert 📷'); }
      catch(e){ console.warn(e); b.disabled = false; b.textContent = 'Speichern'; alert('Speichern fehlgeschlagen – ist der Speicher voll?'); }
    }
  };
}

/* --- Zeitraffer-Video (Canvas + MediaRecorder, läuft komplett auf dem Gerät) --- */
function videoMime(){
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || null;
}
function openTimelapse(){
  const all = photosSorted();
  if (all.length < 2) return alert('Für einen Zeitraffer brauchst du mindestens 2 Fotos.');
  if (!videoMime()) return alert('Dieser Browser kann leider keine Videos erzeugen. Bitte iOS bzw. Chrome aktualisieren.');
  let from = all[0].day, to = all[all.length - 1].day, overlay = true, title = true;
  let fps = all.length > 150 ? 10 : all.length > 50 ? 6 : all.length > 15 ? 4 : 2;
  const pick = () => all.filter(p => p.day >= from && p.day <= to);
  const draw = () => {
    const n = pick().length, secs = n / fps + (title ? 1.5 : 0) + 1.5;
    openSheet(`<h3>🎬 Zeitraffer</h3>
      <div class="lbl">Zeitraum</div>
      <div class="btnrow"><input type="date" id="tlFrom" value="${from}" min="${all[0].day}" max="${all[all.length-1].day}">
        <input type="date" id="tlTo" value="${to}" min="${all[0].day}" max="${all[all.length-1].day}"></div>
      <div class="lbl">Geschwindigkeit</div>
      <div class="chips">${[2, 4, 6, 10, 15].map(k => `<button class="chip ${fps === k ? 'on' : ''}" data-fps="${k}">${k} Fotos/s</button>`).join('')}</div>
      <div class="lbl">Einblendungen</div>
      <div class="chips"><button class="chip ${overlay ? 'on' : ''}" data-t="overlay">Datum &amp; Alter</button>
        <button class="chip ${title ? 'on' : ''}" data-t="title">Titel am Anfang</button></div>
      <div class="hint" style="margin-top:14px">${n} Fotos → Video mit ca. ${Math.round(secs)} Sekunden. Das Erstellen dauert genauso lange – App so lange geöffnet lassen.</div>
      <button class="btn primary wide" data-c="go" ${n < 2 ? 'disabled' : ''}>Video erstellen</button>
      <button class="btn ghost wide" data-c="close">Abbrechen</button>`);
    $('#tlFrom').onchange = e => { from = e.target.value || all[0].day; draw(); };
    $('#tlTo').onchange = e => { to = e.target.value || all[all.length-1].day; draw(); };
  };
  draw();
  $('#sheet').onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.fps){ fps = +b.dataset.fps; return draw(); }
    if (b.dataset.t === 'overlay'){ overlay = !overlay; return draw(); }
    if (b.dataset.t === 'title'){ title = !title; return draw(); }
    if (b.dataset.c === 'close') return closeSheet();
    if (b.dataset.c === 'go') runTimelapse(pick(), {fps, overlay, title});
  };
}

async function runTimelapse(list, opts){
  let cancelled = false, lock = null;
  openSheet(`<h3>🎬 Video wird erstellt …</h3>
    <canvas id="tlC"></canvas>
    <progress id="tlP" max="1" value="0"></progress>
    <div class="muted" style="margin-top:6px">Bitte die App geöffnet und den Bildschirm an lassen.</div>
    <button class="btn ghost wide" data-c="cancel">Abbrechen</button>`);
  $('#sheet').onclick = ev => { if (ev.target.closest('[data-c=cancel]')){ cancelled = true; closeSheet(); } };
  try { lock = await navigator.wakeLock?.request('screen'); } catch(e){}
  try {
    const blob = await renderTimelapse($('#tlC'), list, opts, p => { const el = $('#tlP'); if (el) el.value = p; }, () => cancelled || $('#sheet').hidden);
    if (!blob) return;
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `zeitraffer${state.name ? '_' + state.name.replace(/[^\wäöüÄÖÜß-]+/g, '') : ''}_${list[0].day}_bis_${list[list.length-1].day}.${ext}`;
    const url = URL.createObjectURL(blob);
    openSheet(`<h3>🎬 Fertig!</h3>
      <video src="${url}" controls playsinline autoplay muted loop></video>
      <div class="muted" style="margin-top:6px">${list.length} Fotos · ${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB</div>
      <button class="btn primary wide" data-c="share">Teilen / Video sichern</button>
      <button class="btn ghost wide" data-c="close">Schließen</button>`);
    $('#sheet').onclick = ev => {
      const a = ev.target.closest('[data-c]')?.dataset.c; if (!a) return;
      if (a === 'share') return shareFile(name, blob, blob.type);
      URL.revokeObjectURL(url); closeSheet();
    };
  } catch(e){
    console.warn(e);
    if (!cancelled) openSheet(`<h3>Das hat nicht geklappt</h3><div class="hint">${esc(e.message || e)}</div><button class="btn wide" data-c="close">Schließen</button>`);
    $('#sheet').onclick = ev => { if (ev.target.closest('[data-c]')) closeSheet(); };
  } finally { try { lock && lock.release(); } catch(e){} }
}

async function renderTimelapse(c, list, {fps, overlay, title}, onProgress, isCancelled){
  const S = PHOTO_SIZE; c.width = c.height = S;
  const ctx = c.getContext('2d'), mime = videoMime();
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 6e6});
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  const frameMs = 1000 / fps, fade = Math.min(frameMs * 0.45, 300);
  const loadFrame = async p => { const r = await photoRec(p.id); return r ? loadImg(jpeg(r.full)) : null; };
  // nächster Bildschirm-Frame; Timer als Rückfall, falls requestAnimationFrame pausiert
  const nextFrame = () => new Promise(r => { let done = false; const go = () => { if (!done){ done = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 34); });
  const hold = async (ms, paint) => { const t0 = performance.now(); let t = 0; do { paint(t); await nextFrame(); t = performance.now() - t0; } while (t < ms && !isCancelled()); };
  const font = (w, px) => `${w} ${Math.round(px)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const drawOverlay = p => {
    const h = S * 0.16, g = ctx.createLinearGradient(0, S - h, 0, S);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, S - h, S, h);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    ctx.font = font(600, S * 0.042); ctx.textAlign = 'left'; ctx.fillText(keyToDate(p.day).toLocaleDateString('de-DE'), S * 0.05, S * 0.95);
    const age = photoAge(p.day); if (age){ ctx.textAlign = 'right'; ctx.fillText(age, S * 0.95, S * 0.95); }
  };
  const drawTitle = () => {
    ctx.fillStyle = '#2a2622'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#fff4e6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(700, S * 0.09); ctx.fillText(state.name || 'Unser Baby', S / 2, S * 0.44);
    ctx.font = font(500, S * 0.04); ctx.fillStyle = '#e7966f';
    ctx.fillText(`${keyToDate(list[0].day).toLocaleDateString('de-DE')} – ${keyToDate(list[list.length-1].day).toLocaleDateString('de-DE')}`, S / 2, S * 0.56);
  };
  rec.start(1000);
  if (title) await hold(1500, drawTitle);
  let prev = null, nextP = loadFrame(list[0]);
  for (let k = 0; k < list.length && !isCancelled(); k++){
    const img = await nextP.catch(() => null);
    nextP = k + 1 < list.length ? loadFrame(list[k + 1]) : null;
    if (!img) continue;
    const ms = k === list.length - 1 ? Math.max(frameMs, 1500) : frameMs;
    await hold(ms, t => {
      const a = prev ? Math.min(1, t / fade) : 1;
      if (a < 1) ctx.drawImage(prev, 0, 0, S, S);
      ctx.globalAlpha = a; ctx.drawImage(img, 0, 0, S, S); ctx.globalAlpha = 1;
      if (overlay) drawOverlay(list[k]);
    });
    prev = img; onProgress((k + 1) / list.length);
  }
  rec.stop(); await stopped;
  stream.getTracks().forEach(t => t.stop());
  if (isCancelled()) return null;
  return new Blob(chunks, {type: mime.split(';')[0]});
}

/* --- Foto-Sync (nutzt die Firebase-Verbindung aus index.html) ---
   Fehler hier stoppen nur den Foto-Sync, nicht den Sync der Einträge. */
function photoSyncError(err){
  console.warn('Foto-Sync', err);
  sync.photoErr = err && err.code === 'permission-denied'
    ? 'Einträge werden synchronisiert, Fotos noch nicht: Die Firestore-Regeln müssen für Fotos erweitert werden.'
    : 'Foto-Sync-Fehler: ' + ((err && (err.code || err.message)) || err);
  setSyncStatus();
}
function photoPending(){
  const b = (base && base.photos) || {};
  const ups = (state.photos || []).filter(p => b[p.id] !== p.v);
  const ids = new Set((state.photos || []).map(p => p.id));
  return {ups, dels: Object.keys(b).filter(id => !ids.has(id))};
}
const photoSent = {};
async function photoFlush(){
  if (!sync.ready) return;
  const {db, f} = sync.fb, {ups, dels} = photoPending();
  for (const p of ups){
    if (photoSent[p.id] === p.v) continue;
    const rec = await photoRec(p.id).catch(() => null);
    if (!rec || rec.v !== p.v) continue;            // Foto (noch) nicht lokal vorhanden
    photoSent[p.id] = p.v;
    const b = f.writeBatch(db);
    b.set(f.doc(db, 'photoData', p.id), {v:p.v, data: f.Bytes.fromUint8Array(new Uint8Array(rec.full))});
    b.set(f.doc(db, 'photos', p.id), {id:p.id, day:p.day, v:p.v});
    b.commit().catch(err => { delete photoSent[p.id]; photoSyncError(err); });
  }
  for (const id of dels){
    if (photoSent[id] === '-') continue;
    photoSent[id] = '-';
    const b = f.writeBatch(db);
    b.delete(f.doc(db, 'photos', id)); b.delete(f.doc(db, 'photoData', id));
    b.commit().catch(err => { delete photoSent[id]; photoSyncError(err); });
  }
}
function onPhotos(snap){
  const p = photoPending();
  const map = new Map(snap.docs.map(d => { const x = d.data(); return [d.id, {id:d.id, day:x.day || d.id, v:x.v}]; }));
  p.ups.forEach(x => map.set(x.id, x)); p.dels.forEach(id => map.delete(id));
  state.photos = [...map.values()];
  if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites){
    ensureBase(); base.photos = {};
    snap.docs.forEach(d => { base.photos[d.id] = d.data().v; });
    saveBase(); for (const k in photoSent) delete photoSent[k];
  }
  localStorage.setItem(KEY, JSON.stringify(state));
  if (view === 'photos' || view === 'home') render();
  photoFlush(); syncPhotoBlobs(); setSyncStatus();
}
let blobSync = {running:false, again:false};
async function syncPhotoBlobs(){
  if (!sync.ready) return;
  if (blobSync.running){ blobSync.again = true; return; }
  blobSync.running = true;
  try {
    const {db, f} = sync.fb;
    const keys = new Set(await photoKeys());
    const want = new Set((state.photos || []).map(p => p.id));
    for (const k of keys) if (!want.has(k)) await photoDelRec(k);       // anderswo gelöscht
    for (const p of photosSorted().reverse()){                          // neueste zuerst
      if (!sync.ready) break;
      const rec = keys.has(p.id) ? await photoRec(p.id) : null;
      if (rec && rec.v === p.v) continue;
      const d = await f.getDoc(f.doc(db, 'photoData', p.id));
      if (!d.exists() || d.data().v !== p.v) continue;
      const full = d.data().data.toUint8Array().slice().buffer;
      const thumb = await thumbFrom(await loadImg(jpeg(full)));
      const cur = (state.photos || []).find(x => x.id === p.id);
      if (cur && cur.v === p.v) await photoPutRec({id:p.id, v:p.v, full, thumb});
      if (view === 'photos') renderPhotos();
    }
  } catch(e){ console.warn('Fotos laden', e); }
  finally {
    blobSync.running = false;
    if (blobSync.again){ blobSync.again = false; syncPhotoBlobs(); }
  }
}
