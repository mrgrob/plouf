/* Aperçu hors ligne de Ploufplouf.
   Le proxy de l'environnement de développement bloque open-meteo.com : ce
   script intercepte les appels réseau et répond avec des données FABRIQUÉES,
   uniquement pour vérifier le rendu des quatre écrans. Il ne sert jamais à
   valider les chiffres — les vrais chiffres viennent de l'API, dans le
   navigateur de l'utilisatrice.
   Usage : NODE_PATH=/opt/node22/lib/node_modules node outils/apercu.mjs */

/* Playwright peut être installé localement ou globalement selon la machine. */
const pw = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.js'));
const chromium = pw.chromium || (pw.default && pw.default.chromium);
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'apercu');
mkdirSync(SORTIE, { recursive: true });

/* ---- Générateur pseudo-aléatoire reproductible ---- */
function graine(n) {
  /* splitmix32 : deux germes qui se suivent doivent donner des suites sans
     rapport. Un générateur congruentiel simple donnait des mois entiers de
     la même couleur, les germes de deux jours voisins ne différant que de 1. */
  let s = (n >>> 0) + 0x9E3779B9;
  return function () {
    s = (s + 0x9E3779B9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    t = (t ^ (t >>> 15)) >>> 0;
    return t / 4294967296;
  };
}

function jourDeLAnnee(iso) {
  const a = +iso.slice(0, 4), m = +iso.slice(5, 7), j = +iso.slice(8, 10);
  const cumul = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const bissextile = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  return cumul[m - 1] + j + (bissextile && m > 2 ? 1 : 0);
}

/* Lever et coucher approchés pour la latitude de Bordeaux. */
function soleil(iso) {
  const n = jourDeLAnnee(iso);
  const lat = 44.91 * Math.PI / 180;
  const dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (n - 81) / 365);
  const cosH = -Math.tan(lat) * Math.tan(dec);
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) * 180 / Math.PI / 15;
  const mois = +iso.slice(5, 7);
  const midi = (mois >= 4 && mois <= 10) ? 13.9 : 12.9;      // heure d'été / heure d'hiver
  return { lever: midi - H, coucher: midi + H, duree: 2 * H };
}

function hhmm(heures) {
  const h = Math.floor(heures), m = Math.round((heures - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/* Une journée fabriquée, avec des saisons crédibles pour la Gironde. */
function fabriquerJour(iso, rnd) {
  const mois = +iso.slice(5, 7);
  const s = soleil(iso);
  const hiver = mois >= 11 || mois <= 2;
  const ete = mois >= 6 && mois <= 8;
  const tirage = rnd();

  let profil;
  if (hiver) {
    profil = tirage < 0.28 ? 'gris' : tirage < 0.38 ? 'crachin' : tirage < 0.46 ? 'continue'
           : tirage < 0.56 ? 'moments' : tirage < 0.66 ? 'averse' : tirage < 0.90 ? 'eclaircies' : 'soleil';
  } else if (ete) {
    profil = tirage < 0.55 ? 'soleil' : tirage < 0.80 ? 'eclaircies' : tirage < 0.88 ? 'averse'
           : tirage < 0.94 ? 'gris' : tirage < 0.98 ? 'moments' : 'continue';
  } else {
    profil = tirage < 0.28 ? 'soleil' : tirage < 0.58 ? 'eclaircies' : tirage < 0.72 ? 'gris'
           : tirage < 0.84 ? 'averse' : tirage < 0.92 ? 'moments' : tirage < 0.96 ? 'crachin' : 'continue';
  }

  const pluie = new Array(24).fill(0);
  const ensoleillement = new Array(24).fill(0);

  // Pluie de nuit sur une journée sur quatre : c'est elle que la règle d'or ignore.
  if (rnd() < 0.25) {
    const debut = Math.floor(rnd() * 5);
    for (let h = debut; h < debut + 3; h++) pluie[h] = 0.4 + rnd() * 2.5;
  }

  const placer = (nb, mini, maxi) => {
    let pose = 0, essais = 0;
    while (pose < nb && essais < 60) {
      essais++;
      const h = 8 + Math.floor(rnd() * 14);
      if (pluie[h] > 0) continue;
      pluie[h] = mini + rnd() * (maxi - mini);
      pose++;
    }
  };
  if (profil === 'averse') placer(1 + Math.floor(rnd() * 2), 1.2, 7);
  if (profil === 'moments') placer(3 + Math.floor(rnd() * 2), 0.4, 3);
  if (profil === 'crachin') placer(5 + Math.floor(rnd() * 3), 0.2, 0.3);
  if (profil === 'continue') placer(6 + Math.floor(rnd() * 5), 0.6, 4);

  const partSoleil = { soleil: 0.92, eclaircies: 0.45, gris: 0.06, averse: 0.55,
                       moments: 0.3, crachin: 0.05, continue: 0.03 }[profil];
  for (let h = 0; h < 24; h++) {
    const dansLeJour = h - 0.5 > s.lever && h - 0.5 < s.coucher;   // le créneau h couvre (h-1, h)
    if (!dansLeJour) continue;
    const bords = (h - 0.5 - s.lever < 1 || s.coucher - h + 0.5 < 1) ? 0.5 : 1;
    ensoleillement[h] = pluie[h] > 0.2 ? 0 : Math.round(3600 * partSoleil * bords * (0.75 + rnd() * 0.35));
    if (ensoleillement[h] > 3600) ensoleillement[h] = 3600;
  }

  const base = 13 - 9 * Math.cos(2 * Math.PI * (jourDeLAnnee(iso) - 15) / 365);
  const canicule = ete && rnd() < 0.035;
  const tmax = Math.round((base + 6 + (canicule ? 14 : 0) + (partSoleil - 0.4) * 6 + rnd() * 3) * 10) / 10;
  const tmin = Math.round((base - 3 - (profil === 'soleil' && hiver ? 4 : 0) + rnd() * 2) * 10) / 10;

  return { pluie, ensoleillement, tmax, tmin, s };
}

function fabriquerReponse(debut, fin, lat, lon) {
  const time = [], precipitation = [], sunshine = [], cloud = [];
  const dTime = [], tmaxs = [], tmins = [], levers = [], couchers = [], sommes = [];
  let iso = debut;
  while (iso <= fin) {
    const graineJour = (+iso.slice(0, 4) * 10000 + +iso.slice(5, 7) * 100 + +iso.slice(8, 10)) ^ Math.round(lat * 100);
    const rnd = graine(graineJour);
    const j = fabriquerJour(iso, rnd);
    let somme = 0;
    for (let h = 0; h < 24; h++) {
      time.push(iso + 'T' + String(h).padStart(2, '0') + ':00');
      const mm = Math.round(j.pluie[h] * 10) / 10;
      precipitation.push(mm);
      somme += mm;
      sunshine.push(j.ensoleillement[h]);
      cloud.push(j.ensoleillement[h] > 1800 ? 15 + Math.round(rnd() * 20) : 70 + Math.round(rnd() * 30));
    }
    dTime.push(iso);
    tmaxs.push(j.tmax);
    tmins.push(j.tmin);
    levers.push(iso + 'T' + hhmm(j.s.lever));
    couchers.push(iso + 'T' + hhmm(j.s.coucher));
    sommes.push(Math.round(somme * 10) / 10);
    iso = jourSuivant(iso);
  }
  return {
    latitude: lat, longitude: lon, timezone: 'Europe/Paris',
    hourly: { time, precipitation, sunshine_duration: sunshine, cloud_cover: cloud },
    daily: { time: dTime, temperature_2m_max: tmaxs, temperature_2m_min: tmins,
             sunrise: levers, sunset: couchers, precipitation_sum: sommes }
  };
}

function jourSuivant(iso) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function decaler(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris'
});

await contexte.route('**/*open-meteo.com/**', async (route) => {
  const url = new URL(route.request().url());
  const lat = +url.searchParams.get('latitude');
  const lon = +url.searchParams.get('longitude');
  const aujourdhui = new Date().toISOString().slice(0, 10);
  let debut, fin;
  if (url.searchParams.has('past_days')) {
    debut = decaler(aujourdhui, -(+url.searchParams.get('past_days')));
    fin = aujourdhui;
  } else {
    debut = url.searchParams.get('start_date');
    fin = url.searchParams.get('end_date');
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fabriquerReponse(debut, fin, lat, lon))
  });
});

const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

await page.goto('file://' + join(RACINE, 'index.html'));
await page.waitForFunction(() => document.querySelectorAll('#mosaique .case').length > 300, null, { timeout: 30000 });
/* Bandeau bien visible : ces captures ne doivent jamais être prises pour
   de vrais relevés si elles circulent hors de leur contexte. */
await page.evaluate(() => {
  const b = document.createElement('div');
  b.className = 'bandeau alerte';
  b.innerHTML = '<strong>Aperçu de mise en page.</strong> Les chiffres affichés sont FABRIQUÉS pour tester l’affichage — ce ne sont pas de vrais relevés météo.';
  document.getElementById('bandeaux').appendChild(b);
});
await page.selectOption('#choix-annee', String(new Date().getFullYear() - 1));
await page.waitForTimeout(800);

/* Icônes PNG, rendues depuis le SVG par le même navigateur. */
const svg = readFileSync(join(RACINE, 'icone.svg'), 'utf8');
for (const taille of [192, 512]) {
  const pageIcone = await contexte.newPage();
  await pageIcone.setViewportSize({ width: taille, height: taille });
  await pageIcone.setContent(`<body style="margin:0">${svg.replace('<svg', `<svg width="${taille}" height="${taille}"`)}</body>`);
  await pageIcone.screenshot({ path: join(RACINE, 'icone-' + taille + '.png'), omitBackground: true });
  await pageIcone.close();
}

const captures = [];
async function capturer(nom, onglet, avant) {
  if (onglet) await page.click(`.onglets button[data-vue="${onglet}"]`);
  if (avant) await avant();
  await page.waitForTimeout(400);
  const chemin = join(SORTIE, nom + '.png');
  await page.screenshot({ path: chemin, fullPage: false });
  captures.push(chemin);
}

await capturer('1-calendrier', 'calendrier');
await capturer('2-detail', null, async () => {
  // Une journée pluvieuse : c'est là que le graphique horaire a quelque chose à montrer.
  await page.evaluate(() => {
    const cases = [...document.querySelectorAll('#mosaique .case[aria-label]')];
    const cible = cases.find((c) => /Pluie par moments|Pluie toute la journée/.test(c.getAttribute('aria-label')))
      || cases[200];
    cible.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('detail-jour').scrollIntoView());
});
await capturer('3-gros-carreaux', null, async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#btn-mode-mois');
});
await capturer('4-temperatures', 'temperatures');
await capturer('5-bilan', 'bilan');
await capturer('6-comparaison', null, async () => {
  await page.click('#compare-boutons button[data-ville-id="marseille"]');
  await page.click('#compare-boutons button[data-ville-id="grenoble"]');
  await page.click('#compare-boutons button[data-ville-id="poitiers"]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.getElementById('compare-resultat').scrollIntoView());
});
await capturer('7-methodologie', 'methodo');
await capturer('8-diagnostic', null, async () => {
  await page.evaluate(() => document.getElementById('diagnostic').scrollIntoView());
});

const villes = await page.evaluate(() =>
  [...document.querySelectorAll('#choix-ville option')].map((o) => o.textContent).join(', '));
console.log('\n--- Villes proposées ---\n' + villes);
const compare = await page.evaluate(() =>
  [...document.querySelectorAll('#compare-resultat .compare-ligne .nom')].map((n) => n.textContent).join(', '));
console.log('\n--- Villes comparées (chargées) ---\n' + compare);
const diagnostic = await page.evaluate(() => document.getElementById('diagnostic').textContent);
const bilan = await page.evaluate(() => document.getElementById('bilan-chiffres').textContent.slice(0, 260));

await navigateur.close();

console.log('Captures écrites :');
captures.forEach((c) => console.log('  ' + c));
console.log('\n--- Panneau de diagnostic (sur données fabriquées) ---\n' + diagnostic);
console.log('\n--- Bilan affiché ---\n' + bilan);
if (erreurs.length) {
  console.log('\n!!! Erreurs JavaScript :');
  erreurs.forEach((e) => console.log('  ' + e));
  process.exitCode = 1;
} else {
  console.log('\nAucune erreur JavaScript.');
}
