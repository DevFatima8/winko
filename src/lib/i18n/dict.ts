export type Locale = "en" | "ur";
export const LOCALES: Locale[] = ["en", "ur"];

const en = {
  // header / nav
  home: "Home", games: "Games", promo: "Promo", deposit: "Deposit", withdraw: "Withdraw", invite: "Invite", help: "Help", profile: "Profile",
  login: "Login", register: "Register", logout: "Logout", myAccount: "My Account", adminPanel: "Admin Panel", support: "Support", liveSupport: "Live Support",
  menu: "Menu", hotGames: "Hot Games", cards: "Cards", miniGames: "Mini Games", betHistory: "Bet History", helpCenter: "Help Center", wallet: "Wallet", notifications: "Notifications",
  // lobby
  welcome: "Welcome", balance: "Balance", liveWins: "Live wins", hotJackpot: "Hot Jackpot", jackpot: "JACKPOT", viewAll: "View All", allHotGames: "All Hot Games",
  comingSoon: "{cat} games are coming soon — play Hot games for now.", hotLabel: "Hot", recent: "Recent", demo: "Demo", live: "Live",
  slot: "Slot", liveCasino: "Live Casino", fishing: "Fishing", sports: "Sports", lottery: "Lottery",
  instantDeposit: "Instant Deposit", instantDepositSub: "JazzCash · Easypaisa", fastWithdraw: "Fast Withdraw", fastWithdrawSub: "Within 24 hours",
  secure: "100% Secure", secureSub: "Fair & verified games", supportSub: "Chat · WhatsApp · Telegram",
  topWinners: "Top Winners this week", rank: "Rank", username: "Username", winnings: "Winnings",
  appDownload: "APP Download", getApp: "Get the winkox app", getAppSub: "Android & iPhone — open directly from home screen, get notifications.",
  casino: "Casino", licenseCompliance: "License Compliance", contactUs: "Contact us", tagline: "Pakistan's premium gaming & earning platform",
  playResponsibly: "Play responsibly · 18+ only", playNow: "Play now", registerNow: "Register now", joinTable: "Join table", viewPromo: "View promo",
  footerCasino: ["Mission", "Rebate", "VIP", "Invite", "Event", "Fund"], footerSupport: ["Online Support", "Help Center", "Reward Feedback"],
  // banners
  b1k: "Welcome bonus", b1t: "Receive |PKR 1500| for free", b1s: "Register now & claim your welcome reward instantly",
  b2k: "Most played", b2t: "Aviator |up to 1000x|", b2s: "Cash out before the plane flies away",
  b3k: "WG Cards live", b3t: "Dragon Tiger |Tie pays 8:1|", b3s: "20-second live rounds · real cards",
  b4k: "Every deposit", b4t: "|7% bonus| on every deposit", b4s: "Win up to PKR 60,000 — JazzCash & Easypaisa",
  marquee: [
    "Welcome to winkox! Register and get PKR 1500 welcome bonus",
    "7% bonus on every deposit — up to PKR 60,000! JazzCash & Easypaisa instant",
    "Invite 1 friend who deposits — 288 PKR bonus + 2% deposit commission",
    "Cashback on every bet — claim after 00:00 next day",
    "Up to PKR 100,000 weekly rescue fund!",
    "3 random red packets daily — chance to win up to PKR 888,888",
  ],
  // auth
  loginTitle: "Login", signupTitle: "Create Account", loginSub: "Login to your account", signupSub: "Register and start playing",
  fullName: "Full Name", phoneNumber: "Phone Number", phoneOrUsername: "Phone Number or Username", emailOptional: "Email (optional)", refOptional: "Referral code (optional)",
  password: "Password", pleaseWait: "Please wait...", noAccount: "Don't have an account?", haveAccount: "Already have an account?", backHome: "← Back to Home",
  // client
  playAndEarn: "Play & |Earn| ", pickGame: "Pick your favourite game and start winning.", originalGames: "Original Games", wgLive: "WG Cards — Live Tables",
  gamesSoon: "Games coming soon… ", history: "History", myHistory: "My History", team: "Invite",
  // wallet
  walletTitle: "Wallet", depositTitle: "Deposit", withdrawTitle: "Withdraw", selectMethod: "1. Select payment method", sendAmount: "2. Send amount:",
  sendAmountTo: "from your {p} app send money to", thenFill: "then fill details below.", amountMin: "Amount (Rs.) — minimum {n}", yourSenderNumber: "Your sender number",
  tid: "Transaction ID (TID)", submitDeposit: "Submit Deposit Request", submitting: "Submitting...", noAccounts: "No payment account available right now. Please try later.",
  availableBalance: "Available balance:", provider: "Provider", yourAccountNumber: "Your account number", withdrawPin: "Withdrawal PIN", requestWithdraw: "Request Withdraw",
  dailyLimit: "Daily limit", remainingToday: "remaining today", maxPerWithdraw: "Max per withdraw", min: "Min", raiseVip: "Raise VIP", setPinFirst: "First set a 4-digit Withdrawal PIN from",
  // profile
  vipProgress: "VIP Progress", level: "Level", next: "Next", atTotalDeposit: "at Rs. {n} total deposit", remaining: "Rs. {n} remaining", maxLevel: "Max level ",
  totalDeposited: "Total Deposited", dailyWithdrawLimit: "Daily withdraw limit", commissionEarned: "Commission earned", teamMembers: "{n} team members",
  inviteEarn: "Invite & Earn", inviteText: "Share your link — earn {d}% of each friend's first approved deposit, straight to your wallet. Referral code:",
  copy: "Copy", copied: "Copied ", share: "Share", setPin: "Set Withdrawal PIN", pinSet: "Withdrawal PIN (set)", pinNote: "This 4-digit PIN is required for every withdrawal.",
  changePassword: "Change Password", appTitle: "winkox App", appNote: "Install the app on your phone — open directly from home screen.", supportChannels: "Support & Channels",
  whatsappChannel: "WhatsApp Channel", telegramChannel: "Telegram Channel", depositPlus: "Deposit Rs. {n}+", daily: "Daily Rs. {n}",
  oldPin: "Old PIN", newPin: "New 4-digit PIN", createPin: "Create 4-digit PIN", confirmPin: "Re-enter PIN", changePin: "Change PIN", setPinBtn: "Set Withdrawal PIN",
  currentPassword: "Current password", newPassword: "New password (min 6)", changePasswordBtn: "Change password",
  // help / support / notifications
  helpTitle: "Help Center", helpSub: "Step-by-step guides for deposit, withdraw and games. Ask live support if anything is unclear.", noGuides: "No guides yet.",
  supportTitle: "winkox Live Support", onlineAgent: "Support hours open", offlineHours: "Offline · Hours {h}", typeMessage: "Type a message...", autoReply: "Auto reply",
  defaultWelcome: "Assalam o Alaikum! How can we help you?", notifTitle: "Notifications", noNotif: "No notifications.",
  demoBar: "|Demo / Guest mode| — watch the game live. Register or Login to play with real money.",
  howToPlay: "How to play:", allGames: "← All games",
  promoTitle: "Promotions", depositNow: "Deposit now", registerToClaim: "Register to claim", promoNote: "Bonuses are added to wallet after admin approval. Terms apply.",
  language: "Language",
  admin: "Admin", superAdmin: "Super Admin", dashboard: "Dashboard", liveSupportAdmin: "Live Support", usersAdmin: "Users", depositsAdmin: "Deposits", withdrawalsAdmin: "Withdrawals", feedbackAdmin: "Feedback", gamesAdmin: "Games", gamesOnOff: "Games On/Off", gameResultsAdmin: "Game Results", recordsAdmin: "Records", agentsAdmin: "Sub-admin Referrals", notificationsAdmin: "Notifications", staffAdmin: "Admins / Staff", activityLogs: "Activity Logs", historyCleanup: "History Cleanup", vipLevelsAdmin: "VIP Levels", helpCenterAdmin: "Help Center", paymentAccountsAdmin: "Payment Accounts", settingsAdmin: "Settings", myAccountAdmin: "My Account",
};

export type Dict = typeof en;

const ur: Dict = {
  home: "ہوم", games: "گیمز", promo: "پرومو", deposit: "ڈپازٹ", withdraw: "وِدڈرا", invite: "انوائٹ", help: "مدد", profile: "پروفائل",
  login: "لاگ اِن", register: "رجسٹر", logout: "لاگ آؤٹ", myAccount: "میرا اکاؤنٹ", adminPanel: "ایڈمن پینل", support: "سپورٹ", liveSupport: "لائیو سپورٹ",
  menu: "مینو", hotGames: "ہاٹ گیمز", cards: "کارڈز", miniGames: "منی گیمز", betHistory: "بیٹ ہسٹری", helpCenter: "ہیلپ سینٹر", wallet: "والٹ", notifications: "نوٹیفکیشنز",
  welcome: "خوش آمدید", balance: "بیلنس", liveWins: "لائیو جیت", hotJackpot: "ہاٹ جیک پاٹ", jackpot: "جیک پاٹ", viewAll: "سب دیکھیں", allHotGames: "تمام ہاٹ گیمز",
  comingSoon: "{cat} گیمز جلد آ رہی ہیں — ابھی ہاٹ گیمز کھیلیں۔", hotLabel: "ہاٹ", recent: "حالیہ", demo: "ڈیمو", live: "لائیو",
  slot: "سلاٹ", liveCasino: "لائیو کیسینو", fishing: "فشنگ", sports: "سپورٹس", lottery: "لاٹری",
  instantDeposit: "فوری ڈپازٹ", instantDepositSub: "جاز کیش · ایزی پیسہ", fastWithdraw: "تیز وِدڈرا", fastWithdrawSub: "24 گھنٹوں میں",
  secure: "100% محفوظ", secureSub: "منصفانہ اور تصدیق شدہ گیمز", supportSub: "چیٹ · واٹس ایپ · ٹیلیگرام",
  topWinners: "اس ہفتے کے ٹاپ جیتنے والے", rank: "رینک", username: "یوزر نیم", winnings: "جیت",
  appDownload: "ایپ ڈاؤن لوڈ", getApp: "winkox ایپ حاصل کریں", getAppSub: "اینڈرائیڈ اور آئی فون — ہوم اسکرین سے براہِ راست کھولیں، نوٹیفکیشنز پائیں۔",
  casino: "کیسینو", licenseCompliance: "لائسنس کمپلائنس", contactUs: "ہم سے رابطہ", tagline: "پاکستان کا پریمیم گیمنگ اور ارننگ پلیٹ فارم",
  playResponsibly: "ذمہ داری سے کھیلیں · صرف 18+", playNow: "ابھی کھیلیں", registerNow: "ابھی رجسٹر کریں", joinTable: "ٹیبل جوائن کریں", viewPromo: "پرومو دیکھیں",
  footerCasino: ["مشن", "ریبیٹ", "وی آئی پی", "انوائٹ", "ایونٹ", "فنڈ"], footerSupport: ["آن لائن سپورٹ", "ہیلپ سینٹر", "فیڈبیک"],
  b1k: "ویلکم بونس", b1t: "مفت |PKR 1500| حاصل کریں", b1s: "ابھی رجسٹر کریں اور فوراً ویلکم انعام پائیں",
  b2k: "سب سے زیادہ کھیلی جانے والی", b2t: "ایوی ایٹر |1000x تک|", b2s: "جہاز اُڑنے سے پہلے کیش آؤٹ کریں",
  b3k: "WG کارڈز لائیو", b3t: "ڈریگن ٹائیگر |ٹائی 8:1 دیتا ہے|", b3s: "20 سیکنڈ کے لائیو راؤنڈ · اصلی کارڈز",
  b4k: "ہر ڈپازٹ پر", b4t: "ہر ڈپازٹ پر |7% بونس|", b4s: "PKR 60,000 تک جیتیں — جاز کیش اور ایزی پیسہ",
  marquee: [
    "winkox میں خوش آمدید! رجسٹر کریں اور PKR 1500 ویلکم بونس حاصل کریں",
    "ہر ڈپازٹ پر 7% بونس — PKR 60,000 تک! جاز کیش اور ایزی پیسہ فوری",
    "1 دوست کو انوائٹ کریں جو ڈپازٹ کرے — 288 PKR بونس + 2% ڈپازٹ کمیشن",
    "ہر بیٹ پر کیش بیک — اگلے دن 00:00 کے بعد کلیم کریں",
    "ہر ہفتے PKR 100,000 تک ریسکیو فنڈ!",
    "روزانہ 3 رینڈم ریڈ پیکٹس — PKR 888,888 تک جیتنے کا موقع",
  ],
  loginTitle: "لاگ اِن", signupTitle: "اکاؤنٹ بنائیں", loginSub: "اپنے اکاؤنٹ میں لاگ اِن کریں", signupSub: "رجسٹر کریں اور کھیلنا شروع کریں",
  fullName: "پورا نام", phoneNumber: "فون نمبر", phoneOrUsername: "فون نمبر یا یوزر نیم", emailOptional: "ای میل (اختیاری)", refOptional: "ریفرل کوڈ (اختیاری)",
  password: "پاس ورڈ", pleaseWait: "براہِ کرم انتظار کریں...", noAccount: "اکاؤنٹ نہیں ہے؟", haveAccount: "پہلے سے اکاؤنٹ ہے؟", backHome: "→ ہوم پر واپس",
  playAndEarn: "کھیلو اور |کماؤ| ", pickGame: "اپنی پسندیدہ گیم منتخب کریں اور جیتنا شروع کریں۔", originalGames: "اوریجنل گیمز", wgLive: "WG کارڈز — لائیو ٹیبلز",
  gamesSoon: "گیمز جلد آ رہی ہیں… ", history: "ہسٹری", myHistory: "میری ہسٹری", team: "انوائٹ",
  walletTitle: "والٹ", depositTitle: "ڈپازٹ", withdrawTitle: "وِدڈرا", selectMethod: "1۔ ادائیگی کا طریقہ منتخب کریں", sendAmount: "2۔ رقم بھیجیں:",
  sendAmountTo: "اپنی {p} ایپ سے رقم بھیجیں", thenFill: "پھر نیچے تفصیلات بھریں۔", amountMin: "رقم (روپے) — کم از کم {n}", yourSenderNumber: "آپ کا بھیجنے والا نمبر",
  tid: "ٹرانزیکشن آئی ڈی (TID)", submitDeposit: "ڈپازٹ درخواست جمع کریں", submitting: "جمع ہو رہا ہے...", noAccounts: "ابھی کوئی پیمنٹ اکاؤنٹ دستیاب نہیں۔ بعد میں کوشش کریں۔",
  availableBalance: "دستیاب بیلنس:", provider: "پرووائیڈر", yourAccountNumber: "آپ کا اکاؤنٹ نمبر", withdrawPin: "وِدڈرا پن", requestWithdraw: "وِدڈرا کی درخواست",
  dailyLimit: "روزانہ حد", remainingToday: "آج باقی", maxPerWithdraw: "فی وِدڈرا زیادہ سے زیادہ", min: "کم از کم", raiseVip: "VIP بڑھائیں", setPinFirst: "پہلے 4 ہندسوں کا وِدڈرا پن سیٹ کریں",
  vipProgress: "VIP پروگریس", level: "لیول", next: "اگلا", atTotalDeposit: "روپے {n} کل ڈپازٹ پر", remaining: "روپے {n} باقی", maxLevel: "زیادہ سے زیادہ لیول ",
  totalDeposited: "کل ڈپازٹ", dailyWithdrawLimit: "روزانہ وِدڈرا حد", commissionEarned: "کمایا گیا کمیشن", teamMembers: "{n} ٹیم ممبرز",
  inviteEarn: "انوائٹ کریں اور کمائیں", inviteText: "اپنا لنک شیئر کریں — ہر دوست کے پہلے منظور شدہ ڈپازٹ کا {d}% کمیشن سیدھا آپ کے والٹ میں۔ ریفرل کوڈ:",
  copy: "کاپی", copied: "کاپی ہو گیا ", share: "شیئر", setPin: "وِدڈرا پن سیٹ کریں", pinSet: "وِدڈرا پن (سیٹ ہے)", pinNote: "ہر وِدڈرا پر یہ 4 ہندسوں کا پن پوچھا جائے گا۔",
  changePassword: "پاس ورڈ تبدیل کریں", appTitle: "winkox ایپ", appNote: "فون پر ایپ انسٹال کریں — ہوم اسکرین سے براہِ راست کھولیں۔", supportChannels: "سپورٹ اور چینلز",
  whatsappChannel: "واٹس ایپ چینل", telegramChannel: "ٹیلیگرام چینل", depositPlus: "ڈپازٹ روپے {n}+", daily: "روزانہ روپے {n}",
  oldPin: "پرانا پن", newPin: "نیا 4 ہندسوں کا پن", createPin: "4 ہندسوں کا پن بنائیں", confirmPin: "پن دوبارہ لکھیں", changePin: "پن تبدیل کریں", setPinBtn: "وِدڈرا پن سیٹ کریں",
  currentPassword: "موجودہ پاس ورڈ", newPassword: "نیا پاس ورڈ (کم از کم 6)", changePasswordBtn: "پاس ورڈ تبدیل کریں",
  helpTitle: "ہیلپ سینٹر", helpSub: "ڈپازٹ، وِدڈرا اور گیمز کے مرحلہ وار گائیڈز۔ سمجھ نہ آئے تو لائیو سپورٹ سے پوچھیں۔", noGuides: "ابھی کوئی گائیڈ نہیں۔",
  supportTitle: "winkox لائیو سپورٹ", onlineAgent: "سپورٹ کے اوقات کھلے ہیں", offlineHours: "آف لائن · اوقات {h}", typeMessage: "پیغام لکھیں...", autoReply: "خودکار جواب",
  defaultWelcome: "السلام علیکم! ہم آپ کی کیا مدد کر سکتے ہیں؟", notifTitle: "نوٹیفکیشنز", noNotif: "کوئی نوٹیفکیشن نہیں۔",
  demoBar: "|ڈیمو / گیسٹ موڈ| — گیم لائیو دیکھیں۔ اصلی پیسوں سے کھیلنے کے لیے رجسٹر یا لاگ اِن کریں۔",
  howToPlay: "کیسے کھیلیں:", allGames: "→ تمام گیمز",
  promoTitle: "پروموشنز", depositNow: "ابھی ڈپازٹ کریں", registerToClaim: "کلیم کرنے کے لیے رجسٹر کریں", promoNote: "بونس ایڈمن کی منظوری کے بعد والٹ میں شامل ہوتے ہیں۔ شرائط لاگو ہیں۔",
  language: "زبان",
  admin: "ایڈمن", superAdmin: "سپر ایڈمن", dashboard: "ڈیش بورڈ", liveSupportAdmin: "لائیو سپورٹ", usersAdmin: "یوزرز", depositsAdmin: "ڈپازٹس", withdrawalsAdmin: "وِدڈرا", feedbackAdmin: "فیڈبیک", gamesAdmin: "گیمز", gamesOnOff: "گیمز آن/آف", gameResultsAdmin: "گیم رزلٹس", recordsAdmin: "ریکارڈز", agentsAdmin: "سب ایڈمن ریفرلز", notificationsAdmin: "نوٹیفکیشنز", staffAdmin: "ایڈمنز / اسٹاف", activityLogs: "ایکٹیویٹی لاگز", historyCleanup: "ہسٹری کلین اَپ", vipLevelsAdmin: "VIP لیولز", helpCenterAdmin: "ہیلپ سینٹر", paymentAccountsAdmin: "پیمنٹ اکاؤنٹس", settingsAdmin: "سیٹنگز", myAccountAdmin: "میرا اکاؤنٹ",
};

export const DICTS: Record<Locale, Dict> = { en, ur };

/** Simple interpolation: t("x {n}", {n: 5}) */
export function fmtT(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
