# Ploufplouf

**La météo réelle de Blanquefort, jour par jour** — pour répondre une bonne fois à
« il pleut tout le temps à Bordeaux ».

Une averse de vingt minutes suivie de ciel bleu n'a rien à voir avec dix heures de
crachin. Et la pluie qui tombe pendant qu'on dort ne gêne personne. Ploufplouf
applique donc une règle simple à chaque journée : **on ne compte que ce qui tombe
entre 7 h et 21 h**, et on classe la journée selon le nombre d'heures de pluie,
pas selon la quantité d'eau.

C'est une page web statique : aucun serveur, aucun compte, aucun abonnement.
Les chiffres viennent directement d'Open-Meteo, dans le navigateur.

---

## L'ouvrir

**Le plus simple** — double-cliquer sur `index.html`. Ça marche hors de tout
serveur, y compris depuis une clé USB.

**Sur téléphone** — il faut une adresse internet (voir ci-dessous) : Android rend
l'ouverture d'un fichier local pénible, et l'installation sur l'écran d'accueil
impossible.

Au premier lancement, l'application télécharge trois ans d'historique : une
dizaine de secondes. Ensuite tout est gardé dans la mémoire du navigateur et
l'ouverture est instantanée.

## La mettre en ligne (gratuit, deux minutes)

1. Aller sur <https://app.netlify.com/drop>.
2. Y glisser le dossier entier (celui qui contient `index.html`).
3. Netlify affiche une adresse du type `https://quelquechose.netlify.app` — c'est
   le lien à envoyer.

Le code source reste privé : seul le dossier déposé est public. Cloudflare Pages
fait la même chose. GitHub Pages aussi, mais **seulement depuis un dépôt public**
(il est payant sur un dépôt privé).

## L'installer sur Android

Une fois l'application en ligne :

1. Ouvrir le lien dans **Chrome**.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).

Elle se comporte alors comme une vraie application : icône sur l'écran d'accueil,
plein écran sans barre d'adresse, et **elle s'ouvre même sans connexion** (avec
les données déjà chargées).

**Et un vrai fichier APK ?** Coller l'adresse du site sur
<https://www.pwabuilder.com> : le site fabrique un APK Android signé,
gratuitement, à partir de la page en ligne. Utile seulement pour distribuer
l'application hors du navigateur — l'installation ci-dessus suffit dans la vie
courante.

---

## Comment une journée est classée

Tout est expliqué en détail dans l'onglet **Méthode** de l'application, seuils
compris. En résumé :

| Vignette | Ce qu'elle veut dire |
|---|---|
| 🔥 Canicule | 35 °C ou plus. Passe devant le ciel : c'est la chaleur qui fait la journée |
| ☀️ Grand soleil | pas un millimètre, et le soleil se montre plus de 25 % de la durée du jour |
| 🌥️ Gris, mais sec | il n'a pas plu, mais le soleil est resté sous 25 % |
| 🌦️ Averse passagère | de la pluie sur quatre heures au plus, dégagé le reste du temps |
| 🌫️ Crachin | cinq heures de pluie ou plus, mais moins de 2 mm au total |
| ☔ Pluie toute la journée | cinq heures de pluie ou plus, et plus de 2 mm |

Le gel, l'orage et les simples gouttes s'ajoutent en **badges** sur la vignette,
de même que la forte chaleur entre 32 et 35 °C. Sous une vignette 🔥, le détail
du jour rappelle toujours le ciel qu'il faisait — une journée caniculaire est
presque toujours une journée de grand soleil.

Deux points de méthode qui changent tout, et qui ne sont pas évidents :

- **Une heure ne compte comme pluvieuse qu'à partir de 0,2 mm.** En dessous, les
  modèles météo produisent énormément de bruine fantôme qu'aucun pluviomètre
  n'enregistrerait. Bonus : 0,2 mm × 5 h = 1 mm, exactement la définition du
  « jour de pluie » de Météo-France.
- **Le pourcentage de soleil est rapporté à la durée du jour, pas aux 14 heures
  de la fenêtre.** Sinon, un 21 décembre de ciel bleu absolu plafonnerait à 62 %
  et aucune journée d'hiver ne pourrait jamais être ensoleillée.

## Ajouter une ville

Dans `index.html`, chercher `var VILLES` (vers le début du script) et ajouter une
ligne :

```js
{ id: 'saintemilion', nom: 'Saint-Émilion', dep: 'Gironde', lat: 44.89, lon: -0.15 },
```

Les coordonnées se trouvent en cherchant la commune sur
<https://geocoding-api.open-meteo.com/v1/search?name=Saint-Emilion&country=FR>.
Attention : il existe **plusieurs Blanquefort en France** (Gironde, Gers,
Lot-et-Garonne) — vérifier le département.

## Changer un seuil

Tout est dans l'objet `SEUILS`, au même endroit. Après une modification,
incrémenter `RULES_VERSION` juste au-dessus : les journées sont reclassées
immédiatement, **sans retélécharger quoi que ce soit** (le cache garde les
mesures, jamais les étiquettes). L'onglet Méthode affiche automatiquement les
nouveaux chiffres — il lit les seuils dans le code, il ne les recopie pas.

---

## Pour développer

```sh
node --test test/classification.test.mjs   # 23 tests de l'algorithme
node outils/apercu.mjs                     # captures des 4 écrans, sans réseau
```

`outils/apercu.mjs` ouvre l'application dans Chromium avec des données
**fabriquées** (le réseau est intercepté) et écrit huit captures dans `apercu/`.
Il régénère aussi les icônes PNG à partir de `icone.svg`. Les chiffres de ces
captures ne sont pas de vrais relevés — un bandeau le rappelle dessus.

La logique de classification vit dans `index.html` entre les marqueurs
`BEGIN LOGIQUE PURE` et `END LOGIQUE PURE` ; le fichier de tests l'extrait pour
la faire tourner sous Node. C'est ce qui permet de garder **un seul fichier**
distribuable tout en ayant de vrais tests.

### Ce qui n'a pas pu être vérifié à la construction

L'environnement où cette application a été écrite n'avait pas accès à
`open-meteo.com`. Deux conventions de l'API ont donc été codées d'après sa
documentation plutôt que constatées :

1. les cumuls horaires sont horodatés à la **fin** de l'heure couverte
   (l'horodatage 08:00 décrit 07:00 → 08:00) ;
2. le découpage des journées par le fuseau `Europe/Paris`.

L'onglet **Méthode** contient un panneau « Vérification des données » qui
contrôle les deux sur les données réellement reçues, et dit quoi changer si
l'une se révélait fausse. **À regarder une fois, au premier lancement.**

## Sources

- Données météo : [Open-Meteo.com](https://open-meteo.com), licence CC-BY 4.0.
  Historique de réanalyse pour les années passées, modèle opérationnel pour les
  trois derniers mois (provisoires : un jour se fige au bout d'une semaine).
- Référence officielle : station Météo-France de Bordeaux-Mérignac, à 9 km de
  Blanquefort — relevés publics sur [meteo.data.gouv.fr](https://meteo.data.gouv.fr).
