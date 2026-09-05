/* Tests de la logique de classification de Ploufplouf.
   Lancement : node --test test/
   La logique vit dans index.html (fichier unique, volontairement) entre les
   marqueurs BEGIN / END LOGIQUE PURE. On l'extrait ici pour la tester sans
   navigateur et sans réseau. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(RACINE, 'index.html'), 'utf8');

const debut = source.indexOf('/* ---------- 1. CONFIGURATION');
const fin = source.indexOf('/* ==================== END LOGIQUE PURE');
assert.ok(debut > 0 && fin > debut, 'les marqueurs de la logique pure sont introuvables dans index.html');

const code = source.slice(debut, fin);
const M = new Function(code + `
  return { SEUILS, NB_CRENEAUX, CATEGORIES, joursDansMois, jourSemaine,
           minutesDepuisMinuit, dureeJourDansFenetre, grouperHeuresParJour,
           calculerMesures, deriver, classerJour, encoderJour, decoderJour,
           fusionnerJours, calculerBilan, formaterDuree };
`)();

/* --- Fabrique de journées : pluie et soleil donnés créneau par créneau --- */
function jour(options) {
  const n = M.NB_CRENEAUX;
  const pluieMm = options.pluie || new Array(n).fill(0);
  const soleilMin = options.soleil === null ? null : (options.soleil || new Array(n).fill(0));
  return {
    date: options.date || '2024-06-21',
    pluieDixiemes: pluieMm.map((v) => (v === null ? null : Math.round(v * 10))),
    soleilMinutes: soleilMin,
    nuagesMoyens: options.nuages === undefined ? 50 : options.nuages,
    tmax: options.tmax === undefined ? 22 : options.tmax,
    tmin: options.tmin === undefined ? 12 : options.tmin,
    dureeJourMin: options.dureeJour === undefined ? 840 : options.dureeJour,
    creneaux: options.creneaux === undefined ? n : options.creneaux,
    partiel: !!options.partiel,
    estime: false
  };
}
const repete = (v, n = M.NB_CRENEAUX) => new Array(n).fill(v);

/* ============ Les catégories ============ */

test('journée d’été sans pluie et plein de soleil → grand soleil', () => {
  const v = M.classerJour(jour({ pluie: repete(0), soleil: repete(60), dureeJour: 840, tmax: 28 }));
  assert.equal(v.categorie, 'soleil');
  assert.equal(v.derive.heuresPluie, 0);
});

test('15 novembre sec mais bouché → gris, mais sec (et surtout pas éclaircies)', () => {
  const soleil = repete(0);
  soleil[5] = 12;                               // douze minutes de soleil dans la journée
  const v = M.classerJour(jour({ date: '2024-11-15', pluie: repete(0), soleil, dureeJour: 555, tmax: 11, tmin: 6 }));
  assert.equal(v.categorie, 'gris');
});

test('deux heures d’averse puis ciel dégagé → averse passagère', () => {
  const pluie = repete(0);
  pluie[4] = 3.2; pluie[5] = 2.8;               // 6 mm sur deux heures
  const soleil = repete(50); soleil[4] = 0; soleil[5] = 0;
  const v = M.classerJour(jour({ pluie, soleil }));
  assert.equal(v.categorie, 'averse');
  assert.equal(v.derive.heuresPluie, 2);
  assert.equal(v.derive.pluieTotale, 6);
});

test('sept heures à 0,2 mm → crachin, pas « pluie toute la journée »', () => {
  const pluie = repete(0);
  for (let i = 2; i < 9; i++) pluie[i] = 0.2;   // 1,4 mm étalés sur sept heures
  const v = M.classerJour(jour({ pluie, soleil: repete(5) }));
  assert.equal(v.categorie, 'crachin');
  assert.equal(v.derive.heuresPluie, 7);
});

test('huit heures de vraie pluie → pluie toute la journée', () => {
  const pluie = repete(0);
  for (let i = 2; i < 10; i++) pluie[i] = 2;
  const v = M.classerJour(jour({ pluie, soleil: repete(0) }));
  assert.equal(v.categorie, 'continue');
});

test('trois heures de pluie → la case ajoutée « pluie par moments »', () => {
  const pluie = repete(0);
  pluie[3] = 1.5; pluie[7] = 1.2; pluie[10] = 1.4;
  const v = M.classerJour(jour({ pluie, soleil: repete(30) }));
  assert.equal(v.categorie, 'moments');
  assert.equal(v.derive.heuresPluie, 3);
});

test('bruine sous le seuil : six heures à 0,1 mm ne font pas une heure de pluie', () => {
  const pluie = repete(0);
  for (let i = 3; i < 9; i++) pluie[i] = 0.1;
  const v = M.classerJour(jour({ pluie, soleil: repete(2), dureeJour: 600 }));
  assert.equal(v.derive.heuresPluie, 0, 'une heure ne compte qu’à partir de 0,2 mm');
  assert.equal(v.categorie, 'gris');
  assert.ok(v.badges.includes('gouttes'), 'la trace de pluie doit rester visible via le badge');
});

/* ============ Le dénominateur du soleil ============ */

test('journée d’hiver entièrement ensoleillée → grand soleil (le dénominateur est la durée du jour)', () => {
  const soleil = repete(0);
  for (let i = 2; i < 10; i++) soleil[i] = 60;   // 8 h de soleil
  const v = M.classerJour(jour({ date: '2024-12-21', pluie: repete(0), soleil, dureeJour: 519, tmax: 9, tmin: 2 }));
  assert.equal(v.categorie, 'soleil');
  // Contrôle du piège : rapporté aux 14 h de la fenêtre, ce serait 57 % et la
  // journée basculerait en « éclaircies ». Aucune journée d'hiver ne pourrait
  // alors jamais être ensoleillée.
  assert.ok(480 / 840 < M.SEUILS.SUN_FULL);
  assert.ok(480 / 519 >= M.SEUILS.SUN_FULL);
});

/* ============ Badges ============ */

test('canicule et gel sont des badges, jamais des catégories', () => {
  const chaud = M.classerJour(jour({ pluie: repete(0), soleil: repete(58), tmax: 38, tmin: 22 }));
  assert.equal(chaud.categorie, 'soleil', 'une journée de canicule reste une journée de grand soleil');
  assert.ok(chaud.badges.includes('canicule'));

  const gele = M.classerJour(jour({ pluie: repete(0), soleil: repete(55), dureeJour: 540, tmax: 6, tmin: -3 }));
  assert.ok(gele.badges.includes('gel'));
});

test('grosse averse : badge orage au-delà de 8 mm en une heure', () => {
  const pluie = repete(0);
  pluie[6] = 14;
  const v = M.classerJour(jour({ pluie, soleil: repete(45) }));
  assert.equal(v.categorie, 'averse');
  assert.ok(v.badges.includes('orage'));
});

/* ============ Données manquantes ============ */

test('moins de douze créneaux renseignés → journée écartée', () => {
  const v = M.classerJour(jour({ pluie: repete(0), creneaux: 8 }));
  assert.equal(v.categorie, 'inconnu');
});

test('un trou de données n’est jamais compté comme une heure sèche', () => {
  const pluie = repete(0);
  for (let i = 0; i < 3; i++) pluie[i] = null;
  const m = jour({ pluie, creneaux: 11 });
  assert.equal(M.classerJour(m).categorie, 'inconnu');
});

/* ============ Le changement d’heure ============ */

test('le dimanche de mars n’a que 23 heures — le regroupement reste juste', () => {
  const time = [], precipitation = [], sunshine = [], cloud = [];
  for (let h = 0; h < 24; h++) {
    if (h === 2) continue;                        // 02 h n'existe pas ce jour-là
    const hh = String(h).padStart(2, '0');
    time.push(`2024-03-31T${hh}:00`);
    precipitation.push(0);
    sunshine.push(h >= 8 && h <= 19 ? 3600 : 0);
    cloud.push(10);
  }
  const parJour = M.grouperHeuresParJour({ time, precipitation, sunshine_duration: sunshine, cloud_cover: cloud });
  const j = parJour['2024-03-31'];
  assert.ok(j, 'la journée doit exister');
  assert.equal(j.heuresVues, 23);
  assert.equal(j.pluie.filter((v) => v !== null).length, M.NB_CRENEAUX,
    'les 14 créneaux de la fenêtre doivent tous être renseignés malgré l’heure manquante');
});

test('le dimanche d’octobre a 25 heures — la fenêtre diurne n’est pas décalée', () => {
  const time = [], precipitation = [], sunshine = [], cloud = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    time.push(`2024-10-27T${hh}:00`);
    precipitation.push(h === 9 ? 5 : 0);
    sunshine.push(0);
    cloud.push(90);
    if (h === 2) {                                // l'heure 02 h est vécue deux fois
      time.push('2024-10-27T02:00');
      precipitation.push(0); sunshine.push(0); cloud.push(90);
    }
  }
  const parJour = M.grouperHeuresParJour({ time, precipitation, sunshine_duration: sunshine, cloud_cover: cloud });
  const j = parJour['2024-10-27'];
  assert.equal(j.heuresVues, 25);
  assert.equal(j.pluie[9 - 8], 5, 'la pluie de 9 h doit rester au créneau de 9 h');
});

test('les heures nocturnes n’entrent jamais dans la fenêtre', () => {
  const time = [], precipitation = [], sunshine = [], cloud = [];
  for (let h = 0; h < 24; h++) {
    time.push(`2024-02-10T${String(h).padStart(2, '0')}:00`);
    precipitation.push(h < 7 || h > 21 ? 9 : 0);   // déluge nocturne
    sunshine.push(h >= 9 && h <= 17 ? 3600 : 0);
    cloud.push(5);
  }
  const parJour = M.grouperHeuresParJour({ time, precipitation, sunshine_duration: sunshine, cloud_cover: cloud });
  const mesures = M.calculerMesures(parJour['2024-02-10'],
    { tmax: 12, tmin: 4, sunrise: '2024-02-10T08:15', sunset: '2024-02-10T18:20', precipitation_sum: 63 }, false);
  const v = M.classerJour(mesures);
  assert.equal(v.derive.pluieTotale, 0, 'la pluie de la nuit ne doit pas compter');
  assert.equal(v.categorie, 'soleil', 'la règle d’or : une nuit de pluie ne gâche pas une journée ensoleillée');
});

/* ============ Durée du jour ============ */

test('la durée du jour est rognée aux bornes de la fenêtre', () => {
  // 21 juin : il fait jour de 6 h 14 à 21 h 58, mais la fenêtre s'arrête à 21 h.
  assert.equal(M.dureeJourDansFenetre('2024-06-21T06:14', '2024-06-21T21:58'), 14 * 60);
  // 21 décembre : le jour est entièrement contenu dans la fenêtre.
  assert.equal(M.dureeJourDansFenetre('2024-12-21T08:41', '2024-12-21T17:20'), 8 * 60 + 39);
});

/* ============ Dates, sans objet Date ============ */

test('jour de la semaine et longueur des mois', () => {
  assert.equal(M.jourSemaine('2024-01-01'), 0, '1er janvier 2024 = lundi');
  assert.equal(M.jourSemaine('2026-09-05'), 5, '5 septembre 2026 = samedi');
  assert.equal(M.joursDansMois(2024, 2), 29);
  assert.equal(M.joursDansMois(2025, 2), 28);
  assert.equal(M.joursDansMois(2000, 2), 29);
  assert.equal(M.joursDansMois(1900, 2), 28);
});

/* ============ Cache ============ */

test('encodage puis décodage rendent les mêmes mesures', () => {
  const pluie = repete(0);
  pluie[3] = 2.4; pluie[4] = 0.1;
  const soleil = repete(45); soleil[0] = null;
  const original = jour({ date: '2024-05-08', pluie, soleil, tmax: 24.3, tmin: 11.7, dureeJour: 802 });
  const relu = M.decoderJour(M.encoderJour(original), '2024');
  assert.equal(relu.date, '2024-05-08');
  assert.deepEqual(relu.pluieDixiemes, original.pluieDixiemes);
  assert.deepEqual(relu.soleilMinutes, original.soleilMinutes);
  assert.equal(relu.tmax, 24.3);
  assert.equal(relu.tmin, 11.7);
  assert.equal(relu.dureeJourMin, 802);
  assert.equal(M.classerJour(relu).categorie, M.classerJour(original).categorie);
});

test('une ligne de cache abîmée renvoie null au lieu de faire tomber l’application', () => {
  assert.equal(M.decoderJour('n’importe quoi', '2024'), null);
  assert.equal(M.decoderJour('', '2024'), null);
});

/* ============ Fusion archive / récent ============ */

test('sur la zone de recouvrement, l’archive l’emporte', () => {
  const archive = { '2026-08-01': jour({ date: '2026-08-01', pluie: repete(0) }) };
  const recent = {
    '2026-08-01': jour({ date: '2026-08-01', pluie: repete(3) }),   // même jour, autre modèle
    '2026-09-03': jour({ date: '2026-09-03', pluie: repete(0) })    // hors zone d'archive
  };
  const fusion = M.fusionnerJours(archive, recent, '2026-08-29');
  assert.equal(M.deriver(fusion['2026-08-01']).pluieTotale, 0, 'la version de l’archive doit survivre');
  assert.ok(fusion['2026-09-03'], 'les jours postérieurs à l’archive doivent être ajoutés');
});

/* ============ Bilan ============ */

test('le bilan écarte les journées en cours et les journées sans données', () => {
  const jours = {
    '2026-01-01': jour({ date: '2026-01-01', pluie: repete(0), soleil: repete(60), dureeJour: 540 }),
    '2026-01-02': jour({ date: '2026-01-02', pluie: repete(2), soleil: repete(0) }),
    '2026-01-03': jour({ date: '2026-01-03', pluie: repete(0), creneaux: 4 }),
    '2026-01-04': jour({ date: '2026-01-04', pluie: repete(0), soleil: repete(60), partiel: true })
  };
  const bilan = M.calculerBilan(jours, null);
  assert.equal(bilan.mesures, 2, 'seules deux journées sont exploitables');
  assert.equal(bilan.ecartes, 2);
  assert.equal(bilan.comptes.soleil, 1);
  assert.equal(bilan.comptes.continue, 1);
  assert.equal(bilan.joursSecs, 1);
});

test('le filtre de période ne retient que les jours demandés', () => {
  const jours = {
    '2026-01-10': jour({ date: '2026-01-10', pluie: repete(0), soleil: repete(60), dureeJour: 540 }),
    '2026-07-10': jour({ date: '2026-07-10', pluie: repete(0), soleil: repete(60) })
  };
  const ete = M.calculerBilan(jours, (iso) => +iso.slice(5, 7) >= 6 && +iso.slice(5, 7) <= 9);
  assert.equal(ete.mesures, 1);
});

/* ============ Affichage ============ */

test('les durées se lisent en heures et minutes', () => {
  assert.equal(M.formaterDuree(519), '8 h 39');
  assert.equal(M.formaterDuree(840), '14 h');
  assert.equal(M.formaterDuree(45), '45 min');
});
