"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AviatorGame } from "@/components/AviatorGame";
import { ChickenRoadGame } from "@/components/ChickenRoadGame";
import { ChickenDashGame } from "@/components/ChickenDashGame";
import { PlinkoGame } from "@/components/PlinkoGame";
import { CardTable } from "@/components/CardTable";
import { LimboGame } from "@/components/LimboGame";
import { MinesGame } from "@/components/MinesGame";
import { Slot777Game } from "@/components/Slot777Game";
import TexasHoldemGame from "@/components/texas-holdem/Game";
import BirdsBeastsGame from "@/components/birds-beasts/BirdsBeasts";
import BlackjackGame from "@/components/blackjack/BlackjackGame";
import BaccaratGame from "@/components/baccarat/Baccarat";
import DiceGame from "@/components/dice/DiceGame";
import DreamCatcherGame from "@/components/dream-catcher/wheel/GameStudio";
import RouletteGame from "@/components/european-roulette/RouletteGame";
import EvoCasinoGame from "@/components/evo-casino/EvoCasinoGame";
import FishingGame from "@/components/fishing-arcade/FishingGame";
import FootballStudioGame from "@/components/football-studio/FootballStudioGame";
import FortuneGemsGame from "@/components/fortune-gems/FortuneGemsGame";
import FortuneOxGame from "@/components/fortune-ox/FortuneOxGame";
import FortuneToucanGame from "@/components/fortune-toucan/FortuneToucanGame";
import GatesOfOlympusGame from "@/components/gates-of-olympus/GatesOfOlympusGame";
import HeadTailGame from "@/components/head-tail/HeadTailGame";
import MuflisGame from "@/components/muflis/MuflisGame";
import PokerGame from "@/components/poker/PokerGame";
import RockPaperScissorsGame from "@/components/rock-paper-scissors/RockPaperScissorsGame";
import AmarAkbarAnthonyGame from "@/components/amar-akbar-anthony/AmarAkbarAnthonyGame";
import SevenUpDownGame from "@/components/7-up-down/SevenUpDown";
import NineWicketsGame from "@/components/nine-wickets/Game";
import ThirtyTwoCardsGame from "@/components/32-cards/Game";
import AutoRouletteGame from "@/components/auto-roulette/AutoRoulette";
import BlastOffGame from "@/components/blast-off/BlastOff";
import BollywoodCasinoGame from "@/components/bollywood-casino/CasinoGame";
import CasinoWarGame from "@/components/casino-war/CasinoWar";
import CrashBonusGame from "@/components/crash-bonus/CrashGame";
import CrashCricketGame from "@/components/crash-cricket/CrashCricketApp";
import { CrashGoal } from "@/components/crash-goal/CrashGoal";
import DerbyRaceApp from "@/components/derby-race/DerbyRaceApp";
import DiaoChanGame from "@/components/diao-chan/components/GameScreen";
import HotlineGame from "@/components/hotline/HotlineGame";
import KenoGame from "@/components/keno/KenoGame";
import LightningRouletteGame from "@/components/lightning-roulette/LightningRoulette";
import LudoGame from "@/components/ludo/LudoGame";
import MiniRouletteGame from "@/components/mini-roulette/MiniRoulette";
import MonsterHiloGame from "@/components/monster-hilo/MonsterHiloGame";
import PokerBettingGame from "@/components/poker-betting/PokerBettingGame";
import PokerRouletteGame from "@/components/poker-roulette/PokerRouletteGame";
import RaceBettingGame from "@/components/race-betting/RaceBettingGame";
import RedVsBlackGame from "@/components/red-vs-black/RedVsBlackGame";
import RummyGame from "@/components/rummy/RummyGame";
import SicBoGame from "@/components/sic-bo/SicBoGame";
import SpeedBaccaratGame from "@/components/speed-baccarat/SpeedBaccaratGame";
import SuperFruitsGame from "@/components/super-fruits-slot/SlotGame";
import SweetBonanzaGame from "@/components/sweet-bonanza-clone/Game";
import TaiXiuGame from "@/components/tai-xiu-game/casino";
import TeenPatti999Game from "@/components/teen-patti-999/TeenPatti999";
import TeenPattiGame from "@/components/teen-patti/TeenPattiGame";
import TeenPattiAK47 from "@/components/teen-patti-ak47/TeenPattiAK47";
import TeenPattiBestOfFourGame from "@/components/teen-patti-best-of-four/game/TeenPattiGame";
import { GameTable as TeenPattiFaceoffGame } from "@/components/teen-patti-faceoff/GameTable";
import TeenPattiHukamGame from "@/components/teen-patti-hukam/Game";
import TeenPattiJokerGame from "@/components/teen-patti-joker/game/TeenPattiGame";
import ThaiHiLoGame from "@/components/thai-hi-lo/hi-lo-game";
import { ThreeCardPoker as ThreeCardPokerGame } from "@/components/three-card-poker/ThreeCardPoker";
import ThreeCardsGame from "@/components/three-cards/Game";
import TowerGame from "@/components/tower-betting/Game";
import TreasureBowlGame from "@/components/treasure-bowl/Game";
import WheelBettingGame from "@/components/wheel-betting/WheelGame";
import { fetchServerBalance } from "@/lib/walletSync";
import { useEffect } from "react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { hasGameReturn } from "@/lib/gameNavigation";
import { useI18n } from "@/lib/i18n/client";
import { DailyPoolNotice } from "@/components/DailyPoolNotice";
import { isDailyPoolGame } from "@/lib/dailyPoolRules";
import { SharedGameResults } from "@/components/GameOverOverlay";
import { GameResultPopup } from "@/components/GameResultPopup";

const HOWTO: Record<string, string> = {
  "aviator-x": "Aviator X — 3 bet panels, tez multiplier growth, crash below 100x; cash-out maximum 99.98x. Round shuru hone se pehle bet lagayein, crash se pehle Cash Out karein. Server Auto Cash Out available.",
  limbo: "Target multiplier set karein (1.01x – 1,000,000x) aur Bet dabayein. Agar result aapke target se barabar ya zyada aaye to aap target × bet jeet-te hain.   Win chance = 99 ÷ target.",
    mines: "Bet aur mines (1–24) select karein. 5×5 grid par tiles kholen — gem milne par multiplier barhta hai, mine par sab khatam. Kabhi bhi Cashout karein.",
  "lucky-777": "Bet select karke SPIN dabayein. Center payline par teen same symbols = jeet (paytable dekhein). 7 7 7 = 777× jackpot! Any cherry bhi paisa deta hai.",
  aviator: "Round shuru hone se pehle bet lagayein. Plane udta hai aur multiplier barhta hai — plane ke crash hone se pehle CASH OUT dabayein. Jitna zyada multiplier, utni zyada jeet.",
  "chicken-road-2": "Bet aur difficulty select karke PLAY dabayein. Har GO par chicken agli lane cross karti hai aur multiplier barhta hai. Kisi bhi lane par gaari aa sakti hai — us se pehle CASH OUT karein.",
  "chicken-dash": "Bet aur level (Easy 28 · Normal 24 · Hard 20 tiles) select karke START dabayein. Har GO par multiplier barhta hai — kabhi bhi CASH OUT karein. Dash boost 2–3 safe tiles sprint karta hai, Bonus Bag utha kar cash out karein to extra bonus.",
  plinko: "Bet, Risk (Low/Medium/High) aur Rows (8–16) select karke Bet dabayein.",
  "dragon-tiger":   "Har round 10 second betting. Chip select karke Dragon, Tie ya Tiger par tap karein. Bara card jeet-ta hai (A lowest, K highest). Dragon/Tiger/Tie 1:1; sirf winning option pays, baqi zero. Total gross return max 2x round stake, house share se pehle.",
  "andar-bahar":   "Har round 10 second betting. Andar ya Bahar par tap karein. Joker khulta hai, phir cards Andar → Bahar dealt hote hain; jis side pehla same-rank card aaye wo jeet-ta hai. Andar 0.9:1, Bahar 1:1.",
  "dice": "Dice Betting — Coming Soon! Apni kismat aazmayein.",
  "dream-catcher": "Dream Catcher — Coming Soon! Big wheel spins.",
  "european-roulette": "European Roulette — Coming Soon! Classic casino roulette.",
  "evo-casino": "Evo Casino — Coming Soon! Live dealer experience.",
  "fishing-arcade": "Fishing Arcade — Coming Soon! Shoot fish to win.",
  "football-studio": "Football Studio — Bet on Home, Away, or Draw! Top card wins. Fast card action.",
  "fortune-gems": "Fortune Gems — 3x3 slot with 5 fixed paylines and a 4th multiplier reel up to 15x! Match precious gems to win.",
  "fortune-ox": "Fortune Ox — Year of the Ox 3-reel slot with 10 paylines! Golden Sycee, Wild Ox, and 10x full-screen multipliers.",
  "fortune-toucan": "Fortune Toucan — Rainforest adventure 3x3 slot with 5 paylines! Golden Toucan Wilds and 10x full-screen respin bonus.",
  "gates-of-olympus": "Gates of Olympus — 6×5 Zeus slot where 8+ matching symbols pay anywhere! Storm Orbs boost multipliers up to 10x with free spins.",
  "head-tail": "Head & Tail — Choose Head or Tail and flip the lucky golden coin for an instant 2x payout!",
  "muflis": "Muflis Lowball — Reverse Teen Patti! The lowest, weakest 3-card hand wins the round. High-intensity card action.",
  "poker": "Poker — Casino 5-card poker against the dealer! Stronger hand wins with payouts up to 100x for Royal Flush.",
  "rock-paper-scissors": "Rock Paper Scissors — Choose Rock, Paper, or Scissors against the house! Instant battle with 1.96x payout.",
  "amar-akbar-anthony": "Amar Akbar Anthony — Bet on Amar (Spades), Akbar (Hearts), or Anthony (Clubs). Revealed card decides the winner!",
  "7-up-down": "7 Up Down — Roll 2 dice! Bet on Down (2-6), Lucky 7 (7), or Up (8-12) with fast rounds and 5x payout on Lucky 7.",
  "nine-wickets": "9 Wickets Live — Live T20 cricket action! Bet ball-by-ball on Dots, Runs, Boundaries, Sixes, or Wickets every 12 seconds.",
  "32-cards": "32 Cards — Fast casino card action! Player 8, 9, 10, and 11 draw from a 32-card deck; highest total wins.",
  "auto-roulette": "Auto Roulette — Place chips on single numbers, splits, dozens, or colors. Automated roulette wheel spins every round!",
  "baccarat": "Baccarat — Place bets on Player, Banker or Tie. Closest to 9 wins! Player pays 1:1, Banker pays 0.95:1, Tie pays 8:1.",
  "blackjack": "Blackjack — Hit to draw, stand to hold, or double your wager for one card. Beat the dealer to win! Pays 3:2 for Blackjack.",
  "birds-beasts": "Birds & Beasts — Place your bets on animals. The wheel spins and if it lands on your animal, you win! Different animals have different payouts.",
  "blast-off": "Blast Off — The rocket takes off and the multiplier goes up! Cash out before the rocket crashes to win your bet times the multiplier.",
  "bollywood-casino": "Bollywood Casino — Place your bets on Andar, Bahar or Tie. Authentic desi casino experience with big wins!",
  "casino-war": "Casino War — The simplest card game! Higher card wins. Tie goes to War for double the stakes.",
  "crash-bonus": "Crash Bonus — High stakes, big wins! The multiplier goes up, cash out before it crashes.",
  "crash-cricket": "Crash Cricket — Hit a six! The multiplier increases as the ball flies. Cash out before it gets caught or crashes.",
  "crash-goal": "Crash Goal — Score a goal! The football flies high with the multiplier. Cash out before it bursts.",
  "derby-race": "Derby Race — Bet on your favorite horses in an intense pixel art night race. First to cross the finish line wins big!",
  "diao-chan": "Diao Chan — Classic Asian slot theme with beautiful graphics. Spin to win!",
  "hotline": "Hotline Casino — Welcome to Miami in the 80s! Neon lights, fast cars, and big jackpots.",
  "keno": "Keno — Pick your lucky numbers! The more matches you get, the higher your payout. Up to x10,000 multiplier!",
  "lightning-roulette": "Lightning Roulette — Personal server-settled rounds with a maximum 2x total-stake gross return.",
  "ludo": "Ludo Betting — Place bets on colors and roll the dice. Classic Ludo with a casino twist.",
  "mini-roulette": "Mini Roulette — A faster, 12-number version of roulette. Quick spins and higher chances!",
  "monster-hilo": "Monster HiLo — Guess if the next card will be higher or lower. Climb the multiplier ladder!",
  "poker-betting": "Poker Betting — Bet on poker hands. Simple, fun and highly rewarding.",
  "poker-roulette": "Poker Roulette — A mix of poker and roulette! Bet on suits and cards on the roulette board.",
  "texas-holdem": "Texas Hold'em — Classic Texas Hold'em Poker against dealer. Bet, raise, and make the best 5-card hand!",
  "race-betting": "Race Betting — Bet on your favorite horses across different odds and win big when they cross the finish line first!",
  "red-vs-black": "Red vs Black — Place your chips on Red or Black. The dealer reveals the card and the winning color takes the payout with 2x multiplier!",
  "rummy": "Rummy — Classic Indian Rummy! Form valid sets and sequences to declare and win.",
  "sic-bo": "Sic Bo — Predict the outcome of the three dice! Bet on Big, Small, Triples, or specific totals.",
  "speed-baccarat": "Speed Baccarat — Fast-paced baccarat! Bet on Player, Banker or Tie in ultra-quick rounds.",
  "super-fruits": "Super Fruits — Classic retro fruit machine with juicy payouts and scatter bonuses.",
  "sweet-bonanza": "Sweet Bonanza — Tumbling sweet symbols with huge multipliers and free spins!",
  "tai-xiu": "Tai Xiu — Traditional Asian dice game. Bet on Over or Under total dice points.",
  "teen-patti": "Teen Patti — The ultimate 3-card poker game! Chaal, blind, and show to win the pot.",
  "teen-patti-999": "Teen Patti 999 — Get as close to 999 as possible with your three cards to win.",
  "teen-patti-ak47": "Teen Patti AK47 — A, K, 4, and 7 cards act as wild jokers! Huge hand combinations.",
  "teen-patti-best-of-four": "Teen Patti Best of Four — Play with four cards and select the best three to beat the table.",
  "teen-patti-faceoff": "Teen Patti Faceoff — One-on-one head to head Teen Patti battle.",
  "teen-patti-hukam": "Teen Patti Hukam — Random spade card chosen as Hukam joker for wild wins.",
  "teen-patti-joker": "Teen Patti Joker — Joker wildcards increase your chances of hitting trails and pure sequences.",
  "thai-hi-lo": "Thai Hi Lo — Traditional Thai high-low dice action with authentic betting layout.",
  "three-card-poker": "Three Card Poker — Play against the dealer with 3 cards. Pair Plus and Ante bets.",
  "three-cards": "Three Cards — Fast three card casino showdown.",
  "tower-betting": "Tower Betting — Climb floor by floor without triggering traps to multiply your wager.",
  "treasure-bowl": "Treasure Bowl — Golden fortune slots with expanding reels and bonus bowls.",
  "wheel-betting": "Wheel Betting — Spin the lucky fortune wheel with up to 50x multipliers."
};

const HOWTO_UR: Record<string, string> = {
  "aviator-x": "ایوی ایٹر X — 3 بیٹ پینلز، تیز ملٹی پلائر، کریش 100x سے کم، کیش آؤٹ زیادہ سے زیادہ 99.98x۔ راؤنڈ شروع ہونے سے پہلے بیٹ لگائیں، کریش سے پہلے کیش آؤٹ کریں۔",
  limbo: "ٹارگٹ ملٹی پلائر سیٹ کریں (1.01x – 1,000,000x) اور Bet دبائیں۔ اگر نتیجہ آپ کے ٹارگٹ کے برابر یا زیادہ آئے تو آپ ٹارگٹ × بیٹ   جیتتے ہیں۔",
    mines: "بیٹ اور مائنز (1–24) منتخب کریں۔ 5×5 گرڈ پر ٹائلز کھولیں — جیم ملنے پر ملٹی پلائر بڑھتا ہے، مائن پر سب ختم۔ کبھی بھی کیش آؤٹ کریں۔",
  "lucky-777": "بیٹ منتخب کر کے SPIN دبائیں۔ درمیانی پے لائن پر تین ایک جیسے سمبلز = جیت۔ 7 7 7 = 777× جیک پاٹ!",
  aviator: "راؤنڈ شروع ہونے سے پہلے بیٹ لگائیں۔ جہاز اُڑتا ہے اور ملٹی پلائر بڑھتا ہے — جہاز کے کریش ہونے سے پہلے کیش آؤٹ دبائیں۔ جتنا زیادہ ملٹی پلائر، اتنی زیادہ جیت۔",
  "chicken-road-2": "بیٹ اور ڈفیکلٹی منتخب کر کے PLAY دبائیں۔ ہر GO پر مرغی اگلی لین پار کرتی ہے اور ملٹی پلائر بڑھتا ہے۔ کسی بھی لین پر گاڑی آ سکتی ہے — اس سے پہلے کیش آؤٹ کریں۔",
  "chicken-dash": "بیٹ اور لیول (Easy 28 · Normal 24 · Hard 20 ٹائلز) منتخب کر کے START دبائیں۔ ہر GO پر ملٹی پلائر بڑھتا ہے — کبھی بھی کیش آؤٹ کریں۔ ڈیش بوسٹ 2–3 محفوظ ٹائلز اسپرنٹ کرتا ہے، بونس بیگ اٹھا کر کیش آؤٹ کریں تو اضافی بونس۔",
  plinko: "بیٹ، رسک (Low/Medium/High) اور رَوز (8–16) منتخب کر کے Bet دبائیں۔ ہر 100 الگ کھلاڑیوں کے سائیکل میں 2 کو 0.2x، 5 کو 1.3x، 3 کو 0.9x اور 90 کو 0x کلیم ملتا ہے۔ 1x سے کم جزوی واپسی ہے، منافع نہیں۔ 25x صرف اسکیل کا نشان ہے، ادائیگی کا امکان 0% ہے۔",
  "dragon-tiger":   "ہر راؤنڈ 10 سیکنڈ بیٹنگ۔ چپ منتخب کر کے Dragon، Tie یا Tiger پر ٹیپ کریں۔ بڑا کارڈ جیتتا ہے (A سب سے چھوٹا، K سب سے بڑا)۔ Dragon/Tiger/Tie 1:1؛ صرف جیتنے والے آپشن کی ادائیگی، باقی صفر۔ ہاؤس شیئر سے پہلے کل واپسی زیادہ سے زیادہ راؤنڈ بیٹ کا 2x۔",
  "andar-bahar":   "ہر راؤنڈ 10 سیکنڈ بیٹنگ۔ اندر یا باہر پر ٹیپ کریں۔ جوکر کھلتا ہے، پھر کارڈز اندر ← باہر ڈیل ہوتے ہیں؛ جس طرف پہلا same-rank کارڈ آئے وہ جیتتا ہے۔ اندر 0.9:1، باہر 1:1۔",
  "dice": "ڈائس بیٹنگ — جلد آ رہا ہے!",
  "dream-catcher": "ڈریم کیچر — جلد آ رہا ہے!",
  "european-roulette": "یورپی رولیٹی — جلد آ رہا ہے!",
  "evo-casino": "ایوو کیسینو — جلد آ رہا ہے!",
  "fishing-arcade": "فشنگ آرکیڈ — جلد آ رہا ہے!",
  "football-studio": "فٹ بال اسٹوڈیو — ہوم، اوے یا ڈرا پر شرط لگائیں! جس کا کارڈ بڑا ہوگا وہ جیتے گا۔",
  "fortune-gems": "فارچیون جیمز — 3x3 سلاٹ گیم 5 پے لائنز اور چوتھے ملٹی پلائر ریل کے ساتھ 15 گنا تک انعام!",
  "fortune-ox": "فارچیون آکس — 3 ریل سلاٹ 10 پے لائنز کے ساتھ! گولڈن بیل اور فل اسکرین 10x ملٹی پلائر۔",
  "fortune-toucan": "فارچیون ٹوکن — رین فاریسٹ 3x3 سلاٹ 5 پے لائنز اور گولڈن ٹوکن وائلڈز کے ساتھ!",
  "gates-of-olympus": "گیٹس آف اولمپس — 6×5 سلاٹ گرڈ پر 8 یا زیادہ سمبلز پر جیتیں! زبردست ملٹی پلائر اور فری اسپنز۔",
  "head-tail": "ہیڈ اینڈ ٹیل — ہیڈ یا ٹیل چنیں اور خوش قسمت سکہ اچھال کر فوری 2x انعام جیتیں!",
  "muflis": "مفلس — ریورس تین پتی! سب سے چھوٹا اور کمزور 3 کارڈ ہینڈ راؤنڈ جیتتا ہے۔",
  "poker": "پوکر — ڈیلر کے خلاف 5 کارڈ پوکر! بہترین ہینڈ بنانے پر 100 گنا تک زبردست انعامات۔",
  "rock-paper-scissors": "راک پیپر سیزرز — راک، پیپر یا سیزرز منتخب کریں اور فوری 1.96x انعام حاصل کریں!",
  "amar-akbar-anthony": "امر اکبر انتھونی — امر (حکم)، اکبر (پان) یا انتھونی (چڑیا) پر بیٹ لگائیں۔ کارڈ کے کھلنے پر فیصلہ!",
  "7-up-down": "7 اپ ڈاؤن — 2 ڈائس رول کریں! ڈاؤن (2-6)، لکی 7، یا اپ (8-12) پر شرط لگائیں۔ لکی 7 پر 5 گنا انعام!",
  "nine-wickets": "9 وکٹس لائیو — لائیو ٹی 20 کرکٹ! ہر گیند پر ڈاٹ، سنگل، چوکا، چھکا یا وکٹ پر شرط لگائیں۔",
  "32-cards": "32 کارڈز — پلیئر 8، 9، 10 اور 11 میں سے سب سے زیادہ ٹوٹل والا جیتتا ہے!",
  "auto-roulette": "آٹو رولیٹی — یورپی رولیٹی ٹیبل پر نمبرز یا رنگوں پر چپس لگائیں اور وہیل گھمائیں!",
  "baccarat": "بکارات — پلیئر، بینکر یا ٹائی پر بیٹ لگائیں۔ 9 کے قریب ترین جیتنے والا ہوتا ہے!",
  "blackjack": "بلیک جیک — ڈیلر کو ہرانے کی کوشش کریں! 21 کے قریب پہنچیں، لیکن اس سے اوپر نہ جائیں۔",
  "birds-beasts": "پرندے اور جانور — جانوروں پر شرط لگائیں۔ پہیہ گھومے گا اور اگر آپ کے جانور پر رکے گا تو آپ جیت جائیں گے!",
  "blast-off": "بلاسٹ آف — راکٹ اڑتا ہے اور ملٹی پلائر بڑھتا ہے! کریش ہونے سے پہلے کیش آؤٹ کریں۔",
  "bollywood-casino": "بالی وڈ کیسینو — اندر، باہر یا ٹائی پر شرط لگائیں۔ دیسی انداز میں بڑی جیت!",
  "casino-war": "کیسینو وار — سب سے آسان کارڈ گیم! جس کا کارڈ بڑا، وہ جیتا۔ ٹائی پر ڈبل شرط کے ساتھ وار (جنگ) ہوتی ہے۔",
  "crash-bonus": "کریش بونس — بڑا رسک، بڑا انعام! ملٹی پلائر بڑھنے دیں اور کریش ہونے سے پہلے کیش آؤٹ کریں۔",
  "crash-cricket": "کریش کرکٹ — چھکا لگائیں! گیند جتنا دور جائے گی، ملٹی پلائر بڑھے گا۔ کریش ہونے سے پہلے جیت لیں۔",
  "crash-goal": "کریش گول — گول کریں! فٹ بال اوپر جاتا ہے اور ملٹی پلائر بڑھتا ہے۔ پھٹنے سے پہلے کیش آؤٹ کریں۔",
  "derby-race": "ڈربی ریس — اپنی پسندیدہ گھوڑوں پر شرط لگائیں اور جیتیں!",
  "diao-chan": "دیاؤ چن — خوبصورت ایشین تھیم والی سلاٹ گیم۔ گھمائیں اور جیتیں!",
  "hotline": "ہاٹ لائن کیسینو — 80 کی دہائی کے میامی میں خوش آمدید! نیین لائٹس اور بڑے جیک پاٹس۔",
  "keno": "کینو — اپنے خوش قسمت نمبر چنیں! جتنے زیادہ نمبر ملیں گے، انعام اتنا ہی بڑا ہوگا۔",
  "lightning-roulette": "لائٹننگ رولیٹی — ذاتی راؤنڈ، کل شرط کی رقم کا زیادہ سے زیادہ دو گنا مجموعی ریٹرن۔",
  "ludo": "لڈو بیٹنگ — رنگوں پر شرط لگائیں اور پاسہ پھینکیں۔ کلاسک لڈو کیسینو کے انداز میں۔",
  "mini-roulette": "منی رولیٹی — 12 نمبروں والی تیز رولیٹی گیم۔",
  "monster-hilo": "مانسٹر ہائی لو — اندازہ لگائیں کہ اگلا کارڈ بڑا ہوگا یا چھوٹا۔",
  "poker-betting": "پوکر بیٹنگ — پوکر ہینڈز پر شرط لگائیں۔ آسان اور منافع بخش۔",
  "poker-roulette": "پوکر رولیٹی — پوکر اور رولیٹی کا شاندار امتزاج!",
  "texas-holdem": "ٹیکساس ہولڈم — کلاسک ٹیکساس ہولڈم پوکر۔ ڈیلر کے خلاف بیٹ لگائیں اور بہترین 5 کارڈ ہینڈ بنا کر جیتیں!",
  "race-betting": "ریس بیٹنگ — اپنے پسندیدہ گھوڑے پر شرط لگائیں اور جیتیں!",
  "red-vs-black": "ریڈ بمقابلہ بلیک — ریڈ یا بلیک پر شرط لگائیں۔ صحیح رنگ آنے پر 2 گنا جیتیں!",
  "rummy": "رمی — کلاسک انڈین رمی کارڈ گیم۔ درست سیٹس بنائیں اور جیتیں۔",
  "sic-bo": "سک بو — تین ڈائس کے نتائج پر شرط لگائیں!",
  "speed-baccarat": "اسپیڈ بکارات — تیز رفتار بکارات گیم۔",
  "super-fruits": "سپر فروٹس — کلاسک فروٹ سلاٹ مشین۔",
  "sweet-bonanza": "سویٹ بونانزا — زبردست ملٹی پلائرز والی کینڈی سلاٹ!",
  "tai-xiu": "تائی شیو — ایشین ڈائس گیم۔",
  "teen-patti": "تین پتی — کلاسک تین پتی گیم!",
  "teen-patti-999": "تین پتی 999 — 999 کے قریب ترین ٹوٹل بنائیں اور جیتیں۔",
  "teen-patti-ak47": "تین پتی AK47 — A، K، 4 اور 7 وائلڈ جوکرز ہیں۔",
  "teen-patti-best-of-four": "تین پتی بیسٹ آف فور — چار میں سے بہترین تین کارڈز چنیں۔",
  "teen-patti-faceoff": "تین پتی فیس آف — ون آن ون مقابلہ۔",
  "teen-patti-hukam": "تین پتی حکم — حکم جوکر کے ساتھ بڑا انعام۔",
  "teen-patti-joker": "تین پتی جوکر — جوکر کارڈز کے ساتھ زبردست کمبینیشن۔",
  "thai-hi-lo": "تھائی ہائی لو — روایتی تھائی ڈائس بیٹنگ۔",
  "three-card-poker": "تھری کارڈ پوکر — 3 کارڈز کے ساتھ ڈیلر کو ہرائیں۔",
  "three-cards": "تھری کارڈز — تیز رفتار تین کارڈ کیسینو گیم۔",
  "tower-betting": "ٹاور بیٹنگ — ٹاور کی منزلیں چڑھیں اور ملٹی پلائر بڑھائیں۔",
  "treasure-bowl": "ٹریژر باؤل — سنہری باؤل سلاٹ مشین۔",
  "wheel-betting": "وہیل بیٹنگ — خوش قسمت پہیہ گھمائیں اور 50x تک جیتیں۔"
};

export { GAME_SLUGS } from "@/lib/gameCatalog";

export function GameView({ slug, backHref = "/", isScreenFit = false }: { slug: string; backHref?: string; isScreenFit?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const exitGame = useCallback(() => {
    if (hasGameReturn()) router.back();
    else router.replace(backHref);
  }, [backHref, router]);
  useEffect(() => {
    fetchServerBalance();
  }, [slug]);
  useEffect(() => {
    const exit = () => exitGame();
    window.addEventListener("wx:exit-game", exit);
    return () => window.removeEventListener("wx:exit-game", exit);
  }, [exitGame]);
  const handleGameNavigation = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const destination = new URL(link.href, window.location.href);
    const fallback = new URL(backHref, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname !== fallback.pathname) return;
    event.preventDefault();
    event.stopPropagation();
    exitGame();
  };
  let body: React.ReactNode;
  let title = "";
  if (slug === "aviator") { body = <AviatorGame table="aviator" backHref={backHref} isScreenFit={isScreenFit} />; }
  else if (slug === "aviator-x") { body = <AviatorGame table="aviator-x" backHref={backHref} isScreenFit={isScreenFit} />; }
  else if (slug === "limbo") { body = <LimboGame backHref={backHref} />; }
  else if (slug === "mines") { body = <MinesGame backHref={backHref} />; }
  else if (slug === "lucky-777") { body = <Slot777Game backHref={backHref} />; }
  else if (slug === "chicken-road-2") { title = "Chicken Road 2"; body = <ChickenRoadGame backHref={backHref} />; }
  else if (slug === "chicken-dash") { body = <ChickenDashGame backHref={backHref} />; }
  else if (slug === "plinko") { body = <PlinkoGame backHref={backHref} />; }
  else if (slug === "dragon-tiger" || slug === "andar-bahar") { body = <CardTable table={slug} backHref={backHref} />; }
  else if (slug === "texas-holdem") { body = <TexasHoldemGame />; }
  else if (slug === "birds-beasts") { body = <BirdsBeastsGame backHref={backHref} />; }
  else if (slug === "blackjack") { body = <BlackjackGame backHref={backHref} />; }
  else if (slug === "baccarat") { body = <BaccaratGame backHref={backHref} />; }
  else if (slug === "dice") { body = <DiceGame backHref={backHref} />; }
  else if (slug === "dream-catcher") { body = <DreamCatcherGame backHref={backHref} />; }
  else if (slug === "european-roulette") { body = <RouletteGame backHref={backHref} />; }
  else if (slug === "evo-casino") { body = <EvoCasinoGame backHref={backHref} />; }
  else if (slug === "fishing-arcade") { body = <FishingGame backHref={backHref} />; }
  else if (slug === "football-studio") { body = <FootballStudioGame backHref={backHref} />; }
  else if (slug === "fortune-gems") { body = <FortuneGemsGame backHref={backHref} />; }
  else if (slug === "fortune-ox") { body = <FortuneOxGame backHref={backHref} />; }
  else if (slug === "fortune-toucan") { body = <FortuneToucanGame backHref={backHref} />; }
  else if (slug === "gates-of-olympus") { body = <GatesOfOlympusGame backHref={backHref} />; }
  else if (slug === "head-tail") { body = <HeadTailGame backHref={backHref} />; }
  else if (slug === "muflis") { body = <MuflisGame backHref={backHref} />; }
  else if (slug === "poker") { body = <PokerGame backHref={backHref} />; }
  else if (slug === "rock-paper-scissors") { body = <RockPaperScissorsGame backHref={backHref} />; }
  else if (slug === "amar-akbar-anthony") { body = <AmarAkbarAnthonyGame backHref={backHref} />; }
  else if (slug === "7-up-down") { body = <SevenUpDownGame backHref={backHref} />; }
  else if (slug === "nine-wickets") { body = <NineWicketsGame backHref={backHref} />; }
  else if (slug === "32-cards") { body = <ThirtyTwoCardsGame backHref={backHref} />; }
  else if (slug === "auto-roulette") { body = <AutoRouletteGame backHref={backHref} />; }
  else if (slug === "blast-off") { body = <BlastOffGame />; }
  else if (slug === "bollywood-casino") { body = <BollywoodCasinoGame />; }
  else if (slug === "casino-war") { body = <CasinoWarGame />; }
  else if (slug === "crash-bonus") { body = <CrashBonusGame />; }
  else if (slug === "crash-cricket") { body = <CrashCricketGame />; }
  else if (slug === "crash-goal") { body = <CrashGoal />; }
  else if (slug === "derby-race") { body = <DerbyRaceApp />; }
  else if (slug === "diao-chan") { body = <DiaoChanGame />; }
  else if (slug === "hotline") { body = <HotlineGame />; }
  else if (slug === "keno") { body = <KenoGame />; }
  else if (slug === "lightning-roulette") { body = <LightningRouletteGame />; }
  else if (slug === "ludo") { body = <LudoGame />; }
  else if (slug === "mini-roulette") { body = <MiniRouletteGame />; }
  else if (slug === "monster-hilo") { body = <MonsterHiloGame />; }
  else if (slug === "poker-betting") { body = <PokerBettingGame />; }
  else if (slug === "poker-roulette") { body = <PokerRouletteGame />; }
  else if (slug === "race-betting") { body = <RaceBettingGame />; }
  else if (slug === "red-vs-black") { body = <RedVsBlackGame />; }
  else if (slug === "rummy") { body = <RummyGame />; }
  else if (slug === "sic-bo") { body = <SicBoGame />; }
  else if (slug === "speed-baccarat") { body = <SpeedBaccaratGame />; }
  else if (slug === "super-fruits") { body = <SuperFruitsGame />; }
  else if (slug === "sweet-bonanza") { body = <SweetBonanzaGame />; }
  else if (slug === "tai-xiu") { body = <TaiXiuGame />; }
  else if (slug === "teen-patti") { body = <TeenPattiGame />; }
  else if (slug === "teen-patti-999") { body = <TeenPatti999Game />; }
  else if (slug === "teen-patti-ak47") { body = <TeenPattiAK47 />; }
  else if (slug === "teen-patti-best-of-four") { body = <TeenPattiBestOfFourGame />; }
  else if (slug === "teen-patti-faceoff") { body = <TeenPattiFaceoffGame />; }
  else if (slug === "teen-patti-hukam") { body = <TeenPattiHukamGame />; }
  else if (slug === "teen-patti-joker") { body = <TeenPattiJokerGame />; }
  else if (slug === "thai-hi-lo") { body = <ThaiHiLoGame />; }
  else if (slug === "three-card-poker") { body = <ThreeCardPokerGame />; }
  else if (slug === "three-cards") { body = <ThreeCardsGame />; }
  else if (slug === "tower-betting") { body = <TowerGame />; }
  else if (slug === "treasure-bowl") { body = <TreasureBowlGame />; }
  else if (slug === "wheel-betting") { body = <WheelBettingGame />; }
  else {
    title = HOWTO[slug]?.split("—")[0]?.trim() || slug;
    body = (
      <div className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border border-dashed border-[#8b5cf6]/60 bg-[#140c2a]/50 p-8 text-center">
        <div className="text-4xl mb-4">🚀</div>
        <h2 className="text-xl font-black text-white mb-2">{title} is Coming Soon!</h2>
        <p className="text-[#b8a7e6] text-sm">This game is currently being integrated and will be fully playable soon.</p>
      </div>
    );
  }

  const FRAMED_GAMES = [
    "aviator", "aviator-x", "birds-beasts", "blackjack", "chicken-dash", "mines", "dragon-tiger", "limbo",
    "baccarat", "andar-bahar", "chicken-road-2", "plinko", "lucky-777", "dice", "dream-catcher", "european-roulette",
    "evo-casino", "fishing-arcade", "football-studio", "fortune-gems", "fortune-ox", "fortune-toucan", "gates-of-olympus", "head-tail",
    "muflis", "poker", "rock-paper-scissors", "amar-akbar-anthony", "7-up-down", "nine-wickets", "32-cards", "auto-roulette",
    "blast-off", "bollywood-casino", "casino-war", "crash-bonus", "crash-cricket", "crash-goal", "derby-race", "diao-chan",
    "hotline", "keno", "lightning-roulette", "ludo", "mini-roulette", "monster-hilo", "poker-betting", "poker-roulette",
    "race-betting", "red-vs-black", "rummy", "sic-bo", "speed-baccarat", "super-fruits", "sweet-bonanza", "tai-xiu",
    "teen-patti", "teen-patti-999", "teen-patti-ak47", "teen-patti-best-of-four", "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-joker", "texas-holdem",
    "thai-hi-lo", "three-card-poker", "three-cards", "tower-betting", "treasure-bowl", "wheel-betting"
  ];

  const framed = FRAMED_GAMES.includes(slug);

  // Blackjack settles before its dealer animation and displays its own result afterwards.
  return (
    <SharedGameResults value={slug !== "blackjack"}>
      {slug !== "blackjack" && <GameResultPopup key={slug} game={slug} />}
      <div onClickCapture={handleGameNavigation} data-game-frame={framed ? slug : undefined} className={framed ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain" : "space-y-4"}>
        {!framed && title && (
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-white">{title}</h1>
            <Link href={backHref} className="text-sm text-slate-400 hover:text-white">{t("allGames")}</Link>
          </div>
        )}
        <div className={framed ? "game-surface wx-game h-full min-h-0 w-full shrink-0 overflow-y-auto overflow-x-hidden" : "game-surface"}>{isDailyPoolGame(slug) ? <DailyPoolNotice key={slug} game={slug}>{body}</DailyPoolNotice> : body}</div>
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
          <b className="text-white">{t("howToPlay")}</b> {locale === "ur" ? (HOWTO_UR[slug] ?? HOWTO[slug]) : HOWTO[slug]}
        </div>
      </div>
    </SharedGameResults>
  );
}
