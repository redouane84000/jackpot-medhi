/**
 * Configuration de gameplay centralisée.
 * Unités : mètres, kilogrammes, secondes, radians. Vitesses en m/s (×3,6 pour km/h).
 * Toutes les valeurs sont des réglages initiaux, à ajuster après des tests de jeu réels.
 */
export const CONFIG = {
  // ---------- Simulation ----------
  PHYSICS_DT: 1 / 120,          // pas de temps physique fixe
  MAX_STEPS_PER_FRAME: 10,      // plafond de rattrapage (évite la spirale de surcharge, couvre ~12 FPS)
  GRAVITY: 9.81,

  // ---------- Arène ----------
  ARENA_LENGTH: 105,            // axe Z (but bleu en -Z, but orange en +Z)
  ARENA_WIDTH: 68,              // axe X
  ARENA_WALL_HEIGHT: 12,        // hauteur visuelle des murs vitrés
  ARENA_CEILING: 26,            // plafond physique (le ballon ne sort jamais)
  ARENA_CORNER_RADIUS: 12,      // coins arrondis (vue de dessus)
  ARENA_CORNER_SEGMENTS: 10,    // nombre de pans de collision par coin
  WALL_THICKNESS: 4,

  // ---------- Buts ----------
  GOAL_WIDTH: 14,
  GOAL_HEIGHT: 6,
  GOAL_DEPTH: 6,
  GOAL_POST_RADIUS: 0.3,

  // ---------- Voiture ----------
  CAR_LENGTH: 4.2,
  CAR_WIDTH: 1.9,
  CAR_HEIGHT: 1.3,
  CAR_MASS: 1200,
  CAR_HITBOX: { hx: 0.92, hy: 0.36, hz: 2.05 },   // demi-dimensions du châssis physique
  CAR_COM_OFFSET_Y: -0.3,       // centre de gravité abaissé (stabilité)
  WHEEL_RADIUS: 0.4,
  WHEEL_BASE_HALF: 1.36,        // demi-empattement (avant +Z, arrière -Z)
  WHEEL_TRACK_HALF: 0.8,        // demi-voie
  SUSPENSION_REST_LENGTH: 0.45, // ressort détendu (point d'ancrage → centre de roue)
  SUSPENSION_FREQUENCY: 2.4,    // Hz, raideur exprimée en fréquence propre
  SUSPENSION_DAMPING: 0.6,      // taux d'amortissement (1 = critique)
  SUSPENSION_MAX_FORCE: 60000,  // N par roue

  CAR_ACCELERATION: 16,         // m/s² à l'arrêt, décroît vers la vitesse max
  CAR_MAX_SPEED: 25,            // m/s ≈ 90 km/h sans boost
  CAR_REVERSE_MAX_SPEED: 11,    // m/s ≈ 40 km/h
  CAR_BRAKE_DECEL: 30,          // m/s² de freinage
  CAR_COAST_DECEL: 3,           // frein moteur quand on relâche
  CAR_ROLLING_RESISTANCE: 0.012,// coefficient × g
  CAR_DRAG: 0.0016,             // traînée : a = k·v²
  CAR_GRIP: 1.9,                // adhérence latérale (coefficient de friction)
  CAR_GRIP_STIFFNESS: 0.9,      // fraction du glissement latéral corrigée par pas
  CAR_HANDBRAKE_REAR_GRIP: 0.28,// adhérence arrière au frein à main
  CAR_ROLL_STABILITY: 0.65,     // remonte le point d'application des forces vers le centre de gravité
  CAR_DOWNFORCE: 0.0045,        // appui aéro : N = k·m·v²·… (stabilise à haute vitesse)
  CAR_STEER_MAX_LOW: 0.6,       // angle de braquage max à l'arrêt (rad, ~34°)
  CAR_STEER_MAX_HIGH: 0.12,     // angle de braquage max à pleine vitesse (rad, ~7°)
  CAR_STEER_RATE: 3.2,          // vitesse de rotation des roues directrices (rad/s)

  CAR_BOOST_ACCEL: 21,          // m/s² ajoutés par le boost
  CAR_BOOST_MAX_SPEED: 41,      // m/s ≈ 148 km/h
  BOOST_START: 34,              // % au coup d'envoi
  BOOST_CONSUMPTION: 33,        // %/s

  CAR_JUMP_SPEED: 4.4,          // m/s de décollage (appui bref : petit saut)
  CAR_JUMP_HOLD_ACCEL: 15,      // m/s² tant que la touche reste enfoncée (saut à hauteur variable)
  CAR_JUMP_HOLD_TIME: 0.18,     // durée maximale de la poussée prolongée
  CAR_JUMP_MIN_WHEELS: 2,
  CAR_DOUBLE_JUMP_SPEED: 4.8,
  CAR_DOUBLE_JUMP_WINDOW: 1.4,  // s après le premier saut
  CAR_DODGE_SPEED: 8.2,         // impulsion horizontale du saut directionnel (avant)
  CAR_DODGE_SIDE_SPEED: 7.2,    // … latéral
  CAR_DODGE_BACK_SPEED: 6.4,    // … arrière
  CAR_DODGE_SPIN: 10.5,         // rad/s de rotation pendant la figure
  CAR_DODGE_TIME: 0.6,          // ≈ un tour complet à CAR_DODGE_SPIN
  CAR_DODGE_FLAT: 4.5,          // amortissement de la chute pendant la figure (figure « à plat »)
  CAR_AIR_ACCEL: 12.5,          // rad/s² de contrôle aérien (tangage, lacet)
  CAR_AIR_ROLL_ACCEL: 17,       // rad/s² en rotation aérienne (roulis)
  CAR_AIR_MAX_ANGVEL: 5.5,
  CAR_AIR_DAMPING: 2.2,         // amortissement des rotations sans commande
  CAR_DRIFT_YAW: 1.6,           // aide de rotation en dérapage contrôlé (rad/s² par unité de braquage)
  CAR_DRIFT_RECOVER: 7,         // vitesse de retour de l'adhérence arrière après le frein à main (1/s)
  /** Modèles jouables : multiplicateurs de performances (VORTEX = référence). */
  CAR_MODELS: {
    vortex: { mass: 1.0, accel: 1.0, maxSpeed: 1.04, boostAccel: 1.0, boostMax: 1.03 },
    typhon: { mass: 1.12, accel: 1.16, maxSpeed: 0.96, boostAccel: 1.08, boostMax: 0.97 },
  },
  CAR_MODEL_URL: null,          // chemin d'un modèle .glb sous licence (roues nommées wheel_FL, wheel_FR, wheel_RL, wheel_RR) ; null = modèle procédural
  CAR_RECOVER_DELAY: 0.7,       // s sur le toit avant redressement automatique
  CAR_LANDING_ASSIST: 3.5,      // aide explicite à l'atterrissage (0 = désactivée)

  // ---------- Ballon ----------
  BALL_RADIUS: 1.5,             // diamètre 3 m
  BALL_MASS: 190,
  BALL_RESTITUTION: 0.62,
  BALL_FRICTION: 0.35,
  BALL_LINEAR_DAMPING: 0.04,
  BALL_ANGULAR_DAMPING: 0.25,
  BALL_MAX_SPEED: 60,
  BALL_SPAWN_HEIGHT: 1.5,
  /** Assistance arcade explicite : vitesse ajoutée au ballon au début d'un contact voiture,
   *  le long de l'axe voiture→ballon, proportionnelle à la vitesse de rapprochement (0 = physique pure). */
  BALL_HIT_ASSIST: 0.16,
  BALL_HIT_ASSIST_MAX: 6,

  // ---------- Pastilles de boost ----------
  BOOST_PAD_SMALL_AMOUNT: 12,
  BOOST_PAD_SMALL_RESPAWN: 4,
  BOOST_PAD_SMALL_RADIUS: 1.5,
  BOOST_PAD_BIG_AMOUNT: 100,
  BOOST_PAD_BIG_RESPAWN: 10,
  BOOST_PAD_BIG_RADIUS: 2.3,

  // ---------- Match ----------
  MATCH_DURATION: 300,          // s
  KICKOFF_COUNTDOWN: 3,         // s
  KICKOFF_CLOCK_DELAY: 4,       // le chrono démarre au premier contact, ou au plus tard après ce délai
  GOAL_CELEBRATION: 3.2,        // s de gel après un but
  OVERTIME_BANNER: 2.2,
  RESET_DURATION: 0.35,

  // ---------- IA ----------
  BOT_REACTION: 0.08,           // s de latence de décision
  BOT_SKILL: 0.8,               // 0..1, précision et usage du boost

  // ---------- Commandes (KeyboardEvent.code : position physique, AZERTY et QWERTY) ----------
  INPUT_MAPPING: {
    throttle: ['KeyW', 'ArrowUp'],          // Z (AZERTY) / W (QWERTY)
    brake: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],            // Q (AZERTY) / A (QWERTY)
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    boost: ['ShiftLeft', 'ShiftRight'],
    handbrake: ['ControlLeft', 'ControlRight', 'KeyX'],
    airRoll: ['KeyE'],
    camera: ['KeyC'],
    pause: ['Escape', 'KeyP'],
    dev: ['F3', 'Backquote'],
    mute: ['KeyM', 'Semicolon'],            // M (QWERTY) / M (AZERTY)
  },
};

export const TEAM = { BLUE: 'blue', ORANGE: 'orange' };
export const TEAM_SIGN = { blue: -1, orange: 1 }; // côté du but défendu (Z)
