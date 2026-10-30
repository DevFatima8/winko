import type { ReactNode } from "react";
import { BanknoteIcon, CalendarIcon, CrownIcon, HeartHandIcon, LifeBuoyIcon, MedalIcon, PercentIcon, ShieldIcon, TargetIcon, UsersIcon, BookIcon, MessageSquareIcon } from "@/components/Icons";

export type InfoPage = {
  slug: string;
  title: string;
  titleUr: string;
  subtitle: string;
  subtitleUr: string;
  icon: ReactNode;
  sections: { h: string; hUr: string; p: string[]; pUr: string[] }[];
  cta?: { label: string; labelUr: string; href: string; auth?: boolean };
};

const I = (C: (p: { size?: number }) => ReactNode) => <C size={28} />;

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "mission", title: "Daily Missions", titleUr: "روزانہ مشنز", subtitle: "Complete simple tasks every day and earn bonus rewards.", subtitleUr: "روزانہ آسان ٹاسک مکمل کریں اور بونس انعامات کمائیں۔", icon: I(TargetIcon),
    sections: [
      { h: "How missions work", hUr: "مشنز کیسے کام کرتے ہیں", p: ["Every day you get a set of missions — e.g. play 5 rounds of Aviator, place a bet on Dragon Tiger, make a deposit, or invite a friend.", "Each completed mission gives you a reward (bonus balance or free bet). Rewards are credited by admin within 24 hours of completion."], pUr: ["ہر روز آپ کو کچھ مشنز ملتے ہیں — مثلاً ایوی ایٹر کے 5 راؤنڈ کھیلیں، ڈریگن ٹائیگر پر بیٹ لگائیں، ڈپازٹ کریں یا دوست کو انوائٹ کریں۔", "ہر مکمل مشن پر انعام ملتا ہے (بونس بیلنس یا فری بیٹ)۔ انعام ایڈمن 24 گھنٹوں میں کریڈٹ کرتا ہے۔"] },
      { h: "Today's missions", hUr: "آج کے مشنز", p: ["• Play 10 rounds in any game — Rs. 50 bonus", "• Deposit Rs. 1,000 or more — 7% extra bonus", "• Invite 1 friend who deposits — Rs. 588 bonus", "• Win 3 rounds in Chicken Dash — Rs. 100 bonus"], pUr: ["• کسی بھی گیم کے 10 راؤنڈ کھیلیں — 50 روپے بونس", "• 1,000 روپے یا زیادہ ڈپازٹ کریں — 7% اضافی بونس", "• 1 دوست انوائٹ کریں جو ڈپازٹ کرے — 588 روپے بونس", "• چکن ڈیش میں 3 راؤنڈ جیتیں — 100 روپے بونس"] },
      { h: "Claiming", hUr: "کلیم کرنا", p: ["Missions are tracked automatically from your game and deposit history. To claim, message Live Support with 'Mission claim' and the mission name — our team verifies and adds the reward to your wallet."], pUr: ["مشنز آپ کی گیم اور ڈپازٹ ہسٹری سے خودکار ٹریک ہوتے ہیں۔ کلیم کے لیے لائیو سپورٹ کو 'Mission claim' اور مشن کا نام لکھ کر بھیجیں — ہماری ٹیم تصدیق کر کے انعام والٹ میں ڈال دیتی ہے۔"] },
    ],
    cta: { label: "Play games now", labelUr: "ابھی گیمز کھیلیں", href: "/#games" },
  },
  {
    slug: "rebate", title: "Daily Rebate / Cashback", titleUr: "روزانہ ریبیٹ / کیش بیک", subtitle: "Get a percentage of every bet back — win or lose.", subtitleUr: "ہر بیٹ کا ایک حصہ واپس پائیں — جیتیں یا ہاریں۔", icon: I(PercentIcon),
    sections: [
      { h: "Rebate rates", hUr: "ریبیٹ ریٹس", p: ["Bronze / Silver: 0.5% of total daily bets", "Gold / Platinum: 0.8% of total daily bets", "Diamond / Royal / Legend: 1.2% of total daily bets", "Rebate is calculated on your total turnover for the day (00:00–23:59 PKT), regardless of win or loss."], pUr: ["برانز / سلور: روزانہ کل بیٹس کا 0.5%", "گولڈ / پلاٹینم: روزانہ کل بیٹس کا 0.8%", "ڈائمنڈ / رائل / لیجنڈ: روزانہ کل بیٹس کا 1.2%", "ریبیٹ دن (00:00–23:59 PKT) کے کل ٹرن اوور پر شمار ہوتا ہے، جیت یا ہار سے قطع نظر۔"] },
      { h: "How to claim", hUr: "کلیم کیسے کریں", p: ["Rebate for each day is available for claim after 00:00 the next day. Message Live Support with 'Rebate claim' — it is added to your wallet balance within 24 hours. Unclaimed rebate expires after 7 days."], pUr: ["ہر دن کا ریبیٹ اگلے دن 00:00 کے بعد کلیم کے لیے دستیاب ہوتا ہے۔ لائیو سپورٹ کو 'Rebate claim' لکھیں — 24 گھنٹوں میں والٹ میں شامل ہو جاتا ہے۔ 7 دن بعد غیر کلیم شدہ ریبیٹ ختم ہو جاتا ہے۔"] },
    ],
    cta: { label: "View my bet history", labelUr: "میری بیٹ ہسٹری", href: "/player/history", auth: true },
  },
  {
    slug: "vip", title: "VIP Club", titleUr: "VIP کلب", subtitle: "Higher level, higher withdrawal limits and better rewards.", subtitleUr: "جتنا اونچا لیول، اتنی زیادہ وِدڈرا حد اور بہتر انعامات۔", icon: I(CrownIcon),
    sections: [
      { h: "How levels work", hUr: "لیولز کیسے کام کرتے ہیں", p: ["Your VIP level is based on your total approved deposits. It upgrades automatically — no application needed.", "Each level unlocks a higher daily withdrawal limit, higher per-withdrawal maximum, better rebate rate and priority support."], pUr: ["آپ کا VIP لیول آپ کے کل منظور شدہ ڈپازٹ پر مبنی ہے۔ یہ خودکار اپ گریڈ ہوتا ہے — کوئی درخواست نہیں۔", "ہر لیول زیادہ روزانہ وِدڈرا حد، زیادہ فی وِدڈرا میکسیمم، بہتر ریبیٹ ریٹ اور ترجیحی سپورٹ کھولتا ہے۔"] },
      { h: "Level table", hUr: "لیول ٹیبل", p: ["VIP_TABLE"], pUr: ["VIP_TABLE"] },
      { h: "VIP perks", hUr: "VIP فوائد", p: ["• Priority withdrawals (processed first)", "• Higher rebate & exclusive promos", "• Personal support agent for Diamond and above", "• Birthday & festival bonuses"], pUr: ["• ترجیحی وِدڈرا (سب سے پہلے پروسیس)", "• زیادہ ریبیٹ اور خصوصی پرومو", "• ڈائمنڈ اور اوپر کے لیے ذاتی سپورٹ ایجنٹ", "• سالگرہ اور تہوار بونس"] },
    ],
    cta: { label: "See my VIP progress", labelUr: "میری VIP پروگریس", href: "/player/profile", auth: true },
  },
  {
    slug: "invite", title: "Invite & Earn", titleUr: "انوائٹ کریں اور کمائیں", subtitle: "Share your referral link and earn lifetime commission.", subtitleUr: "اپنا ریفرل لنک شیئر کریں اور تاحیات کمیشن کمائیں۔", icon: I(UsersIcon),
    sections: [
      { h: "How it works", hUr: "یہ کیسے کام کرتا ہے", p: ["1. Copy your personal referral link from your Profile page.", "2. Share it with friends on WhatsApp, Facebook, TikTok — anywhere.", "3. When your friend registers through your link and deposits, you earn commission automatically."], pUr: ["1۔ اپنے پروفائل پیج سے اپنا ذاتی ریفرل لنک کاپی کریں۔", "2۔ واٹس ایپ، فیس بک، ٹک ٹاک — کہیں بھی دوستوں کو بھیجیں۔", "3۔ جب آپ کا دوست آپ کے لنک سے رجسٹر ہو کر ڈپازٹ کرے تو آپ کو خودکار کمیشن ملتا ہے۔"] },
      { h: "Commission", hUr: "کمیشن", p: ["REF_RATES", "Commission is credited instantly to your wallet balance and can be withdrawn or used to play. There is no limit on how many friends you can invite."], pUr: ["REF_RATES", "کمیشن فوراً آپ کے والٹ بیلنس میں شامل ہوتا ہے اور اسے نکالا یا کھیلا جا سکتا ہے۔ دوستوں کی تعداد کی کوئی حد نہیں۔"] },
      { h: "Become an agent", hUr: "ایجنٹ بنیں", p: ["Active promoters can be upgraded to an Agent account with a higher commission rate. Contact Live Support to apply."], pUr: ["فعال پروموٹرز کو زیادہ کمیشن ریٹ کے ساتھ ایجنٹ اکاؤنٹ میں اپ گریڈ کیا جا سکتا ہے۔ درخواست کے لیے لائیو سپورٹ سے رابطہ کریں۔"] },
    ],
    cta: { label: "Get my referral link", labelUr: "میرا ریفرل لنک", href: "/player/profile", auth: true },
  },
  {
    slug: "event", title: "Events & Tournaments", titleUr: "ایونٹس اور ٹورنامنٹس", subtitle: "Weekly leaderboards and special events with big prize pools.", subtitleUr: "ہفتہ وار لیڈر بورڈ اور بڑے انعامی پول کے ساتھ خصوصی ایونٹس۔", icon: I(CalendarIcon),
    sections: [
      { h: "Weekly Top Winners", hUr: "ہفتہ وار ٹاپ جیتنے والے", p: ["Every week (Monday–Sunday) the top 20 players by total winnings share a prize pool. Rank 1 gets a bonus of Rs. 20,000, rank 2 Rs. 10,000, rank 3 Rs. 5,000, ranks 4–20 Rs. 500 each. Winners are shown on the home page leaderboard."], pUr: ["ہر ہفتے (پیر تا اتوار) کل جیت کے لحاظ سے ٹاپ 20 کھلاڑی انعامی پول شیئر کرتے ہیں۔ رینک 1 کو 20,000، رینک 2 کو 10,000، رینک 3 کو 5,000 اور رینک 4–20 کو 500 روپے۔ جیتنے والے ہوم پیج لیڈر بورڈ پر دکھائے جاتے ہیں۔"] },
      { h: "Special events", hUr: "خصوصی ایونٹس", p: ["• Weekend Deposit Boost — extra 3% on Saturday & Sunday deposits", "• Aviator 100x Challenge — cash out above 100x and get Rs. 1,000 extra", "• Eid / New Year festival bonuses announced via notifications"], pUr: ["• ویک اینڈ ڈپازٹ بوسٹ — ہفتہ اور اتوار کے ڈپازٹ پر اضافی 3%", "• ایوی ایٹر 100x چیلنج — 100x سے اوپر کیش آؤٹ کریں اور 1,000 روپے اضافی پائیں", "• عید / نئے سال کے تہوار بونس نوٹیفکیشن کے ذریعے اعلان ہوتے ہیں"] },
    ],
    cta: { label: "See promotions", labelUr: "پروموشنز دیکھیں", href: "/promo" },
  },
  {
    slug: "fund", title: "Rescue Fund", titleUr: "ریسکیو فنڈ", subtitle: "Weekly loss protection — get part of your losses back.", subtitleUr: "ہفتہ وار نقصان کا تحفظ — اپنے نقصان کا کچھ حصہ واپس پائیں۔", icon: I(LifeBuoyIcon),
    sections: [
      { h: "How it works", hUr: "یہ کیسے کام کرتا ہے", p: ["If you end the week (Mon–Sun) with a net loss, you receive a rescue fund on Monday: 5% of net loss for Bronze–Gold, 8% for Platinum–Royal, 10% for Legend. Maximum Rs. 100,000 per week.", "The rescue fund is credited as bonus balance and must be wagered 1x before withdrawal."], pUr: ["اگر آپ ہفتہ (پیر تا اتوار) خالص نقصان کے ساتھ ختم کریں تو پیر کو ریسکیو فنڈ ملتا ہے: برانز–گولڈ کے لیے خالص نقصان کا 5%، پلاٹینم–رائل کے لیے 8%، لیجنڈ کے لیے 10%۔ ہفتہ وار زیادہ سے زیادہ 100,000 روپے۔", "ریسکیو فنڈ بونس بیلنس کے طور پر ملتا ہے اور وِدڈرا سے پہلے 1x کھیلنا ضروری ہے۔"] },
      { h: "Claim", hUr: "کلیم", p: ["Message Live Support on Monday with 'Rescue fund'. Our team checks your weekly net result and credits the amount within 24 hours."], pUr: ["پیر کو لائیو سپورٹ کو 'Rescue fund' لکھیں۔ ہماری ٹیم ہفتہ وار خالص نتیجہ چیک کر کے 24 گھنٹوں میں رقم کریڈٹ کرتی ہے۔"] },
    ],
    cta: { label: "Contact Live Support", labelUr: "لائیو سپورٹ سے رابطہ", href: "/support" },
  },
  {
    slug: "support", title: "Online Support", titleUr: "آن لائن سپورٹ", subtitle: "We're here to help — live chat, WhatsApp and Telegram.", subtitleUr: "ہم مدد کے لیے حاضر ہیں — لائیو چیٹ، واٹس ایپ اور ٹیلیگرام۔", icon: I(MessageSquareIcon),
    sections: [
      { h: "Support channels", hUr: "سپورٹ چینلز", p: ["SUPPORT_CHANNELS"], pUr: ["SUPPORT_CHANNELS"] },
      { h: "Support hours", hUr: "سپورٹ اوقات", p: ["SUPPORT_HOURS"], pUr: ["SUPPORT_HOURS"] },
      { h: "Common questions", hUr: "عام سوالات", p: ["Deposit not credited? Send your Transaction ID (TID) and the amount in live chat.", "Withdrawal pending? Withdrawals are processed within 24 hours. Check daily VIP limits on your Profile.", "Forgot password or PIN? Contact support with your registered phone number for verification."], pUr: ["ڈپازٹ کریڈٹ نہیں ہوا؟ لائیو چیٹ میں اپنا ٹرانزیکشن آئی ڈی (TID) اور رقم بھیجیں۔", "وِدڈرا پینڈنگ؟ وِدڈرا 24 گھنٹوں میں پروسیس ہوتا ہے۔ پروفائل پر روزانہ VIP حد چیک کریں۔", "پاس ورڈ یا پن بھول گئے؟ تصدیق کے لیے اپنے رجسٹرڈ فون نمبر کے ساتھ سپورٹ سے رابطہ کریں۔"] },
    ],
    cta: { label: "Open Help Center", labelUr: "ہیلپ سینٹر کھولیں", href: "/help" },
  },
  {
    slug: "terms", title: "Terms & Conditions", titleUr: "شرائط و ضوابط", subtitle: "Rules of using winkox.", subtitleUr: "winkox استعمال کرنے کے قواعد۔", icon: I(BookIcon),
    sections: [
      { h: "Eligibility", hUr: "اہلیت", p: ["You must be 18 years or older to register and play. One account per person, phone number and device. Duplicate accounts will be closed and balances forfeited."], pUr: ["رجسٹر اور کھیلنے کے لیے آپ کی عمر 18 سال یا زیادہ ہونی چاہیے۔ فی شخص، فون نمبر اور ڈیوائس ایک اکاؤنٹ۔ ڈپلیکیٹ اکاؤنٹ بند کر کے بیلنس ضبط کر لیا جائے گا۔"] },
      { h: "Deposits & withdrawals", hUr: "ڈپازٹ اور وِدڈرا", p: ["Deposits are credited after verification of the Transaction ID. Withdrawals require a correct Withdrawal PIN and are subject to VIP daily limits. Withdrawals are sent only to accounts in the user's own name.", "Bonus balances may carry wagering requirements as stated in the promotion."], pUr: ["ڈپازٹ ٹرانزیکشن آئی ڈی کی تصدیق کے بعد کریڈٹ ہوتا ہے۔ وِدڈرا کے لیے درست وِدڈرا پن ضروری ہے اور VIP روزانہ حدود لاگو ہیں۔ وِدڈرا صرف صارف کے اپنے نام کے اکاؤنٹ میں بھیجا جاتا ہے۔", "بونس بیلنس پر پروموشن میں بیان کردہ ویجرنگ شرائط لاگو ہو سکتی ہیں۔"] },
      { h: "Fair play", hUr: "منصفانہ کھیل", p: ["All games use server-side random outcomes. Any use of bots, exploits, multiple accounts or collusion results in permanent ban. winkox reserves the right to void bets placed during technical errors."], pUr: ["تمام گیمز سرور سائیڈ رینڈم نتائج استعمال کرتی ہیں۔ بوٹس، ایکسپلائٹس، ملٹیپل اکاؤنٹس یا ملی بھگت پر مستقل پابندی۔ تکنیکی خرابی کے دوران لگائی گئی بیٹس منسوخ کرنے کا حق winkox کے پاس محفوظ ہے۔"] },
    ],
  },
  {
    slug: "privacy", title: "Privacy Policy", titleUr: "پرائیویسی پالیسی", subtitle: "How we handle your data.", subtitleUr: "ہم آپ کا ڈیٹا کیسے سنبھالتے ہیں۔", icon: I(ShieldIcon),
    sections: [
      { h: "Data we collect", hUr: "ہم کون سا ڈیٹا لیتے ہیں", p: ["Name, phone number, optional email, payment account numbers used for deposit/withdrawal, and your game and transaction history."], pUr: ["نام، فون نمبر، اختیاری ای میل، ڈپازٹ/وِدڈرا کے لیے استعمال ہونے والے پیمنٹ اکاؤنٹ نمبر، اور آپ کی گیم اور ٹرانزیکشن ہسٹری۔"] },
      { h: "How we use it", hUr: "ہم اسے کیسے استعمال کرتے ہیں", p: ["To operate your account, process payments, prevent fraud, provide support and send service notifications. We never sell your data to third parties."], pUr: ["آپ کا اکاؤنٹ چلانے، ادائیگیاں پروسیس کرنے، فراڈ روکنے، سپورٹ دینے اور سروس نوٹیفکیشن بھیجنے کے لیے۔ ہم آپ کا ڈیٹا کبھی تیسرے فریق کو نہیں بیچتے۔"] },
      { h: "Security", hUr: "سیکیورٹی", p: ["Passwords are stored encrypted. Sessions are protected with secure cookies. You can change your password and withdrawal PIN anytime from Profile."], pUr: ["پاس ورڈ خفیہ شکل میں محفوظ ہوتے ہیں۔ سیشنز محفوظ کوکیز سے محفوظ ہیں۔ آپ پروفائل سے کبھی بھی پاس ورڈ اور وِدڈرا پن تبدیل کر سکتے ہیں۔"] },
    ],
  },
  {
    slug: "responsible-gaming", title: "Responsible Gaming", titleUr: "ذمہ دارانہ گیمنگ", subtitle: "Play for fun. Stay in control.", subtitleUr: "تفریح کے لیے کھیلیں۔ قابو میں رہیں۔", icon: I(HeartHandIcon),
    sections: [
      { h: "Our commitment", hUr: "ہمارا عزم", p: ["winkox is for adults (18+) only. Gaming should be entertainment, never a way to make money or recover losses. Set a budget before you play and never exceed it."], pUr: ["winkox صرف بالغوں (18+) کے لیے ہے۔ گیمنگ تفریح ہونی چاہیے، پیسے کمانے یا نقصان پورا کرنے کا ذریعہ نہیں۔ کھیلنے سے پہلے بجٹ طے کریں اور اس سے تجاوز نہ کریں۔"] },
      { h: "Tools", hUr: "ٹولز", p: ["Ask Live Support to set a daily deposit limit, take a break (7/30 days) or permanently close your account. Requests are applied within 24 hours."], pUr: ["لائیو سپورٹ سے روزانہ ڈپازٹ حد مقرر کرنے، وقفہ لینے (7/30 دن) یا اکاؤنٹ مستقل بند کرنے کو کہیں۔ درخواستیں 24 گھنٹوں میں لاگو ہوتی ہیں۔"] },
      { h: "Warning signs", hUr: "انتباہی علامات", p: ["Chasing losses, borrowing money to play, hiding play from family, or feeling anxious when not playing. If you notice these, take a break and talk to someone you trust."], pUr: ["نقصان پورا کرنے کی کوشش، کھیلنے کے لیے قرض لینا، گھر والوں سے چھپانا، یا نہ کھیلنے پر بے چینی۔ اگر یہ علامات ہوں تو وقفہ لیں اور کسی قابلِ اعتماد شخص سے بات کریں۔"] },
    ],
  },
  {
    slug: "license", title: "License & Compliance", titleUr: "لائسنس اور کمپلائنس", subtitle: "Fair games, verified payouts, 18+ only.", subtitleUr: "منصفانہ گیمز، تصدیق شدہ ادائیگیاں، صرف 18+۔", icon: I(MedalIcon),
    sections: [
      { h: "Fairness", hUr: "انصاف", p: ["All game results are generated on our servers using cryptographically secure random numbers before any client interaction. Game RTPs: Aviator 97%, Chicken Road 2 98%, Chicken Dash 96.85%, Plinko 99%, Dragon Tiger ~96.3%, Andar Bahar ~97%."], pUr: ["تمام گیم نتائج کسی بھی کلائنٹ تعامل سے پہلے ہمارے سرورز پر کرپٹوگرافک طور پر محفوظ رینڈم نمبرز سے بنائے جاتے ہیں۔ گیم RTP: ایوی ایٹر 97%، چکن روڈ 2 98%، چکن ڈیش 96.85%، پلنکو 99%، ڈریگن ٹائیگر ~96.3%، اندر باہر ~97%۔"] },
      { h: "Age & KYC", hUr: "عمر اور KYC", p: ["Users must be 18+. We may request identity verification (CNIC) before large withdrawals to prevent fraud and protect your funds."], pUr: ["صارفین کی عمر 18+ ہونی چاہیے۔ فراڈ روکنے اور آپ کے فنڈز کے تحفظ کے لیے بڑے وِدڈرا سے پہلے شناختی تصدیق (CNIC) مانگی جا سکتی ہے۔"] },
      { h: "Operator", hUr: "آپریٹر", p: ["winkox — winkox.shop. For compliance inquiries contact us via Online Support."], pUr: ["winkox — winkox.shop۔ کمپلائنس سوالات کے لیے آن لائن سپورٹ کے ذریعے رابطہ کریں۔"] },
    ],
  },
];

export const INFO_SLUGS = INFO_PAGES.map((p) => p.slug);
export const getInfoPage = (slug: string) => INFO_PAGES.find((p) => p.slug === slug) ?? null;

export const _icons = { BanknoteIcon };
