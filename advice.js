"use strict";
/* ---------- Alter & altersabhängige Tipps ----------
   Orientierungswerte u. a. nach National Sleep Foundation (2015), AASM/AAP (2016),
   Netzwerk Gesund ins Leben / BZgA (Stillen, Beikost) und der Stuhlfarbkarte (Gallengangsatresie).
   Wachfenster sind verbreitete Faustregeln, keine medizinischen Grenzwerte. */

function ageDays(ts){
  if (!curBaby().birth) return null;
  return Math.round((keyToDate(dayKey(ts ?? Date.now())) - keyToDate(curBaby().birth)) / 864e5);
}
function ageParts(ts){ // volle Kalendermonate + Resttage
  const b = keyToDate(curBaby().birth), d = keyToDate(dayKey(ts ?? Date.now()));
  let m = (d.getFullYear() - b.getFullYear()) * 12 + d.getMonth() - b.getMonth();
  const anchor = k => { const a = new Date(b); a.setMonth(b.getMonth() + k); return a; };
  if (anchor(m) > d) m--;
  return {m, days: Math.round((d - anchor(m)) / 864e5)};
}
function ageText(ts){
  const days = ageDays(ts);
  if (days == null || days < 0) return '';
  if (days === 0) return t('Geburtstag 🎉');
  if (days < 14) return unit(days, 'day');
  if (days < 56){ const w = Math.floor(days / 7), r = days % 7; return unit(w, 'week') + (r ? ', ' + unit(r, 'day') : ''); }
  const {m, days: r} = ageParts(ts);
  if (m < 24) return unit(m, 'month') + (r ? ', ' + unit(r, 'day') : '');
  return unit(Math.floor(m / 12), 'year') + (m % 12 ? ', ' + unit(m % 12, 'month') : '');
}
const lebensmonat = () => ageDays() >= 0 ? ageParts().m + 1 : null;

/* Altersstufen: bis "to" Tage. sleep = Std./24 h, wake = Wachfenster in min, bed = Einschlafzeit (min nach 0 Uhr) */
const SAFE_SLEEP = t('Sicher schlafen: Rückenlage, im eigenen Bett (gern im Elternschlafzimmer), Schlafsack statt Decke, kein Kissen, keine Nestchen oder Kuscheltiere im Bett, rauchfreie Umgebung, ca. 16–18 °C.');
const STOOL_CARD = t('Stuhlfarbkarte: Heller, weißlicher, grauer oder lehmfarbener Stuhl → bitte sofort zum Kinderarzt (in den ersten Lebensmonaten möglicher Hinweis auf eine Lebererkrankung, die früh behandelt werden muss).');
const BANDS = [
  {to:28, label:t('Neugeborenes'), sleep:[14,17], naps:null, wake:[35,60], feeds:[8,12], wet:6, bed:null, tips:{
    sleep:[t('Neugeborene haben noch keinen Tag-Nacht-Rhythmus – Schlaf verteilt sich rund um die Uhr auf Phasen von etwa 1–4 Stunden.'), SAFE_SLEEP],
    nap:[t('Feste Nickerchen gibt es noch nicht – dein Baby schläft, wann es müde ist. Müdigkeitszeichen: Gähnen, Augenreiben, starrer Blick, Quengeln.')],
    diaper:[t('Tag 1–2: Mekonium (schwarz-grün, zäh). Ab etwa Tag 4–5 wird der Stuhl gelb – bei gestillten Babys senfgelb, weich bis flüssig, oft „körnig“.'),
      t('Ab etwa Tag 5 zeigen mindestens 6 schwere, nasse Windeln pro Tag, dass dein Baby genug trinkt.'),
      t('Gestillte Babys haben in den ersten Wochen meist 3 oder mehr Stuhlgänge täglich.'), STOOL_CARD],
    feed:[t('8–12 Mahlzeiten in 24 Stunden sind normal – auch gehäuftes Trinken am Abend („Clusterfeeding“).'),
      t('Bis das Geburtsgewicht wieder erreicht ist (meist nach 10–14 Tagen), sollte zwischen zwei Mahlzeiten nicht mehr als ca. 4 Stunden liegen.'),
      t('Hungerzeichen: Schmatzen, Suchen, Hand zum Mund. Weinen ist ein spätes Zeichen.')]}},
  {to:91, label:t('1–3 Monate'), sleep:[14,17], naps:[4,5], wake:[60,90], feeds:[7,12], wet:6, bed:null, tips:{
    sleep:[t('Tagsüber Licht und Alltagsgeräusche, nachts dunkel und ruhig – das hilft beim Entwickeln des Tag-Nacht-Rhythmus.'), SAFE_SLEEP],
    nap:[t('Viele, unregelmäßige Nickerchen sind normal. Achte auf Müdigkeitszeichen und leg dein Baby hin, bevor es übermüdet ist.')],
    diaper:[t('Nach etwa 6 Wochen können gestillte Babys auch mehrere Tage (bis 7–10) ohne Stuhl sein – solange der Stuhl dann weich ist und das Baby zufrieden wirkt, ist das normal.'),
      t('Mit Fläschchennahrung ist der Stuhl meist fester und bräunlicher, oft 1–2× täglich.'), STOOL_CARD],
    feed:[t('Die Abstände werden oft länger. Wachstumsschübe (z. B. um die 3. und 6. Woche und um 3 Monate) bringen phasenweise häufigeres Trinken.')]}},
  {to:152, label:t('3–5 Monate'), sleep:[12,16], naps:[3,4], wake:[75,150], feeds:[6,10], wet:6, bed:[18.5*60, 21*60], tips:{
    sleep:[t('Ein kurzes, immer gleiches Abendritual (z. B. Wickeln, Schlafsack, Lied) erleichtert das Einschlafen.'),
      t('Um den 4. Monat verändert sich der Schlaf oft – häufigeres nächtliches Aufwachen ist in dieser Phase normal.'), SAFE_SLEEP],
    nap:[t('Meist pendeln sich 3–4 Nickerchen ein; das letzte am späten Nachmittag ist oft kurz.')],
    diaper:[t('Weiterhin gilt: rund 6 nasse Windeln am Tag sprechen für ausreichend Flüssigkeit.'), STOOL_CARD],
    feed:[t('Babys trinken jetzt oft schneller und lassen sich leicht ablenken – eine ruhige Umgebung hilft.')]}},
  {to:244, label:t('5–8 Monate'), sleep:[12,16], naps:[2,3], wake:[120,180], feeds:[5,8], wet:6, bed:[18.5*60, 20.5*60], tips:{
    sleep:[t('Regelmäßige Aufwach- und Schlafenszeiten stabilisieren den Rhythmus. Nächtliches Aufwachen zum Trinken ist weiterhin normal.'), SAFE_SLEEP],
    nap:[t('Viele Babys wechseln in dieser Zeit von 3 auf 2 Nickerchen.')],
    diaper:[t('Mit Beikost wird der Stuhl fester, dunkler und riecht stärker – das ist normal.'), STOOL_CARD],
    feed:[t('Beikost: frühestens ab Beginn des 5., spätestens ab Beginn des 7. Monats – wenn dein Baby Interesse am Essen zeigt und mit Unterstützung aufrecht sitzen kann.'),
      t('Weiterstillen parallel zur Beikost wird empfohlen. In der App erfasst du die Milchmahlzeiten.')]}},
  {to:365, label:t('8–12 Monate'), sleep:[12,16], naps:[2,2], wake:[150,240], feeds:[3,6], wet:6, bed:[18.5*60, 20.5*60], tips:{
    sleep:[t('Trennungsangst und neue Fähigkeiten (Krabbeln, Hochziehen, Stehen) können den Schlaf vorübergehend unruhiger machen.'), SAFE_SLEEP],
    nap:[t('Zwei Nickerchen (vormittags und nachmittags) sind typisch.')],
    diaper:[t('Mit mehr fester Nahrung werden die Stuhlgänge fester und seltener.'), STOOL_CARD],
    feed:[t('Nach und nach ersetzen Breimahlzeiten einzelne Milchmahlzeiten. Zu den Mahlzeiten Wasser aus dem Becher anbieten.')]}},
  {to:548, label:t('12–18 Monate'), sleep:[11,14], naps:[1,2], wake:[180,330], feeds:[0,4], wet:5, bed:[18.5*60, 20.5*60], tips:{
    sleep:[t('Ein gleichbleibendes Abendritual bleibt der beste Einschlafhelfer.')],
    nap:[t('Der Wechsel auf ein Nickerchen um die Mittagszeit passiert meist zwischen 12 und 18 Monaten – oft mit einigen holprigen Wochen.')],
    diaper:[t('Harter Stuhl? Ausreichend trinken, Obst (z. B. Birne, Pflaume) und Vollkorn helfen oft.')],
    feed:[t('Dein Kind isst jetzt weitgehend am Familientisch mit. Stillen darf weitergehen, solange ihr beide es möchtet.')]}},
  {to:Infinity, label:t('ab 18 Monate'), sleep:[11,14], naps:[0,1], wake:[300,420], feeds:[0,3], wet:5, bed:[19*60, 21*60], tips:{
    sleep:[t('Ein Mittagsschlaf ist bis etwa 3 Jahre üblich. Fällt das Einschlafen abends schwer, kann ein früheres Ende des Mittagsschlafs helfen.')],
    nap:[t('Meist ein Mittagsschlaf von 1–3 Stunden.')],
    diaper:[t('Viele Kinder zeigen zwischen 2 und 3 Jahren Interesse am Töpfchen – Druck ist dabei nicht hilfreich.')],
    feed:[t('Familienkost mit regelmäßigen Mahlzeiten; Milch ist jetzt nur noch ein Teil der Ernährung.')]}}
];
const bandFor = days => BANDS.find(b => days < b.to);

/* Kennzahlen der letzten 7 vollständigen Tage */
function adviceStats(){
  const ev = sorted(), tk = todayKey();
  const days = []; for (let i = 7; i >= 1; i--) days.push(shiftDay(tk, -i));
  const inR = new Set(days), inDays = e => inR.has(dayKey(e.start));
  const tracked = days.filter(d => ev.some(e => dayKey(e.start) === d));
  const nd = tracked.length;
  const n = nights(ev);
  const naps = ev.filter(e => e.type === 'nap' && e.end && inDays(e));
  const napByDay = {}; naps.forEach(e => { const k = dayKey(e.start); napByDay[k] = (napByDay[k] || 0) + (e.end - e.start); });
  const nightsIn = days.filter(d => n[d] && n[d].wake);
  const total = naps.length ? nightsIn.map(d => (n[d].wake - n[d].bed) + (napByDay[d] || 0)) : [];
  const beds = days.filter(d => n[d]).map(d => { let m = minOfDay(n[d].bed); if (m < 300) m += 1440; return m; });
  // Wachfenster: Lücke zwischen zwei Schlafphasen (Nickerchen oder Nacht), nur plausible Werte
  const periods = [...naps.map(e => [e.start, e.end]), ...nightsIn.map(d => [n[d].bed, n[d].wake])].sort((a, b) => a[0] - b[0]);
  const windows = [];
  for (let i = 1; i < periods.length; i++){ const g = periods[i][0] - periods[i-1][1]; if (g > 10*60000 && g < 8*3600e3) windows.push(g / 60000); }
  const meals = mealsOf(ev).filter(m => inR.has(dayKey(m.start)));
  const feedDays = days.filter(d => ev.some(e => e.type === 'feed' && dayKey(e.start) === d)).length;
  const recentMeals = mealsOf(ev).filter(m => m.start > Date.now() - 72*3600e3);
  let maxGap = 0; for (let i = 1; i < recentMeals.length; i++) maxGap = Math.max(maxGap, recentMeals[i].start - recentMeals[i-1].end);
  const diapers = ev.filter(e => e.type === 'diaper' && inDays(e));
  const diaperDays = days.filter(d => diapers.some(e => dayKey(e.start) === d)).length;
  const feeds = ev.filter(e => e.type === 'feed' && inDays(e) && e.side !== 'bottle');
  return {nd, naps, total, beds, windows, meals, feedDays, maxGap, recentMeals: recentMeals.length,
    diapers, diaperDays, feeds, napDays: days.filter(d => napByDay[d]).length};
}

/* Warnzeichen beim Stuhl (letzte "hours" Stunden) */
function stoolFlags(hours){
  const since = Date.now() - hours * 3600e3, days = ageDays();
  const list = state.events.filter(e => mine(e) && e.type === 'diaper' && e.kind !== 'wet' && e.start >= since);
  const out = [];
  if (list.some(e => e.color === 'pale')) out.push({lvl:'alert', text:t('<b>Heller, weißlicher oder grauer Stuhl erfasst.</b> Bitte heute noch den Kinderarzt anrufen bzw. aufsuchen (Stuhlfarbkarte) – außerhalb der Sprechzeiten: ärztlicher Bereitschaftsdienst 116 117.')});
  if (list.some(e => e.color === 'red')) out.push({lvl:'alert', text:t('<b>Rötlicher Stuhl erfasst.</b> Blut im Stuhl bitte zeitnah ärztlich abklären lassen.')});
  if (list.some(e => e.color === 'black' && (days == null || ageDays(e.start) >= 5)))
    out.push({lvl:'alert', text:t('<b>Schwarzer Stuhl erfasst.</b> Nach den ersten Lebenstagen (Mekonium) bitte ärztlich abklären lassen.')});
  return out;
}
function stoolAlert(e){
  if (!['pale', 'red', 'black'].includes(e.color)) return;
  if (e.color === 'black' && curBaby().birth && ageDays(e.start) < 5) return;
  const f = stoolFlags(1)[0];
  if (f) setTimeout(() => alert(f.text.replace(/<[^>]+>/g, '')), 300);
}
function homeAlertsHtml(){
  return stoolFlags(48).map(f => `<button class="note alert" data-go="diaper">🚨 <span>${f.text}</span></button>`).join('');
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-go]'); if (!b) return;
  if (b.dataset.go === 'birth'){ showView('data'); setTimeout(() => $('#babyBirth').focus(), 100); }
  else { statType = b.dataset.go; showView('stats'); }
});

const fmt1 = x => fmtNum(x);
const fmtWin = m => m < 90 ? t('{n} min', {n:Math.round(m)}) : t('{h} h', {h:fmtHM(m * 60000)});
function cmp(val, range, fmt, what, low, high, lowLvl){
  const [lo, hi] = range;
  const r = hi == null ? t('mind. {x}', {x:fmt(lo)}) : lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
  const head = `<b>${what}: Ø ${fmt(val)}</b> – `;
  if (val < lo) return {lvl: lowLvl || 'info', text: head + t('typisch sind {r}.', {r}) + ' ' + low};
  if (hi != null && val > hi) return {lvl:'info', text: head + t('typisch sind {r}.', {r}) + ' ' + high};
  return {lvl:'ok', text: head + t('im typischen Bereich ({r}).', {r})};
}

function adviceItems(cat, band, days, s){
  const items = [];
  if (cat === 'sleep'){
    if (s.total.length >= 2) items.push(cmp(mean(s.total) / 3.6e6, band.sleep, x => t('{h} h', {h:fmt1(x)}), t('Schlaf pro 24 Std. (Nacht + Nickerchen)'),
      t('Manche Babys brauchen weniger Schlaf – wirkt dein Baby wach und zufrieden und gedeiht gut, ist das meist unbedenklich. Sonst lohnt ein Blick auf Wachphasen und Abendroutine.'),
      t('Viel Schlaf ist selten ein Problem. Ist dein Baby aber auch schwer zu wecken oder trinkt schlecht, bitte ärztlich abklären.')));
    else items.push({lvl:'info', text:t('Für eine Auswertung der Schlafmenge „Aufgewacht“, „Eingeschlafen“ und die Nickerchen an mindestens 2 Tagen erfassen.')});
    if (band.bed && s.beds.length >= 2) items.push(cmp(mean(s.beds), band.bed, fmtMin, t('Einschlafzeit am Abend'),
      t('Ein früher Abend ist in diesem Alter häufig und völlig in Ordnung.'),
      t('Ein etwas früherer Schlafbeginn kann Übermüdung vorbeugen – viele Babys schlafen dann sogar ruhiger.')));
  }
  if (cat === 'nap'){
    if (band.naps && s.napDays >= 2) items.push(cmp(s.naps.length / s.napDays, band.naps, fmt1, t('Nickerchen pro Tag'),
      t('Weniger Nickerchen können auf zu lange Wachphasen hindeuten – auf Müdigkeitszeichen achten.'),
      t('Viele kurze Nickerchen sind häufig; sie werden mit der Zeit weniger und dafür länger.')));
    if (s.windows.length >= 3) items.push(cmp(mean(s.windows), band.wake, fmtWin, t('Wachphase zwischen zwei Schlafzeiten'),
      t('Kurze Wachphasen sind kein Problem, solange dein Baby gut einschläft.'),
      t('Zu lange Wachphasen führen leicht zu Übermüdung (schwereres Einschlafen, kürzere Nickerchen) – probier, etwas früher hinzulegen.')));
    else items.push({lvl:'info', text:t('Für die Auswertung der Wachphasen Nickerchen sowie „Aufgewacht“ und „Eingeschlafen“ erfassen.')});
    if (s.total.length >= 2) items.push(cmp(mean(s.total) / 3.6e6, band.sleep, x => t('{h} h', {h:fmt1(x)}), t('Schlaf pro 24 Std. (Nacht + Nickerchen)'),
      t('Wirkt dein Baby trotzdem zufrieden, ist das meist unbedenklich.'), t('Viel Schlaf ist selten ein Problem.')));
  }
  if (cat === 'diaper'){
    items.push(...stoolFlags(72));
    if (s.diaperDays >= 2 && days >= 5){
      const wet = s.diapers.filter(e => e.kind !== 'stool').length / s.diaperDays;
      items.push(cmp(wet, [band.wet, null], fmt1, t('Nasse Windeln pro Tag'),
        t('Weniger nasse Windeln können ein Zeichen sein, dass dein Baby zu wenig trinkt – besonders bei jungen Babys bitte mit Hebamme oder Kinderarzt sprechen. (Wird nicht jede Windel erfasst, ist der Wert natürlich zu niedrig.)'),
        '', days < 91 ? 'warn' : 'info'));
      const stools = s.diapers.filter(e => e.kind !== 'wet');
      if (days >= 4 && days < 42 && stools.length / s.diaperDays < 3)
        items.push({lvl:'info', text:t('<b>Stuhlgänge: Ø {n} pro Tag.</b> Gestillte Babys haben in den ersten ~6 Wochen meist 3 oder mehr. Deutlich weniger kann auf zu wenig Milch hindeuten – sprich mit deiner Hebamme (mit Fläschchennahrung ist weniger normal).', {n:fmt1(stools.length / s.diaperDays)})});
      if (stools.filter(e => e.cons === 'hard').length >= 2)
        items.push({lvl:'info', text:t('<b>Mehrmals harter Stuhl.</b> Auf ausreichend Flüssigkeit achten; mit Beikost helfen oft Birne, Pflaume oder Vollkorn. Bei Schmerzen, Blut oder wenn es anhält: Kinderarzt.')});
      const recentLiquid = stools.filter(e => e.cons === 'liquid' && e.start > Date.now() - 48*3600e3).length;
      if (days >= 42 && recentLiquid >= 3)
        items.push({lvl:'warn', text:t('<b>Häufig flüssiger Stuhl.</b> Auf genug Flüssigkeit achten. Bei Fieber, Erbrechen, Trinkschwäche, Teilnahmslosigkeit oder weniger nassen Windeln bitte zum Kinderarzt – Babys trocknen schnell aus.')});
    } else if (days < 5) items.push({lvl:'info', text:t('In den ersten Lebenstagen steigt die Zahl der nassen Windeln langsam an (etwa 1 pro Lebenstag); ab Tag 5 sind mindestens 6 pro Tag typisch.')});
    else items.push({lvl:'info', text:t('Für eine Auswertung die Windeln an mindestens 2 Tagen erfassen.')});
  }
  if (cat === 'feed'){
    if (s.feedDays >= 2) items.push(cmp(s.meals.length / s.feedDays, band.feeds, fmt1, t('Milchmahlzeiten pro Tag'),
      days < 28 ? t('Neugeborene sollten 8–12-mal in 24 Std. trinken. Schläfrige Babys ggf. zum Stillen wecken und mit der Hebamme sprechen.')
                : t('Weniger Mahlzeiten sind oft in Ordnung, wenn dein Baby gut zunimmt und genug nasse Windeln hat.'),
      t('Häufiges Trinken ist besonders bei Wachstumsschüben normal (Clusterfeeding).'), days < 28 ? 'warn' : 'info'));
    else items.push({lvl:'info', text:t('Für eine Auswertung die Mahlzeiten an mindestens 2 Tagen erfassen.')});
    if (days < 28 && s.recentMeals >= 4 && s.maxGap > 4*3600e3)
      items.push({lvl:'warn', text:t('<b>Längste Pause zwischen zwei Mahlzeiten (letzte 3 Tage): {x} h.</b> Bis das Geburtsgewicht wieder erreicht ist, sollten Neugeborene spätestens nach etwa 4 Stunden trinken – im Zweifel mit der Hebamme besprechen.', {x:fmtHM(s.maxGap)})});
    const l = s.feeds.filter(e => e.side === 'left').length, r = s.feeds.filter(e => e.side === 'right').length;
    if (l + r >= 8 && Math.max(l, r) / (l + r) > 0.7)
      items.push({lvl:'info', text:t('<b>Seiten ungleich verteilt</b> (links {l}×, rechts {r}×). Abwechselnd anlegen hilft, die Milchbildung auf beiden Seiten zu erhalten – die App schlägt jeweils die andere Seite vor.', {l, r})});
  }
  return items;
}

/* Farbskala Stuhlgang – angelehnt an die Stuhlfarbkarte im gelben Kinder-Untersuchungsheft.
   Bildschirmfarben weichen ab: im Zweifel mit der gedruckten Karte vergleichen bzw. ärztlich abklären. */
const STOOL_SCALE = [
  {c:'#2b2a1c', n:t('Schwarz-grün, zäh (Mekonium)'), t:t('Normal in den ersten 2–3 Lebenstagen'), lvl:'ok'},
  {c:'#d9a21b', n:t('Senfgelb, goldgelb'), t:t('Normal – typisch bei Muttermilch, oft flüssig und „körnig“'), lvl:'ok'},
  {c:'#b9852c', n:t('Gelbbraun, ocker'), t:t('Normal – häufig bei Fläschchennahrung'), lvl:'ok'},
  {c:'#7a4b1e', n:t('Braun'), t:t('Normal – vor allem mit Beikost'), lvl:'ok'},
  {c:'#6f7f26', n:t('Grün, grünlich'), t:t('Meist harmlos (z. B. Übergangsstuhl, Eisen, Nahrung). Bei Durchfall, Fieber oder Unwohlsein ärztlich abklären'), lvl:'ok'},
  {c:'#141414', n:t('Schwarz (nach den ersten Tagen)'), t:t('Bedenklich – ärztlich abklären (kann auf Blut hindeuten; Eisenpräparate färben ebenfalls dunkel)'), lvl:'warn'},
  {c:'#a3241d', n:t('Rot, blutig oder rote Streifen'), t:t('Bedenklich – ärztlich abklären (Ausnahme: nach Roter Bete o. Ä.)'), lvl:'warn'},
  {c:'#efe6b4', n:t('Blassgelb, sehr hell'), t:t('Alarmzeichen – sofort zum Kinderarzt'), lvl:'alert'},
  {c:'#d8d1bd', n:t('Lehmfarben, beige-grau'), t:t('Alarmzeichen – sofort zum Kinderarzt'), lvl:'alert'},
  {c:'#f4f1ea', n:t('Weißlich, kalkfarben'), t:t('Alarmzeichen – sofort zum Kinderarzt'), lvl:'alert'}
];
/* Kreisdiagramm als eigenständiges SVG: alle Farben stehen direkt in der Grafik (keine Abhängigkeit von CSS) */
const STOOL_LVL = {ok:{c:'#4f9a62', icon:'✅', t:t('unbedenklich')}, warn:{c:'#e0a028', icon:'⚠️', t:t('ärztlich abklären')}, alert:{c:'#d4483b', icon:'🚨', t:t('sofort zum Kinderarzt')}};
const isLight = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };
function arcPath(cx, cy, r0, r1, a0, a1){
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`, big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${big} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}
function stoolPieSvg(){
  const n = STOOL_SCALE.length, step = 2 * Math.PI / n, start = -Math.PI / 2, C = 160, gap = 0.012;
  let s = `<svg viewBox="0 0 320 320" width="100%" style="display:block;max-width:340px;margin:6px auto 0" role="img" aria-label="${t('Farbskala Stuhlgang')}">`;
  // äußerer Ring: Einordnung (grün / orange / rot)
  ['ok', 'warn', 'alert'].forEach(l => {
    const idx = STOOL_SCALE.map((x, i) => x.lvl === l ? i : -1).filter(i => i >= 0);
    s += `<path d="${arcPath(C, C, 136, 154, start + idx[0] * step + gap, start + (idx[idx.length - 1] + 1) * step - gap)}" fill="${STOOL_LVL[l].c}"/>`;
  });
  // Farbsegmente mit Nummer
  STOOL_SCALE.forEach((x, i) => {
    const a0 = start + i * step, a1 = a0 + step, am = (a0 + a1) / 2;
    s += `<path d="${arcPath(C, C, 58, 130, a0 + gap, a1 - gap)}" fill="${x.c}" stroke="#8a8178" stroke-opacity=".55" stroke-width="1"/>`;
    s += `<text x="${(C + 95 * Math.cos(am)).toFixed(1)}" y="${(C + 95 * Math.sin(am) + 6).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="700"
      font-family="-apple-system, sans-serif" fill="${isLight(x.c) ? '#2a2622' : '#ffffff'}">${i + 1}</text>`;
    if (x.lvl !== 'ok') s += `<text x="${(C + 145 * Math.cos(am)).toFixed(1)}" y="${(C + 145 * Math.sin(am) + 5).toFixed(1)}" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700" font-family="-apple-system, sans-serif">!</text>`;
  });
  s += `<text x="${C}" y="${C - 4}" text-anchor="middle" font-size="15" font-weight="700" font-family="-apple-system, sans-serif" style="fill:var(--ink)">${t('Stuhl-')}</text>
    <text x="${C}" y="${C + 15}" text-anchor="middle" font-size="15" font-weight="700" font-family="-apple-system, sans-serif" style="fill:var(--ink)">${t('farben')}</text></svg>`;
  return s;
}
const dotSvg = (fill, size) => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="flex:none;display:block" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="${fill}" stroke="#8a8178" stroke-opacity=".6" stroke-width="1"/></svg>`;
function stoolScaleHtml(){
  const row = 'display:flex;align-items:center;gap:10px;padding:7px 8px;margin-top:6px;border-radius:12px;';
  return `<div class="sscale"><div class="lbl" style="margin-top:14px">${t('Farbskala Stuhlgang')}</div>
    ${stoolPieSvg()}
    <div style="display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;font-size:13px;margin:6px 0 8px">
      ${Object.values(STOOL_LVL).map(l => `<span style="display:inline-flex;align-items:center;gap:5px">${dotSvg(l.c, 14)}${l.t}</span>`).join('')}</div>
    ${STOOL_SCALE.map((s, i) => `<div style="${row}border-inline-start:4px solid ${STOOL_LVL[s.lvl].c}">
      <span style="position:relative;flex:none;width:32px;height:32px">${dotSvg(s.c, 32)}
        <b style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;color:${isLight(s.c) ? '#2a2622' : '#fff'}">${i + 1}</b></span>
      <span style="flex:1;min-width:0;font-size:14px;line-height:1.35"><b${s.lvl === 'alert' ? ` style="color:${STOOL_LVL.alert.c}"` : ''}>${s.n}</b>
        <small style="display:block;color:var(--muted);font-size:12.5px">${s.t}</small></span>
      <span style="flex:none;font-size:18px">${STOOL_LVL[s.lvl].icon}</span></div>`).join('')}
    <div class="disc">${t('Helle, weißliche oder graue Stühle können in den ersten Lebenswochen auf eine Gallengangsatresie hinweisen – diese Lebererkrankung muss sehr früh behandelt werden. Vergleiche im Zweifel mit der gedruckten Stuhlfarbkarte im gelben Kinder-Untersuchungsheft; Farben auf dem Bildschirm können abweichen.')}</div></div>`;
}

function adviceHtml(type){
  const cat = type === 'wake' || type === 'night' ? 'sleep' : type;
  const camBtn = cat === 'diaper' ? `<button class="btn primary wide" data-stoolcam="1">📷 ${t('Stuhlfarbe per Foto prüfen')}</button>` : '';
  if (!curBaby().birth) return `<div class="panel"><h4>💡 ${t('Altersgerechte Tipps')}</h4>
    <div class="muted">${t('Trag das Geburtsdatum ein, dann bekommst du hier Tipps und Orientierungswerte passend zum Alter deines Babys.')}</div>
    <button class="btn wide" data-go="birth">${t('Geburtsdatum eintragen')}</button>
    ${camBtn}
    ${cat === 'diaper' ? `<details class="advtips"><summary>${t('Farbskala Stuhlgang')}</summary>${stoolScaleHtml()}</details>` : ''}</div>`;
  const days = ageDays();
  if (days < 0) return '';
  const band = bandFor(days), s = adviceStats();
  const items = adviceItems(cat, band, days, s);
  const icon = {ok:'✅', info:'💡', warn:'⚠️', alert:'🚨'};
  return `<div class="panel"><h4>💡 ${t('Tipps')} · ${esc(ageText())} (${t('{n}. Lebensmonat', {n:lebensmonat()})})</h4>
    <div class="muted" style="margin-bottom:6px">${t('Auswertung der letzten 7 Tage im Vergleich zu typischen Werten für {x}:', {x:band.label})}</div>
    ${items.map(i => `<div class="adv ${i.lvl}"><span>${icon[i.lvl]}</span><span>${i.text}</span></div>`).join('')}
    ${camBtn}
    <details class="advtips"><summary>${cat === 'diaper' ? t('Allgemeine Tipps für dieses Alter & Farbskala Stuhlgang') : t('Allgemeine Tipps für dieses Alter')}</summary>
      <ul>${band.tips[cat].map(x => `<li>${x}</li>`).join('')}</ul>${cat === 'diaper' ? stoolScaleHtml() : ''}</details>
    <div class="disc">${t('Allgemeine Orientierungswerte – jedes Kind ist anders. Kein Ersatz für ärztlichen Rat. Bei Sorgen: Kinderarzt oder Hebamme; nachts/am Wochenende ärztlicher Bereitschaftsdienst 116 117, im Notfall 112.')}</div></div>`;
}
