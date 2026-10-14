/**
 * Machine à états du match, score et chronomètre. Logique pure : aucune dépendance au rendu ni à la physique.
 * Le chronomètre avance uniquement avec le temps de simulation fourni à update(dt).
 *
 * MENU → RESETTING → COUNTDOWN → KICKOFF → PLAYING ─┬→ GOAL_SCORED → RESETTING → …
 *                                                   ├→ OVERTIME → RESETTING → … (but en or)
 *                                                   └→ MATCH_FINISHED
 * PAUSED suspend n'importe quel état de jeu et le restaure à l'identique.
 */
export const STATE = Object.freeze({
  MENU: 'MENU', COUNTDOWN: 'COUNTDOWN', KICKOFF: 'KICKOFF', PLAYING: 'PLAYING', GOAL_SCORED: 'GOAL_SCORED',
  RESETTING: 'RESETTING', OVERTIME: 'OVERTIME', MATCH_FINISHED: 'MATCH_FINISHED', PAUSED: 'PAUSED',
});
const PAUSABLE = new Set([STATE.COUNTDOWN, STATE.KICKOFF, STATE.PLAYING, STATE.GOAL_SCORED, STATE.RESETTING, STATE.OVERTIME]);
const other = team => (team === 'blue' ? 'orange' : 'blue');

export class MatchManager {
  constructor(C, bus) {
    this.C = C; this.bus = bus;
    this.state = STATE.MENU; this.stateTime = 0;
    this.score = { blue: 0, orange: 0 };
    this.timeLeft = C.MATCH_DURATION; this.overtime = false; this.overtimeTime = 0;
    this.winner = null; this.lastGoal = null; this.pausedFrom = null; this.goalCount = 0;
  }

  setState(s) {
    const prev = this.state; this.state = s; this.stateTime = 0;
    this.bus?.emit('state', { state: s, prev, match: this });
  }

  startMatch() {
    this.score = { blue: 0, orange: 0 };
    this.timeLeft = this.C.MATCH_DURATION; this.overtime = false; this.overtimeTime = 0;
    this.winner = null; this.lastGoal = null; this.goalCount = 0; this.pausedFrom = null;
    this.setState(STATE.RESETTING);
  }

  update(dt) {
    const S = STATE, C = this.C;
    if (this.state === S.PAUSED || this.state === S.MATCH_FINISHED) return;
    this.stateTime += dt;
    switch (this.state) {
      case S.RESETTING: if (this.stateTime >= C.RESET_DURATION) this.setState(S.COUNTDOWN); break;
      case S.COUNTDOWN: if (this.stateTime >= C.KICKOFF_COUNTDOWN) this.setState(S.KICKOFF); break;
      case S.KICKOFF: if (this.stateTime >= C.KICKOFF_CLOCK_DELAY) this.setState(S.PLAYING); break;
      case S.PLAYING: this._tickClock(dt); break;
      case S.GOAL_SCORED:
        if (this.stateTime >= C.GOAL_CELEBRATION) { if (this.winner) this._finish(this.winner); else this.setState(S.RESETTING); }
        break;
      case S.OVERTIME: if (this.stateTime >= C.OVERTIME_BANNER) this.setState(S.RESETTING); break;
      default: break;
    }
  }

  _tickClock(dt) {
    if (this.overtime) { this.overtimeTime += dt; return; }
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      if (this.score.blue !== this.score.orange) this._finish(this.score.blue > this.score.orange ? 'blue' : 'orange');
      else { this.overtime = true; this.overtimeTime = 0; this.bus?.emit('overtime', { match: this }); this.setState(STATE.OVERTIME); }
    }
  }

  /** Premier contact avec le ballon pendant l'engagement : le chronomètre démarre. */
  notifyBallTouched() { if (this.state === STATE.KICKOFF) this.setState(STATE.PLAYING); }

  /** Le ballon est entièrement entré dans la cage défendue par `defendingTeam`. Renvoie true si le but est validé. */
  notifyGoal(defendingTeam) {
    if (this.state !== STATE.PLAYING && this.state !== STATE.KICKOFF) return false;
    const scorer = other(defendingTeam);
    this.score[scorer] += 1; this.goalCount += 1;
    this.lastGoal = { team: scorer, time: this.overtime ? this.overtimeTime : this.C.MATCH_DURATION - this.timeLeft, overtime: this.overtime };
    if (this.overtime) this.winner = scorer;
    this.bus?.emit('goal', { team: scorer, score: { ...this.score }, overtime: this.overtime, match: this });
    this.setState(STATE.GOAL_SCORED);
    return true;
  }

  _finish(winner) {
    this.winner = winner;
    this.setState(STATE.MATCH_FINISHED);
    this.bus?.emit('matchEnd', { winner, score: { ...this.score }, match: this });
  }

  pause() {
    if (!PAUSABLE.has(this.state)) return false;
    this.pausedFrom = { state: this.state, time: this.stateTime };
    const prev = this.state; this.state = STATE.PAUSED;
    this.bus?.emit('state', { state: STATE.PAUSED, prev, match: this });
    return true;
  }

  resume() {
    if (this.state !== STATE.PAUSED || !this.pausedFrom) return false;
    this.state = this.pausedFrom.state; this.stateTime = this.pausedFrom.time; this.pausedFrom = null;
    this.bus?.emit('state', { state: this.state, prev: STATE.PAUSED, resumed: true, match: this });
    return true;
  }

  toMenu() { this.pausedFrom = null; this.setState(STATE.MENU); }

  get controlsEnabled() { return this.state === STATE.KICKOFF || this.state === STATE.PLAYING; }
  get clockRunning() { return this.state === STATE.PLAYING; }
  /** Secondes affichées : temps restant, ou temps écoulé en prolongation. */
  get clock() { return this.overtime ? this.overtimeTime : this.timeLeft; }
}
