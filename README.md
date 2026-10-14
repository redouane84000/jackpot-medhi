# Jackpot Arena

Jeu de football automobile en 3D, 1 contre 1 contre une IA, en nocturne dans un stade éclairé. Le concept s'inspire du genre, sans en reprendre les éléments protégés : voitures, stade, ballon, noms, sponsors et logos sont originaux ou fictifs.

## Véhicules

| Modèle | Moteur (son) | Caractère |
|---|---|---|
| **Typhon S** | V8 biturbo : grondement irrégulier, sifflement des turbos, soupape de décharge, claquements à l'échappement au lever de pied | Plus de couple et d'accélération, plus lourde (frappe plus fort), capot carbone à bossage et extracteurs |
| **Vortex GT** | V12 atmosphérique : cri aigu qui monte haut dans les tours | Plus légère, vitesse de pointe plus élevée, aileron |

Le choix se fait dans le menu (aperçu en vitrine, coup d'accélérateur à la sélection). L'IA prend l'autre modèle. Les deux voitures ont exactement la même hitbox et les mêmes dimensions de roues ; seules la masse, la courbe moteur et le boost changent (`CONFIG.CAR_MODELS`).

- **Rendu** : Three.js 0.160.
- **Physique** : Rapier 3D 0.19.3 (WebAssembly).
- **Code** : JavaScript en modules ES, sans framework.

## Lancer le projet

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 38 tests automatisés (Node 20+), physique réelle comprise
npm run build        # build Vite dans dist/
npm run build:single # page autonome dist/jackpot-arena.html (Three.js et Rapier chargés depuis jsDelivr)
```

Test navigateur de bout en bout (optionnel) :

```bash
npm i -D playwright
node tools/play.mjs http://localhost:5173/ 960 600 "menu,play,run:4.4,auto,run:6,state,shot:partie"
```

Ce script lance une partie en pilote automatique, prend une capture dans `preview/` et liste toutes les erreurs de la console.

## Commandes

Les touches sont lues par position physique (`KeyboardEvent.code`). Elles fonctionnent donc en AZERTY comme en QWERTY.

| Action | Clavier | Manette |
|---|---|---|
| Accélérer | Z (AZERTY) / W (QWERTY), ↑ | Gâchette droite |
| Freiner, puis reculer | S, ↓ | Gâchette gauche |
| Tourner | Q / A, D, ← → | Stick gauche |
| Sauter (maintenir = plus haut) | Espace | A |
| Double saut | Espace (2ᵉ appui en l'air) | A |
| Figure | Espace (2ᵉ appui) + direction | A + direction |
| Boost | Maj | B |
| Dérapage (frein à main) | Ctrl ou X | X |
| Rotation aérienne | E | LB |
| Caméra ballon | C | Y |
| Pause | Échap ou P | Start |
| Son | M | — |
| Diagnostics | F3 ou ² | — |

Sur un clavier QWERTY, **Ctrl + W ferme l'onglet** : le navigateur ne laisse pas une page bloquer ce raccourci. Utilise **X** pour déraper.

Sur téléphone, un stick virtuel et trois boutons (Saut, Boost, Dérapage) apparaissent.

## Architecture

```
src/
├── config.js                 Réglages centralisés (mètres, kg, secondes)
├── main.js                   Démarrage : Rapier (WASM) puis le jeu
├── core/
│   ├── Simulation.js         Simulation complète SANS rendu : physique, voitures, ballon, règles, pastilles
│   ├── GameLoop.js           Pas de temps fixe (1/120 s), accumulateur, rattrapage plafonné
│   ├── EventBus.js           Événements : but, contact, saut, ramassage…
│   └── Game.js               Orchestration : entrées → simulation → rendu interpolé → caméra → interface → audio
├── physics/PhysicsWorld.js   Monde Rapier, matériaux, groupes de collision, lancers de rayon, événements de contact
├── arena/
│   ├── ArenaLayout.js        Géométrie partagée : murs, coins arrondis, cages, pastilles, positions d'engagement
│   └── ArenaColliders.js     Colliders statiques construits depuis ce layout
├── vehicles/
│   ├── VehiclePhysics.js     Corps rigide + 4 suspensions à rayon : moteur, freins, adhérence, boost, sauts, aérien
│   └── VehicleController.js  Contrôleur commun au joueur et à l'IA
├── ball/BallPhysics.js       Ballon : sphère rigide, restitution, frottement, CCD
├── match/
│   ├── MatchManager.js       Machine à états, score, chrono, prolongation (logique pure)
│   ├── GoalDetector.js       Franchissement complet de la ligne, une seule détection par passage
│   └── BoostPads.js          Pastilles de recharge
├── ai/BotController.js       IA : SEEK_BALL, ATTACK, DEFEND, RECOVER, REPOSITION, KICKOFF
├── input/InputManager.js     Clavier, manette, tactile
├── camera/CameraRig.js       Caméra voiture, caméra ballon, plans cinématiques, confinement dans l'enceinte
├── render/                   Three.js uniquement (aucun collider)
│   ├── car/                  Carrosseries par champ de distance (CarShape, SurfaceNets, Web Worker), peinture et détails (CarMaterial), roues (Wheel)
│   ├── stadium/              Tribunes, toit, projecteurs, pylônes, écrans (Stands), sièges et public 3D, drapeaux, tifos (Crowd)
│   ├── ArenaVisual.js        Pelouse, enceinte vitrée, cages, pastilles, ville au loin
│   ├── PostFX.js             Bloom, flou de vitesse, étalonnage, vignettage, grain
│   └── SkidMarks.js          Traces de gomme
├── ui/HUD.js                 Score, chrono, boost, annonces, menus
├── audio/                    Sons synthétisés (Web Audio), aucun fichier externe
│   ├── EngineSynth.js        Moteurs V12 et V8 biturbo : cycle de combustion, boîte, pétarades, turbos
│   └── AudioManager.js       Mixage, foule, impacts, sifflet, boost
└── dev/DevOverlay.js         Diagnostics (F3 ou ?dev dans l'adresse)
tests/                        Tests node:test (logique pure et physique Rapier réelle)
tools/                        Build autonome, aperçu sans bundler, test navigateur, statistiques de matchs IA
```

### Séparation des responsabilités

- **Simulation indépendante du rendu.** `Simulation` tourne en Node sans Three.js ni écran. C'est ce qui permet de jouer des matchs entiers dans les tests.
- **Rendu en lecture seule.** Il lit les corps physiques, avec une interpolation entre deux pas, et n'écrit jamais dedans.
- **Caméra en lecture seule.** Elle ne touche pas à la physique.
- **Score indépendant des animations.**
  - `GoalDetector` signale un franchissement.
  - Seul `MatchManager` valide le but et met à jour le score.
  - L'explosion n'est qu'un abonné à l'événement de but.
- **Un seul système de contrôle.** Le joueur et l'IA passent par le même `VehicleController` et la même `Vehicle.step()`.

## Physique

**Voiture.**
- Un corps dynamique Rapier (1 200 kg, centre de gravité abaissé, inertie d'une boîte de 4,2 × 1,9 m) avec 4 suspensions à lancer de rayon (ressort et amortisseur).
- Tout passe par des impulsions :
  - suspension ;
  - adhérence latérale, dans un cercle de friction ;
  - moteur (courbe de couple décroissante) ;
  - freins ;
  - résistance au roulement et traînée ;
  - boost ;
  - saut et contrôle aérien.
- La position n'est jamais modifiée directement, sauf au replacement des voitures à l'engagement.

**Roues.**
- La rotation visuelle vient de la vitesse réelle du point de contact.
- Le braquage visuel est celui utilisé par la physique.
- La suspension visuelle suit la compression réelle.

**Ballon.**
- Sphère de 3 m, 190 kg, restitution 0,62, frottement 0,35, légère traînée.
- Détection continue des collisions (CCD).
- Vitesse plafonnée à 60 m/s.

**Arène.**
- Sol, murs de 4 m d'épaisseur, coins arrondis (10 pans par coin) et plafond à 26 m.
- Cages réelles : fond, côtés, toit, montants et barre arrondis.
- L'ouverture de la cage est libre, sans mur invisible.

**Conduite et sauts.**
- Saut à hauteur variable : impulsion de départ, puis poussée tant que la touche reste enfoncée (0,18 s au plus).
- Figure plus « à plat » : la chute est freinée pendant la rotation, impulsion différente vers l'avant, le côté et l'arrière.
- Frein à main progressif : l'adhérence arrière chute vite et revient en douceur, avec une aide de rotation en dérapage.
- Roulis et plongée de caisse visibles (effet visuel calculé sur l'accélération réelle, la physique n'est pas modifiée).

### Assistances arcade, toutes explicites et réglables (0 = désactivée)

| Réglage | Effet |
|---|---|
| `BALL_HIT_ASSIST` | Au début d'un contact voiture-ballon, ajoute au ballon une vitesse proportionnelle à la vitesse de rapprochement, plafonnée par `BALL_HIT_ASSIST_MAX`. Elle suit l'axe voiture → ballon, jamais une direction vers le but. |
| `CAR_LANDING_ASSIST` | Près du sol et sans commande sur l'axe, ramène doucement la voiture à plat. |
| `CAR_RECOVER_DELAY` | Délai avant que la voiture restée sur le toit se redresse seule (appuyer sur Espace le fait tout de suite). |
| `CAR_DOWNFORCE` | Appui aérodynamique au sol. |
| `CAR_DRIFT_YAW` | Aide de rotation pendant un dérapage au frein à main. |
| `CAR_DODGE_FLAT` | Freinage de la chute pendant une figure. |

## Règles du match

| État | Ce qui se passe |
|---|---|
| `MENU` | Écran d'accueil. |
| `RESETTING` | Replacement des voitures et du ballon, vitesses remises à zéro. |
| `COUNTDOWN` | Compte à rebours de 3 s, voitures immobiles. |
| `KICKOFF` | Les voitures sont libres. Le chrono démarre au premier contact, ou au plus tard 4 s après. |
| `PLAYING` | Le chrono tourne. |
| `GOAL_SCORED` | Jeu gelé 3,2 s, puis retour à `RESETTING`. |
| `OVERTIME` | En cas d'égalité à 0:00 : annonce, puis but en or. |
| `MATCH_FINISHED` | Fin du match. |
| `PAUSED` | Restaure l'état exact au retour. |

Le chrono avance uniquement avec le temps de simulation.

## Rendu

- Carrosseries générées au chargement dans des Web Workers (≈ 0,5 s par modèle sur un ordinateur récent), partagées par les deux voitures.
- Matériau de carrosserie unique : peinture vernie, vitrage, carbone, optiques LED, lignes d'ouvrants et numéros sont choisis pixel par pixel à partir de zones portées par les sommets.
- Environnement réfléchi calculé à partir du stade lui-même (projecteurs, tribunes, ciel).
- Qualité adaptative : définition d'abord, puis halo lumineux et densité du public.

## Tests (38, tous exécutés)

| Prompt | Fichier | Ce qui est vérifié |
|---|---|---|
| T1–T5 | `physics.test.mjs` | Accélération progressive, freinage sans inversion brutale, roues liées au mouvement, braquage gauche/droite, braquage plus serré à basse vitesse, aucune traversée du sol |
| T6–T10 | `physics.test.mjs` | Gravité, rebonds avec perte d'énergie, frappes frontale, décalée, latérale et par-dessous, murs à vitesse max, tirs dans 12 directions, fond et côtés des cages |
| T11–T13 | `physics.test.mjs` | But physique = +1 exactement, ballon et voitures replacés sans vitesse |
| T14 | `match.test.mjs` | Chrono, pause, prolongation, fin de match |
| T15 | `match.test.mjs`, `gameplay.test.mjs` | À 144, 20 ou 15 FPS irréguliers : même nombre de pas, même chrono, état physique identique au bit près |
| T16–T18 | `gameplay.test.mjs` | L'IA conduit et frappe, un match IA contre IA se termine, une nouvelle partie se relance |
| T19 | `camera.test.mjs` | Caméra toujours dans l'enceinte et au-dessus du sol, ballon et voiture visibles en caméra ballon |
| T20 | `tools/play.mjs` | Partie complète dans Chromium : aucune erreur JavaScript |

Les cas suivants sont aussi testés :
- `goal.test.mjs` : franchissement partiel, hors cadre, double détection ;
- `physics.test.mjs` : sauts répétés sans gain de hauteur, saut maintenu plus haut qu'un appui bref, différences de performances entre les deux modèles, dérapage au frein à main puis retour progressif de l'adhérence, boost limité par la réserve, recharge sur pastille.

## Modèle de voiture GLB

Les voitures actuelles sont des modèles procéduraux originaux (Typhon S et Vortex GT).

Pour utiliser un vrai modèle sous licence (CC0 ou acheté) :
1. Indique son chemin dans `CONFIG.CAR_MODEL_URL`.
2. Nomme ses roues `wheel_FL`, `wheel_FR`, `wheel_RL` et `wheel_RR`.

Le modèle est mis à l'échelle sur `CAR_LENGTH`. N'utilise ni marque automobile ni modèle sans licence.

## Limites connues et suite

**Conduite sur les murs.**
- L'architecture la prévoit : les suspensions suivent l'axe de la voiture et l'appui aérodynamique aussi.
- Il manque des rampes courbes entre le sol et les murs, et une force d'adhérence aux parois.

**Multijoueur en ligne.**
- La simulation déterministe à pas fixe est la bonne base.
- Il faudra une simulation qui fait autorité côté serveur, la synchronisation des entrées et la prédiction côté client.

**2 contre 2.**
- `Simulation` accepte déjà une liste d'équipes (`teams: ['blue', 'blue', 'orange', 'orange']`).
- Il reste à faire la répartition des rôles de l'IA.

**Page autonome.**
- La version publiée dépend de WebAssembly (Rapier).
- Si un environnement le bloque, la page l'affiche clairement. Le projet local fonctionne dans tous les cas.
