# Browser daily-pool coverage

## Supported local engines

All 48 browser engine entry paths are wired. `dice` and `rock-paper-scissors` use `useBrowserWager`. Each instant round submits
an explicit UUID, positive stake and gross terminal claim (zero on loss) to
`POST /api/player/balance` with `action: "play"`. Acceptance and completion share
one database transaction: these games have no open gameplay state, incremental
stakes or cancellable accepted stage. A no-stake spectator must not call this API.
No result is inferred from a wallet delta.

### Card-result presentation

Teen Patti Joker, AK47, Face Off, Hukam, Best of Four, Teen Patti, Teen Patti 999
and Texas Hold'em finish their visible card reveals and a review pause before
calling lifecycle completion (and therefore the common result notification).
Their duplicate in-table result panels are removed. Rummy and Three Card Poker
also use the common result popup instead of their additional result dialogs.
Existing replay/bet controls remain available; settlement amounts and game odds
are unchanged. Texas Hold'em's animated runout is presentation-only and does not
replace the committed action snapshot used for financial retries.

The client durably saves the exact request before sending it. A lost response
requires replaying the same ID and outcome; it never becomes an optimistic win
or another wager. Definitive 4xx rejection clears that unaccepted request.
Network/5xx ambiguity retains it and blocks new betting until confirmation.
The server verifies game/account access, sufficient balance, current per-game
consent, supported lifecycle and immutable replay amounts. Existing local RNG
and probabilities are unchanged; these remain browser-generated claims, not
newly server-certified outcomes.

With pooling enabled, acceptance deducts the stake once and completion closes a
provisional claim without wallet credit. The common engine performs the Pakistan
day allocation later. With pooling disabled, the explicit instant round retains
its legacy gross return. Replaying an accepted legacy identity after activation
does not change its accounting version or charge/pay it again.

## Explicit multi-action and existing server engines

### Player-count outcome rules

Aviator keeps its random crash point but also crashes immediately when at least
`ceil(distinct round players / 10)` players have cashed out. Multiple panels from
one player count once. The threshold cashout and crash commit together, and all
remaining current-round bets are closed at zero; next-round reservations are
unaffected. Both instant and daily-pool cashouts follow this rule.

Chicken Road 2 and Chicken Dash each maintain a separate server-side cycle of
100 distinct accepted players with ten randomly selected cashout opportunities.
Only selected players can cross the first lane; their later crash lane remains
random, so continuing instead of cashing out can still end the game. Repeat bets
by a player in the same cycle do not draw another opportunity. New instant and
pooled games share the transactional engine; previously accepted games retain
their accounting version. Multipliers and payout formulas are unchanged.

Treasure Bowl uses the same separate 100-player/ten-win cycle. Its accepted
wager is resolved by the server, not a client-supplied claim. Server resolution
is immutable on replay and produces the existing reel/payout outcome shape.
Invalid, rejected or rolled-back wagers do not consume cycle slots.

Super Fruits and Sweet Bonanza each use a separate server-side cycle of 100
distinct accepted players with ten randomly positioned wins. Repeat players
within an unfinished cycle do not draw another winning opportunity. Super Fruits'
ten wins contain exactly five Cherry, three Lemon and two Orange lines; the
existing fruit paytable is unchanged. Sweet Bonanza randomly pays only 1.2x,
1.4x or 1.6x the stake on a win. These are non-overlapping cycles, not rolling
windows or a guarantee for one player's repeated spins. Outcomes, cycle updates
and settlement commit transactionally, retain existing pool accounting, and are
immutable on retry. Both clients keep their existing artwork and animations;
the common result notification follows the spin animation. Previously accepted
browser-generated wagers can still finish with their saved result.

Limbo accepts new wagers with immediate, server-budgeted payouts, independently of
`DAILY_POOL_ENABLED`. Each accepted stake contributes to a cumulative 35% payout
ceiling; unspent budget carries forward. A winning payout is capped by the available
budget and its target-based return. The existing 20-winners-per-100-distinct-players
cycle is unchanged. Budget, wallet, result and request replay commit atomically;
no additional win hold is created outside this budget. The budget starts with new
wagers under this policy, not historical stakes or payments. Previously accepted
daily-pool wagers retain their original settlement and replay behavior.

The other 46 engines use explicit acceptance, added stakes, partial cancellation,
full refund, provisional awards, terminal zero-loss claims and cashout as their
actual gameplay requires:

`birds-beasts`, `blackjack`, `european-roulette`, `evo-casino`,
`fishing-arcade`, `fortune-gems`, `fortune-ox`, `fortune-toucan`,
`gates-of-olympus`, `head-tail`, `muflis`, `poker`,
`amar-akbar-anthony`, `bollywood-casino`, `casino-war`, `crash-bonus`,
`crash-cricket`, `crash-goal`, `derby-race`, `diao-chan`, `hotline`, `keno`,
`ludo`, `mini-roulette`, `monster-hilo`, `poker-betting`, `poker-roulette`,
`race-betting`, `red-vs-black`, `rummy`, `super-fruits`, `sweet-bonanza`,
`teen-patti`, `teen-patti-999`, `teen-patti-ak47`, `teen-patti-best-of-four`,
`teen-patti-faceoff`, `teen-patti-hukam`, `teen-patti-joker`, `texas-holdem`,
`thai-hi-lo`, `three-card-poker`, `three-cards`, `tower-betting`,
`treasure-bowl`, `wheel-betting`.

Prepaid tables accept each chip before updating their displayed stake; undo and
clear return only explicitly cancelled stakes. Bonus/free-spin awards accrue
against the original paid wager; free spins create no additional stake. Crash
Goal/Cricket use a separate identity per panel. Fishing uses a separate identity
per projectile. Texas Hold'em records explicit stake, unmatched-stake refund and
gross-return events rather than comparing chip balances.

Heads/Tails, Wheel, Ludo and Birds/Beasts retain their existing server outcome
engines inside the wallet transaction. Those games reject generic client-supplied
terminal claims. Server-generated outcomes and selections are immutable on replay.

Added stakes create separate accepted-day entries, including across Pakistan
midnight. Completion divides the explicit gross claim across the remaining
non-refunded stake entries. The original result's stake remains equal to its
own ledger entry so settlement can reconcile it.

`dailyPoolBrowserGames.ts` exports the client-safe
`isUnsupportedBrowserPoolGame` and `UNSUPPORTED_BROWSER_POOL_GAMES` for the
enabled-mode GameView gate. Its catalog coverage list currently has no unlisted
browser engines; that is entry-path coverage, not a certification of reload
recovery. Catalog additions fail closed. The balance route
also rejects all legacy delta requests while globally enabled. The balance hook
does not optimistically update unsupported games in enabled/unknown mode.
`wx:wallet-error` carries `{ error }` for the common error UI.

Server-backed Aviator, Chicken, card tables, Plinko, Limbo, Lucky 777 and Mines,
and the twelve `useMultiplayerGame` tables are separate integration scopes;
their exclusion from this list does not certify their implementation here.

### Lucky 777 accepted-spin cycle

Lucky 777 uses a durable, globally shared shuffled cycle across all players.
Each **non-overlapping block of 100 accepted spins** contains 90 non-paying
reel combinations, one Orange triple, two Lemon triples, three Cherry triples,
two two-Cherry results and two one-Cherry results. It is not a promise about
every rolling window of 100 spins. A new cycle is shuffled only after the old
one is exhausted; reloads, day changes and worker restarts do not reset it.
The existing symbol artwork and paytable rows remain, but 777/BAR/Bell/Plum
winning combinations are not selected by this fruit-only cycle.

Cycle consumption, wallet debit, result and replay identity commit together
under the Lucky 777 daily-pool lock in both pooled and legacy accounting.
Rejected bets and replayed requests do not advance the cycle. With pooling
enabled, these are **reel results and provisional claims**, not an exact count
of eventual wallet payouts: the existing 35% daily-pool allocation (including
its no-claims fallback) is unchanged. There is no new per-win payout cap; the
owner explicitly deferred specifying it. Small stakes can therefore still
receive large pooled payouts. Legacy wins retain the existing 2% withholding.

Focused offline validation:
`node --test scripts\test-slot777.mjs scripts\test-daily-pool-dedicated.mjs`.

## Activation and validation

**Activation remains default-off; deployment still requires the scheduler and a legacy-session drain.**
The lifecycle now persists explicit engine snapshots for interactive rounds,
original terminal-result plans for sampled outcomes, and immutable operation
journals for compound stake/bonus transitions. Restored cards, decks, progress,
free-spin choices and crash boundaries are reused rather than rerolled. Crash
engines retain their original wall-clock start and automatic-cashout target.
Their financial transitions wait for wallet recovery before progressing.

Fishing persists the fish world, target references, pending acceptance and each
in-flight projectile. Its initial sampled target is not a final claim: the
original engine may retarget or miss. Only a genuine collision/miss records a
terminal claim. Reload resumes the saved simulation; already terminal shots
replay only their original claim. Incomplete simulation storage fails closed
before any new acceptance request. Saved financial requests carry their
authenticated account owner; switching accounts cannot submit another player's
pending wager.

These recovery paths require the coordinated tests below; entry-path coverage
alone does not certify all end-to-end reload behavior. Browser storage loss or
manual deletion cannot reconstruct a previously accepted interactive outcome
and still needs operational reconciliation, not a fabricated loss or refund.

Pre-deployment browser rounds have no durable
accepted identity and cannot safely be reconstructed or grandfathered from
balance deltas. **Do not activate while such legacy browser sessions have
unfinished accepted wagers.** Their migration/drain is an activation blocker,
not permission to fabricate a claim or silently fall back to legacy payments.

Focused mock validation: `node --test scripts\test-daily-pool-browser.mjs`.
It covers explicit zero claims, fixed-budget random settlement, idempotency, immutable
amounts, account access, current consent, rollback, legacy replay, incremental
accepted days, refunds/undo, accrued bonus claims, server result replay/forgery
rejection, and the 48 component entry paths. It needs no live database, server or
build. These focused accounting/coverage tests have passed in the coordinated offline validation.

Runtime recovery validation: `node --test scripts\test-browser-recovery.mjs`.
It exercises the actual wallet hooks with mocked React/storage/network:
terminal-plan reload, exact ambiguous acceptance replay, incremental/bonus
journals, accepted card/shoe restoration, cross-account isolation, zero-loss
closure and independent projectile journals. The Fishing engine test also
restores and advances the actual simulation to a collision and a retargeted
miss without a new acceptance. All eight runtime recovery tests have passed in the coordinated offline validation.

Pending-mode result UI uses neutral daily-payout status for successful and
zero-claim outcomes; a game loss is not a final daily allocation loss. Claim
meters identify provisional amounts, while legacy game-net statistics are
explicitly marked as indicative and not paid. Default-off wording and outcome
animations remain unchanged. `node --test scripts\test-browser-pool-ui.mjs`
renders actual Ludo, Birds/Beasts and Crash Goal result components in both modes
and checks critical zero-claim branches plus retained Keno/Hotline event
metadata. The browser catalog test also checks pending-result labelling across
all 48 engine/view paths. These result UI tests have passed in the coordinated
offline validation. Pending shared-wheel rounds retain the neutral result dialog
and its Play Again/Close actions without recording a paid win or loss.
