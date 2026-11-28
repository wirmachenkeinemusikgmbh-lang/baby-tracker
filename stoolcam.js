"use strict";
/* ---------- Stuhlfarbe per Foto ----------
   Läuft komplett auf dem Gerät: Das Foto wird weder gespeichert noch hochgeladen.
   Ablauf: Foto → Weißabgleich (weiße Windel als Referenz, automatisch oder angetippt) →
   Farbe an der angetippten Stelle messen (Median vieler Pixel) → Einordnung in die Farbskala (STOOL_SCALE). */

// Zuordnung Skalen-Nummer (0–9) → Farbauswahl beim Windeleintrag
const SCALE_TO_COLOR = ['black', 'yellow', 'brown', 'brown', 'green', 'black', 'red', 'pale', 'pale', 'pale'];

function srgbToLab([r, g, b]){
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y =  R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const medianOf = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/* Weiß-Referenz automatisch: hellste 3 % der Bildpunkte (meist die Windel), ohne überbelichtete Punkte */
function autoWhite(img){
  const c = document.createElement('canvas'), k = 160 / Math.max(img.naturalWidth, img.naturalHeight);
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data, px = [];
  for (let i = 0; i < d.length; i += 4){ const s = d[i] + d[i + 1] + d[i + 2]; if (s < 755) px.push([d[i], d[i + 1], d[i + 2], s]); }
  if (px.length < 30) return null;
  px.sort((a, b) => b[3] - a[3]);
  const top = px.slice(0, Math.max(10, Math.round(px.length * 0.03)));
  return [0, 1, 2].map(j => mean(top.map(p => p[j])));
}
/* Verstärkung je Farbkanal, damit die Referenz neutral-weiß wird (begrenzt, damit nichts „kippt“) */
function wbGains(white){
  if (!white) return {g:[1, 1, 1], clamped:false, dark:false};
  let clamped = false;
  const g = white.map(v => { const x = 242 / Math.max(1, v); const y = Math.max(0.7, Math.min(1.7, x)); if (y !== x) clamped = true; return y; });
  return {g, clamped, dark: mean(white) < 110};
}
function sampleAt(ctx, x, y, r){
  const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const w = Math.min(ctx.canvas.width - x0, Math.round(2 * r)), h = Math.min(ctx.canvas.height - y0, Math.round(2 * r));
  if (w < 1 || h < 1) return null;
  const d = ctx.getImageData(x0, y0, w, h).data, R = [], G = [], B = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    if ((i + x0 - x) ** 2 + (j + y0 - y) ** 2 > r * r) continue;
    const o = (j * w + i) * 4; R.push(d[o]); G.push(d[o + 1]); B.push(d[o + 2]);
  }
  return R.length ? [medianOf(R), medianOf(G), medianOf(B)] : null;
}

/* Einordnung: klare Regeln für die Warnfarben, sonst nächster Nachbar unter Gelb/Ocker/Braun */
function classifyStool(lab, days){
  const [L, a, b] = lab, C = Math.hypot(a, b), h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
  // borderline: '' | 'pale' (nah an blass) | 'dark' (sehr dunkel) | 'reddish' (rötlich) | 'meconium' (ohne Geburtsdatum)
  let idx, borderline = '';
  const black = days != null && days <= 3 ? 0 : 5;                            // Mekonium nur in den ersten Lebenstagen
  const nearest = () => [1, 2, 3].reduce((best, i) => deltaE(lab, srgbToLab(hexRgb(STOOL_SCALE[i].c))) < deltaE(lab, srgbToLab(hexRgb(STOOL_SCALE[best].c))) ? i : best, 1);
  if (L <= 16 || (L <= 24 && C <= 12)) idx = black;                           // schwarz
  else if ((L >= 60 && C <= 18) || (L >= 68 && C <= 40)) idx = L >= 88 && C <= 12 ? 9 : C <= 18 ? 8 : 7;   // blass / lehm / weiß
  else if ((h >= 340 || h <= 40) && C >= 35 && a >= 1.2 * b && L < 62) idx = 6;   // deutlich rot
  else if (h >= 100 && h <= 180 && C >= 12) idx = 4;                          // grün
  else {
    idx = nearest();                                                          // gelb / ocker / braun
    if (L >= 62 && C < 50) borderline = 'pale';                               // heller Grenzbereich → vorsichtshalber prüfen
    else if (L <= 26) borderline = 'dark';                                    // sehr dunkles Braun
    else if (C >= 28 && a >= 0.9 * b && L < 62) borderline = 'reddish';       // rötliches Braun
  }
  if ((idx === 0 || idx === 5) && days == null) borderline = 'meconium';
  return {idx, borderline, L, C, h};
}

/* ---------- Oberfläche ---------- */
let stoolCamInput = null;
function openStoolCam(opts){
  opts = opts || {};
  openSheet(`<h3>📷 ${t('Stuhlfarbe prüfen')}</h3>
    <div class="hint">${t('So wird das Ergebnis am genauesten:')}<br>• ${t('bei Tageslicht oder hellem, weißem Licht, ohne Blitz')}<br>
      • ${t('Windel mit Stuhl von oben, etwas Weiß der Windel mit im Bild')}<br>• ${t('keine Farbfilter oder Nachtmodus der Kamera')}</div>
    <button class="btn primary wide" data-sc="shoot">📷 ${t('Foto aufnehmen')}</button>
    <button class="btn wide" data-sc="pick">🖼️ ${t('Foto aus der Mediathek')}</button>
    <div class="disc">${t('Das Foto bleibt nur kurz auf diesem Gerät zur Analyse – es wird nicht gespeichert und nicht synchronisiert.')}</div>
    <button class="btn ghost wide" data-sc="close">${t('Abbrechen')}</button>`);
  $('#sheet').onclick = ev => {
    const a = ev.target.closest('[data-sc]')?.dataset.sc; if (!a) return;
    if (a === 'close') return closeSheet();
    if (!stoolCamInput){ stoolCamInput = document.createElement('input'); stoolCamInput.type = 'file'; stoolCamInput.accept = 'image/*'; stoolCamInput.hidden = true; document.body.appendChild(stoolCamInput); }
    if (a === 'shoot') stoolCamInput.setAttribute('capture', 'environment'); else stoolCamInput.removeAttribute('capture');
    stoolCamInput.value = '';
    stoolCamInput.onchange = async () => {
      const f = stoolCamInput.files[0]; if (!f) return;
      try { analyzeStoolPhoto(await loadImg(f), opts); }
      catch(e){ alert(t('Das Foto konnte nicht geöffnet werden.')); }
    };
    stoolCamInput.click();
  };
}

function analyzeStoolPhoto(img, opts){
  // Arbeitskopie (max. 1200 px) zum Messen
  const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
  const work = document.createElement('canvas');
  work.width = Math.round(img.naturalWidth * k); work.height = Math.round(img.naturalHeight * k);
  const wctx = work.getContext('2d', {willReadFrequently:true}); wctx.drawImage(img, 0, 0, work.width, work.height);
  const r = Math.max(6, Math.min(work.width, work.height) * 0.03);
  let stoolPt = null, whitePt = null, mode = 'stool', override = null, kind = opts.kind && opts.kind !== 'wet' ? opts.kind : 'stool';
  const autoW = autoWhite(img);

  openSheet(`<h3>📷 ${t('Stuhlfarbe prüfen')}</h3>
    <div class="seg" id="scMode" style="margin-top:0">
      <button class="on" data-mode="stool">👆 ${t('Stuhl antippen')}</button><button data-mode="white">⬜ ${t('Weiß der Windel')}</button></div>
    <canvas id="scC" style="width:100%;display:block;border-radius:14px;touch-action:manipulation;background:#000"></canvas>
    <div class="muted" id="scHelp" style="margin-top:8px">${t('Tippe auf eine typische Stelle des Stuhls.')}</div>
    <div id="scRes"></div>
    <button class="btn ghost wide" data-sc="again">${t('Neues Foto')}</button>
    <button class="btn ghost wide" data-sc="close">${t('Schließen')}</button>`);
  const c = $('#scC');
  const maxH = window.innerHeight * 0.48, scale = Math.min(c.clientWidth / work.width, maxH / work.height);
  c.style.width = Math.round(work.width * scale) + 'px'; c.style.margin = '0 auto';
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(work.width * scale * dpr); c.height = Math.round(work.height * scale * dpr);
  const s = c.width / work.width;

  const draw = () => {
    const ctx = c.getContext('2d'); ctx.drawImage(work, 0, 0, c.width, c.height);
    ctx.lineWidth = 3 * dpr;
    if (whitePt){ ctx.strokeStyle = '#2f7de1'; ctx.strokeRect((whitePt[0] - r) * s, (whitePt[1] - r) * s, 2 * r * s, 2 * r * s); }
    if (stoolPt){ ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(stoolPt[0] * s, stoolPt[1] * s, r * s, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.arc(stoolPt[0] * s, stoolPt[1] * s, r * s + 2.5 * dpr, 0, 7); ctx.stroke(); }
  };
  const result = () => {
    if (!stoolPt) return null;
    const white = whitePt ? sampleAt(wctx, whitePt[0], whitePt[1], r) : autoW;
    const wb = wbGains(white);
    const raw = sampleAt(wctx, stoolPt[0], stoolPt[1], r); if (!raw) return null;
    const rgb = raw.map((v, i) => Math.min(255, v * wb.g[i]));
    const lab = srgbToLab(rgb), cls = classifyStool(lab, ageDays());
    return {rgb, raw, wb, cls, manualWhite: !!whitePt};
  };
  const renderRes = () => {
    const res = result();
    if (!res){ $('#scRes').innerHTML = ''; return; }
    const idx = override ?? res.cls.idx, sc = STOOL_SCALE[idx], lv = STOOL_LVL[sc.lvl];
    const notes = [];
    const BORDER = {
      meconium: t('Sehr dunkler Stuhl: In den ersten 2–3 Lebenstagen ist das Mekonium und normal, danach bitte ärztlich abklären. (Tipp: Geburtsdatum eintragen.)'),
      pale: t('<b>Heller Grenzbereich:</b> Die Farbe liegt nah an „blass“. Bitte mit der gedruckten Stuhlfarbkarte im gelben Heft vergleichen – wirkt der Stuhl hell, blass oder ist das wiederholt so, bitte beim Kinderarzt melden.'),
      dark: t('<b>Sehr dunkles Braun:</b> Meist normal (z. B. mit Beikost oder Eisenpräparat). Wirkt der Stuhl tatsächlich schwarz oder teerartig, bitte ärztlich abklären.'),
      reddish: t('<b>Rötliches Braun:</b> Meist normal. Siehst du rote Streifen, Schleim mit Blut oder ist der Stuhl deutlich rot (ohne Rote Bete o. Ä.), bitte ärztlich abklären.')
    };
    if (override == null && res.cls.borderline) notes.push(BORDER[res.cls.borderline]);
    if (res.wb.dark) notes.push(t('Das Foto ist recht dunkel – das Ergebnis ist unsicher. Besser bei mehr Licht wiederholen.'));
    if (res.wb.clamped) notes.push(t('Starker Farbstich im Foto – das Ergebnis ist unsicher. Tippe zum Weißabgleich auf eine saubere weiße Stelle der Windel oder fotografiere bei Tageslicht.'));
    const level = sc.lvl === 'alert' ? '🚨 ' + t('Bitte heute noch den Kinderarzt anrufen bzw. aufsuchen – außerhalb der Sprechzeiten: ärztlicher Bereitschaftsdienst 116 117.')
      : sc.lvl === 'warn' ? '⚠️ ' + t('Bitte zeitnah ärztlich abklären lassen.') : '✅ ' + t('Diese Farbe ist in der Regel unbedenklich.');
    $('#scRes').innerHTML = `<div class="panel" style="border:2px solid ${lv.c}">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="text-align:center;font-size:11px;color:var(--muted)">${dotSvg(rgbHex(res.rgb), 46)}${t('gemessen')}</div>
        <div style="font-size:20px;color:var(--muted)">→</div>
        <div style="text-align:center;font-size:11px;color:var(--muted)">${dotSvg(sc.c, 46)}${t('Skala {n}', {n:idx + 1})}</div>
        <div style="flex:1;min-width:0"><b style="font-size:16px">${sc.n}</b><div style="color:${lv.c};font-weight:700;font-size:14px">${lv.icon} ${lv.t}</div></div>
      </div>
      <div style="margin-top:10px;font-size:14px;line-height:1.45">${level}<br><span class="muted">${sc.t}</span></div>
      ${notes.map(n => `<div class="adv warn" style="border-top:1px solid var(--line);margin-top:8px"><span>💡</span><span>${n}</span></div>`).join('')}
      <details class="advtips"><summary>${t('Farbe passt nicht? Selbst auswählen')}</summary>
        <div class="chips" style="margin-top:6px">${STOOL_SCALE.map((x, i) => `<button class="chip ${i === idx ? 'on' : ''}" data-ov="${i}" style="display:inline-flex;align-items:center;gap:6px">${dotSvg(x.c, 16)}${i + 1}</button>`).join('')}</div></details>
      <div class="lbl">${t('Als Windel speichern')}</div>
      <div class="chips"><button class="chip ${kind === 'stool' ? 'on' : ''}" data-kind2="stool">💩 ${DIAPER_KIND.stool}</button><button class="chip ${kind === 'both' ? 'on' : ''}" data-kind2="both">💧💩 ${DIAPER_KIND.both}</button></div>
      <button class="btn primary wide" data-sc="save">${t('Windel speichern (Farbe: {c})', {c:STOOL_COLOR[SCALE_TO_COLOR[idx]]})}</button>
      <div class="disc">${t('Die Farberkennung per Kamera ist nur eine Orientierung: Licht, Kamera und Display verfälschen Farben. Im Zweifel mit der Stuhlfarbkarte vergleichen oder ärztlich nachfragen – besonders bei hellem, grauem oder blutigem Stuhl.')}</div></div>`;
  };
  draw();
  c.onclick = ev => {
    const rc = c.getBoundingClientRect();
    const p = [(ev.clientX - rc.left) / rc.width * work.width, (ev.clientY - rc.top) / rc.height * work.height];
    if (mode === 'white'){ whitePt = p; mode = 'stool'; } else { stoolPt = p; override = null; }
    setMode(); draw(); renderRes();
  };
  const setMode = () => {
    document.querySelectorAll('#scMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#scHelp').textContent = mode === 'white' ? t('Tippe auf eine saubere, weiße Stelle der Windel (Weißabgleich).')
      : stoolPt ? t('Tippe erneut, um eine andere Stelle zu messen.') : t('Tippe auf eine typische Stelle des Stuhls.');
  };
  $('#sheet').onclick = ev => {
    const m = ev.target.closest('[data-mode]'); if (m){ mode = m.dataset.mode; return setMode(); }
    const o = ev.target.closest('[data-ov]'); if (o){ override = +o.dataset.ov; return renderRes(); }
    const k2 = ev.target.closest('[data-kind2]'); if (k2){ kind = k2.dataset.kind2; return renderRes(); }
    const a = ev.target.closest('[data-sc]')?.dataset.sc; if (!a) return;
    if (a === 'close') return closeSheet();
    if (a === 'again') return openStoolCam(Object.assign({}, opts, {kind}));
    if (a === 'save'){
      const res = result(); if (!res) return;
      const idx = override ?? res.cls.idx, sc = STOOL_SCALE[idx];
      const e = newEvent('diaper', {kind, color: SCALE_TO_COLOR[idx]});
      if (opts.cons) e.cons = opts.cons;
      e.note = t('Farbe per Foto: {x}', {x:sc.n}) + (override != null ? ' ' + t('(selbst gewählt)') : '');
      closeSheet(); addEvent(e, t('Windel: {x}', {x:detail(e)})); stoolAlert(e);
    }
  };
}
document.addEventListener('click', ev => { if (ev.target.closest('[data-stoolcam]')) openStoolCam(); });
