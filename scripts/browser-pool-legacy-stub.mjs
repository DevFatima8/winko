// Transport double for existing local-engine tests; real accounting is tested separately.
// cardEngine(game) -> { engine, win } runs the real server card engine for card-action tables.
export function legacyBrowserPool({ balance, update, resolve, useState, cardEngine }) {
  const wagers = new Map(), cardRounds = new Map();
  const change = delta => { if (delta !== 0) update(balance() + delta); };
  const lifecycle = (game, slot = "main") => {
    const key = `${game}:${slot}`;
    const start = async amount => {
      if (wagers.has(key) || amount <= 0 || amount > balance()) return false;
      wagers.set(key, amount);
      change(-amount);
      return true;
    };
    const complete = async claim => {
      if (!wagers.has(key)) return false;
      wagers.delete(key);
      change(claim);
      return true;
    };
    const increment = async amount => {
      if (!wagers.has(key)) return start(amount);
      if (amount <= 0 || amount > balance()) return false;
      wagers.set(key, wagers.get(key) + amount);
      change(-amount);
      return true;
    };
    return {
      enabled: false, busy: false, plan() {}, checkpoint() {}, queue() {}, announce() {}, resume: async () => true,
      start, increment, stake: increment, complete,
      award: async claim => { change(claim); return true; },
      reduce: async amount => {
        if (!wagers.has(key) || amount > wagers.get(key)) return false;
        const remaining = wagers.get(key) - amount;
        if (remaining) wagers.set(key, remaining); else wagers.delete(key);
        change(amount);
        return true;
      },
      refund: async () => {
        if (!wagers.has(key)) return false;
        const stake = wagers.get(key);
        wagers.delete(key);
        change(stake);
        return true;
      },
      // Mirrors actInteractiveCard: interim debit/credit and a terminal claim settle with the move.
      cardAction: async (move, selection) => {
        const round = cardRounds.get(key);
        if (move === "state") return round?.reply ?? null;
        if (!wagers.has(key) || !cardEngine) return null;
        const { engine, win } = cardEngine(game);
        let step;
        try {
          step = round ? engine.act(round.state, move, { selection, stake: wagers.get(key), balance: balance() })
            : move === "deal" ? engine.start({ stake: wagers.get(key), selection, win, balance: balance() }) : null;
        } catch { return null; }
        if (!step) return null;
        if (step.debit && !await increment(step.debit)) return null;
        const credited = (round?.credited ?? 0) + (step.credit ?? 0);
        if (step.credit) change(step.credit);
        const reply = { phase: step.phase, view: step.view, stake: wagers.get(key), payout: credited + (step.claim ?? 0) };
        if (step.claim !== undefined) { cardRounds.delete(key); await complete(step.claim); }
        else cardRounds.set(key, { state: step.state, credited, reply });
        return reply;
      },
      resolveServer: async selection => {
        const result = await resolve(game, wagers.get(key), selection);
        await complete(result.claim);
        return result.outcome;
      },
    };
  };
  return {
    useDailyPoolMode: () => false,
    usePoolRoundState: (_game, _field, initial) => useState(initial),
    usePoolLifecycle: lifecycle,
    useBrowserWager: game => ({
      balance: balance(), error: null, pending: false,
      play: async (stake, claim) => {
        change(-stake);
        change(claim);
        return { balance: balance(), claim, poolPending: false };
      },
      playServer: async (stake, selection) => {
        const result = await resolve(game, stake, selection);
        change(-stake);
        change(result.claim);
        return { balance: balance(), claim: result.claim, outcome: result.outcome, poolPending: false };
      },
    }),
  };
}
