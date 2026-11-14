# Rs 10 bet audit

## Findings

The audit covers the 70 local games in `GAME_ORDER`, not external provider games.

| Game | Before | Fix |
| --- | --- | --- |
| Birds & Beasts | Placement, queued bets and rebet rejected stakes below Rs 50, despite displaying Rs 10 chips. | All three paths now use the existing shared Rs 10 minimum. Initial selected chip is Rs 10. |
| Blackjack | Already accepted Rs 10; its validation message incorrectly said Rs 50. | Message now reads the actual minimum. |

No other Rs 10 opening-wager blocker was found. All 70 games pass the
transactional acceptance check with an exact Rs 10 stake and an exact wallet
debit (plus any instant confirmed winnings). Games such as poker can still
require additional stakes for later actions; their rules have not changed.

### Coverage

- Dedicated engines (10): Aviator, Aviator X, Dragon Tiger, Andar Bahar,
  Chicken Road 2, Chicken Dash, Limbo, Plinko, Lucky 777, Mines.
- Live/table engines (12): Baccarat, Speed Baccarat, Dream Catcher,
  Football Studio, Auto Roulette, Lightning Roulette, Sic Bo, Blast Off,
  Nine Wickets, 7 Up Down, Tai Xiu, 32 Cards.
- Browser wager engines (48): Dice, Rock Paper Scissors, Tower Betting,
  Three Cards, Treasure Bowl, Fortune Ox, Fortune Gems, Fortune Toucan,
  Super Fruits, Sweet Bonanza, Keno, Hotline, Monster HiLo, Gates of Olympus,
  Evo Casino, Amar Akbar Anthony, Derby Race, Crash Bonus, Mini Roulette,
  European Roulette, Blackjack, Three Card Poker, Casino War, Poker, Rummy,
  Teen Patti, Teen Patti AK47, Teen Patti Joker, Teen Patti Best of Four,
  Teen Patti Hukam, Muflis, Thai Hi-Lo, Poker Betting, Poker Roulette,
  Red vs Black, Teen Patti Faceoff, Teen Patti 999, Head & Tail, Wheel Betting,
  Ludo, Birds & Beasts, Bollywood Casino, Race Betting, Diao Chan, Crash Goal,
  Crash Cricket, Fishing Arcade, Texas Hold'em.

## Related requested fixes

- Admin: open **Users > player > Info Edit > Customize bet amounts**.
  Authorized staff can save five distinct amounts, Rs 10 to Rs 50,000, for that
  player. Sub-admins retain their existing direct-team restriction.
  Updates use the same persistent player settings as the profile page and are
  received on the player's next account refresh. They do not change provider
  games or prevent players editing their own presets.
- Notice: Birds & Beasts uses a unique, scoped toast class. Its height follows
  the text, long messages wrap, and width cannot exceed the game container.
  This avoids the conflicting generic toast styles that produced the tall oval.
- Registration: signup goes directly to `/` using history replacement.
  Preset activation cannot reload signup/login before this navigation.
- Images: 70 pre-sized 640px WebP covers total **3,734,330 bytes**, versus
  **34,212,187 bytes** for the originals (**89.1% smaller**).
  Originals remain unchanged. The covers bypass cold on-demand resizing;
  first-open warmup waits for only the first 12, rather than all 70.

Regenerate covers after changing the original artwork:

```powershell
node scripts\prepare-game-thumbnails.mjs
```

## Validation

```powershell
npm run typecheck
node --test scripts\test-ten-rupee-bets.mjs scripts\test-registration-bet-controls.mjs scripts\test-bet-presets.mjs scripts\test-game-thumbnail.mjs scripts\test-game-artwork-loading.mjs scripts\test-birds-beasts.mjs
npm run build
```

The focused suite passes 101 tests, including 70 per-game acceptance checks.
It uses isolated transactional fixtures, not real player balances or accounts.
Browser layout measurements at widths 320, 375, 740, 844, 1024, 1440 and 1920
keep the minimum-bet notice inside the viewport: approximately 37px high,
or 56px when the text wraps at 320px.

Typechecking and the production build pass; the production signup page returns
HTTP 200. Real-account registration and admin saves were not exercised.
Focused linting still reports two existing synchronous-effect state-update
errors in `AuthForm.tsx` and an existing raw-image warning in
`GameThumbnail.tsx`; these unrelated patterns were left unchanged.
