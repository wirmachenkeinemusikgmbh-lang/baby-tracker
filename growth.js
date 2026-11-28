"use strict";
/* ---------- Gewicht: WHO-Wachstumskurven & Prognose ----------
   WHO Child Growth Standards, Gewicht für Alter, 0–24 Monate (L, M, S je Lebensmonat).
   Quelle: WHO (2006), Datendateien veröffentlicht von CDC/NCHS (WHO-Boys/Girls-Weight-for-age-Percentiles.csv). */
const WHO_WFA = {
  m: [[0.3487,3.3464,0.14602],[0.2297,4.4709,0.13395],[0.197,5.5675,0.12385],[0.1738,6.3762,0.11727],[0.1553,7.0023,0.11316],[0.1395,7.5105,0.1108],[0.1257,7.934,0.10958],[0.1134,8.297,0.10902],[0.1021,8.6151,0.10882],[0.0917,8.9014,0.10881],[0.082,9.1649,0.10891],[0.073,9.4122,0.10906],[0.0644,9.6479,0.10925],[0.0563,9.8749,0.10949],[0.0487,10.0953,0.10976],[0.0413,10.3108,0.11007],[0.0343,10.5228,0.11041],[0.0275,10.7319,0.11079],[0.0211,10.9385,0.11119],[0.0148,11.143,0.11164],[0.0087,11.3462,0.11211],[0.0029,11.5486,0.11261],[-0.0028,11.7504,0.11314],[-0.0083,11.9514,0.11369],[-0.0137,12.1515,0.11426]],
  f: [[0.3809,3.2322,0.14171],[0.1714,4.1873,0.13724],[0.0962,5.1282,0.13],[0.0402,5.8458,0.12619],[-0.005,6.4237,0.12402],[-0.043,6.8985,0.12274],[-0.0756,7.297,0.12204],[-0.1039,7.6422,0.12178],[-0.1288,7.9487,0.12181],[-0.1507,8.2254,0.12199],[-0.17,8.48,0.12223],[-0.1872,8.7192,0.12247],[-0.2024,8.9481,0.12268],[-0.2158,9.1699,0.12283],[-0.2278,9.387,0.12294],[-0.2384,9.6008,0.12299],[-0.2478,9.8124,0.12303],[-0.2562,10.0226,0.12306],[-0.2637,10.2315,0.12309],[-0.2703,10.4393,0.12315],[-0.2762,10.6464,0.12323],[-0.2815,10.8534,0.12335],[-0.2862,11.0608,0.1235],[-0.2903,11.2688,0.12369],[-0.2941,11.4775,0.1239]]
};
const MONTH_DAYS = 30.4375;
function lmsAt(sex, months){
  const t = WHO_WFA[sex]; if (!t || months < 0 || months > 24) return null;
  const i = Math.min(23, Math.floor(months)), f = months - i;
  return t[i].map((v, k) => v + (t[i + 1][k] - v) * f);
}
const zOf = (kg, [L, M, S]) => L ? (Math.pow(kg / M, L) - 1) / (L * S) : Math.log(kg / M) / S;
const kgOf = (z, [L, M, S]) => L ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
function normCdf(z){ // Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const ageMonthsAt = ts => { const d = ageDays(ts); return d == null ? null : d / MONTH_DAYS; };
const weights = () => sorted().filter(e => e.type === 'weight' && e.g > 0);

function growthInfo(){
  const list = weights(), b = curBaby(), sex = b.sex;
  const pts = list.map(e => {
    const m = ageMonthsAt(e.start), lms = sex && m != null ? lmsAt(sex, m) : null;
    const z = lms ? zOf(e.g / 1000, lms) : null;
    return {e, m, kg: e.g / 1000, z, pct: z == null ? null : normCdf(z) * 100};
  });
  const last = pts[pts.length - 1];
  // Zunahme pro Woche: lineare Regression der Messungen der letzten 28 Tage (mind. 2 Messungen, >= 5 Tage Abstand)
  let perWeek = null;
  if (last){
    const recent = pts.filter(p => p.e.start >= last.e.start - 28 * 864e5);
    if (recent.length >= 2 && last.e.start - recent[0].e.start >= 5 * 864e5){
      const xs = recent.map(p => p.e.start / (7 * 864e5)), ys = recent.map(p => p.kg * 1000);
      const mx = mean(xs), my = mean(ys);
      perWeek = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    }
  }
  // Prognose: Baby bleibt auf seiner Perzentile (Mittel der z-Werte der letzten 30 Tage, ab Lebenstag 14)
  let forecast = [], zRef = null;
  if (last && sex && last.m != null){
    const zs = pts.filter(p => p.z != null && p.e.start >= last.e.start - 30 * 864e5 && ageDays(p.e.start) >= 14).map(p => p.z);
    if (zs.length){
      zRef = mean(zs);
      const nowM = ageMonthsAt(Date.now());
      forecast = [1, 2, 3, 6].map(k => ({k, m: nowM + k})).filter(f => f.m <= 24).map(f => ({k: f.k, m: f.m, kg: kgOf(zRef, lmsAt(sex, f.m))}));
    }
  }
  // Trend-Prognose (ohne Geschlecht / über 24 Monate): nur kurzfristig, 2 und 4 Wochen
  const trend = last && perWeek != null ? [2, 4].map(w => ({w, kg: last.kg + perWeek * ((Date.now() - last.e.start) / (7 * 864e5) + w) / 1000})) : [];
  return {pts, last, perWeek, forecast, zRef, trend, sex};
}

const kgTxt = kg => kg.toLocaleString(LOCALE, {minimumFractionDigits:2, maximumFractionDigits:2}) + ' kg';
const pctTxt = p => p < 1 ? '< P1' : p > 99 ? '> P99' : 'P' + Math.round(p);

/* Typische Zunahme (Orientierung, WHO-Medianwerte gerundet) in g/Woche */
function typicalGain(days){
  if (days < 14) return null;
  if (days < 91) return [150, 250];
  if (days < 183) return [100, 180];
  if (days < 365) return [50, 120];
  return [25, 70];
}

function weightChartSvg(g){
  const W = 340, H = 230, pl = 34, pr = 10, pt = 10, pb = 26;
  const sex = g.sex, pts = g.pts.filter(p => p.m != null);
  if (!pts.length) return '';
  const nowM = ageMonthsAt(Date.now());
  const xMax = Math.min(24, Math.max(3, Math.ceil(Math.max(nowM, ...pts.map(p => p.m)) + (g.forecast.length ? 3 : 1))));
  const kgs = pts.map(p => p.kg).concat(g.forecast.filter(f => f.m <= xMax).map(f => f.kg));
  if (sex) for (let m = 0; m <= xMax; m += 0.5){ const l = lmsAt(sex, m); kgs.push(kgOf(-1.881, l), kgOf(1.881, l)); }
  const yMin = Math.max(0, Math.floor(Math.min(...kgs) - 0.5)), yMax = Math.ceil(Math.max(...kgs) + 0.5);
  const X = m => pl + (m / xMax) * (W - pl - pr), Y = kg => pt + (1 - (kg - yMin) / (yMax - yMin)) * (H - pt - pb);
  let svg = `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Gewichtskurve')}" style="direction:ltr">`;
  // Achsen/Raster
  const yStep = yMax - yMin > 8 ? 2 : 1;
  for (let kg = yMin; kg <= yMax; kg += yStep) svg += `<line x1="${pl}" x2="${W - pr}" y1="${Y(kg)}" y2="${Y(kg)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${Y(kg) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${kg}</text>`;
  const xStep = xMax > 12 ? 3 : xMax > 6 ? 2 : 1;
  for (let m = 0; m <= xMax; m += xStep) svg += `<text x="${X(m)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${m}</text>`;
  // WHO-Bänder: P3–P97 und P15–P85, Median
  if (sex){
    const band = (z1, z2, op) => { const up = [], dn = [];
      for (let m = 0; m <= xMax + 1e-9; m += 0.25){ const l = lmsAt(sex, m); up.push(`${X(m)},${Y(kgOf(z2, l))}`); dn.unshift(`${X(m)},${Y(kgOf(z1, l))}`); }
      return `<polygon points="${up.concat(dn).join(' ')}" fill="var(--accent)" opacity="${op}"/>`; };
    svg += band(-1.881, 1.881, 0.10) + band(-1.036, 1.036, 0.14);
    const med = []; for (let m = 0; m <= xMax + 1e-9; m += 0.25) med.push(`${X(m)},${Y(kgOf(0, lmsAt(sex, m)))}`);
    svg += `<polyline points="${med.join(' ')}" fill="none" stroke="var(--accent)" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 3"/>`;
  }
  // Prognose
  if (g.forecast.length && g.last){
    const fp = [`${X(g.last.m)},${Y(g.last.kg)}`].concat(g.forecast.filter(f => f.m <= xMax).map(f => `${X(f.m)},${Y(f.kg)}`));
    svg += `<polyline points="${fp.join(' ')}" fill="none" stroke="var(--ink)" stroke-opacity=".55" stroke-width="2" stroke-dasharray="5 4"/>`;
    g.forecast.filter(f => f.m <= xMax).forEach(f => { svg += `<circle cx="${X(f.m)}" cy="${Y(f.kg)}" r="3" fill="none" stroke="var(--ink)" stroke-opacity=".55" stroke-width="1.5"/>`; });
  }
  // Messwerte
  svg += `<polyline points="${pts.map(p => `${X(p.m)},${Y(p.kg)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  pts.forEach(p => { svg += `<circle cx="${X(p.m)}" cy="${Y(p.kg)}" r="3.5" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5"/>`; });
  svg += '</svg>';
  return svg;
}

function weightStatsHtml(){
  const b = curBaby(), g = growthInfo();
  const addBtn = `<button class="btn primary wide" data-weight-add="1">⚖️ ${t('Gewicht eintragen')}</button>`;
  if (!g.pts.length) return `<div class="panel"><div class="empty">${t('Noch kein Gewicht erfasst.')}</div>${addBtn}</div>`;
  const last = g.last, days = ageDays();
  const tg = days != null ? typicalGain(days) : null;
  let html = `<div class="tiles">
    ${tile(kgTxt(last.kg), t('Aktuell') + ' · ' + dayLabel(dayKey(last.e.start)))}
    ${tile(last.pct != null ? pctTxt(last.pct) : null, t('WHO-Perzentile'))}
    ${tile(g.perWeek != null ? (g.perWeek >= 0 ? '+' : '') + Math.round(g.perWeek) + ' g' : null, t('Zunahme / Woche (4 Wo.)'))}
    ${tile(g.forecast[0] ? kgTxt(g.forecast[0].kg) : g.trend[1] ? kgTxt(g.trend[1].kg) : null, g.forecast[0] ? t('Prognose in 1 Monat') : t('Trend in 4 Wochen'))}</div>`;
  if (!b.birth || !b.sex) html += `<div class="hint" style="margin-top:12px">${t('Für WHO-Perzentilen, Kurve und Prognose bitte unter <b>Daten</b> Geburtsdatum und Geschlecht eintragen.')}</div>`;
  if (b.birth) html += `<div class="panel"><h4>${b.sex ? t('Gewichtskurve mit WHO-Perzentilen') : t('Gewichtskurve')}</h4>${weightChartSvg(g)}
    <div class="disc">${b.sex ? t('Flächen: 3.–97. und 15.–85. Perzentile, gepunktet: Median (50.).') + ' ' : ''}${t('Gestrichelt: Prognose. X-Achse: Alter in Monaten, Y-Achse: kg.')}</div></div>`;
  // Prognose-Tabelle & Einordnung
  const items = [];
  if (g.forecast.length) items.push({lvl:'info', text:t('<b>Prognose</b> (wenn {name} auf {p} bleibt):', {name:esc(b.name || t('dein Baby')), p:pctTxt(normCdf(g.zRef) * 100)}) + ' '
    + g.forecast.map(f => t('in {x} ca. {kg}', {x:unit(f.k, 'month'), kg:kgTxt(f.kg)})).join(', ') + '.'});
  else if (g.trend.length) items.push({lvl:'info', text:t('<b>Trend</b> (aktuelle Zunahme fortgeschrieben):') + ' ' + t('in {x} ca. {kg}', {x:unit(2, 'week'), kg:kgTxt(g.trend[0].kg)}) + ', ' + t('in {x} ca. {kg}', {x:unit(4, 'week'), kg:kgTxt(g.trend[1].kg)}) + '.'});
  if (g.perWeek != null && tg) items.push(cmp(g.perWeek, tg, x => Math.round(x) + ' g', t('Zunahme pro Woche'),
    t('Eine geringere Zunahme kann normal sein, wenn dein Baby auf seiner Perzentile bleibt. Nimmt es über Wochen deutlich weniger zu oder fällt über Perzentilen-Linien, bitte mit Kinderarzt oder Hebamme besprechen.'),
    t('Eine kräftige Zunahme ist bei gestillten Babys in den ersten Monaten häufig und meist unbedenklich.')));
  // Geburtsgewicht wieder erreicht?
  const first = g.pts[0];
  if (days != null && days <= 21 && first && ageDays(first.e.start) <= 3 && last !== first){
    const regained = last.kg >= first.kg;
    items.push(regained ? {lvl:'ok', text:t('<b>Geburtsgewicht wieder erreicht.</b> 🎉')}
      : {lvl: days > 14 ? 'warn' : 'info', text:t('<b>Geburtsgewicht noch nicht wieder erreicht</b> ({a} von {b}).', {a:kgTxt(last.kg), b:kgTxt(first.kg)}) + ' '
          + (days > 14 ? t('Üblich ist das nach 10–14 Tagen – bitte mit Hebamme oder Kinderarzt besprechen.') : t('Üblich ist das nach 10–14 Tagen.'))
          + ' ' + t('Eine Abnahme von bis zu ca. 7–10 % in den ersten Tagen ist normal.')});
  }
  // Perzentilen-Abfall
  const zp = g.pts.filter(p => p.z != null && ageDays(p.e.start) >= 14);
  if (zp.length >= 2){
    const drop = Math.max(...zp.map(p => p.z)) - zp[zp.length - 1].z;
    if (drop > 1.34) items.push({lvl:'warn', text:t('<b>Die Gewichtskurve ist über mehr als zwei Perzentilen-Linien abgefallen.</b> Bitte beim Kinderarzt ansprechen.')});
  }
  const icon = {ok:'✅', info:'💡', warn:'⚠️', alert:'🚨'};
  if (items.length) html += `<div class="panel"><h4>💡 ${t('Einordnung')}</h4>${items.map(i => `<div class="adv ${i.lvl}"><span>${icon[i.lvl]}</span><span>${i.text}</span></div>`).join('')}
    <div class="disc">${t('Die Prognose ist eine Schätzung auf Basis der WHO-Wachstumsstandards (0–24 Monate) und kein ärztlicher Befund. Messwerte unterschiedlicher Waagen können abweichen.')}</div></div>`;
  html += `<div class="panel"><h4>${t('Messungen')}</h4><div class="list" style="box-shadow:none">${g.pts.slice().reverse().map(p => `<div class="row" data-id="${p.e.id}">
    <div class="ri">⚖️</div><div class="rd">${kgTxt(p.kg)}${p.pct != null ? ` · ${pctTxt(p.pct)}` : ''}<small>${dateDE(p.e.start)}${p.m != null ? ' · ' + esc(ageText(p.e.start)) : ''}${p.e.len ? ' · ' + fmtNum(p.e.len) + ' cm' : ''}${p.e.head ? ' · ' + t('KU {n} cm', {n:fmtNum(p.e.head)}) : ''}</small></div></div>`).join('')}</div>
    ${addBtn}</div>`;
  return html;
}
