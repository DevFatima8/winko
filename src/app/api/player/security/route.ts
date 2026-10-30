import { NextResponse } from "next/server";
import { User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { verifyPassword } from "@/lib/auth";
import { SECURITY_QUESTIONS, decryptSecret, encryptSecret, hashAnswer, matchTotp, newTotpSecret, verifyAnswer } from "@/lib/accountSecurity";

const noStore = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const user = await User.findById(me.id).lean();
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json({ me, authenticatorEnabled: !!user.totpSecret, question: user.securityQuestion ?? null, questions: SECURITY_QUESTIONS }, { headers: noStore });
  } catch (error) {
    console.error("[security center]", error);
    return NextResponse.json({ error: "Security settings load nahi ho sakin." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const data = await request.json();
    const user = await User.findById(me.id).lean();
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if ((user.securityLockedUntil ?? 0) > Date.now()) return NextResponse.json({ error: "Zyada failed attempts. 15 minutes baad dobara koshish karein." }, { status: 429 });
    const fail = async (message: string) => {
      await User.updateOneAtomic({ _id: me.id }, { $inc: { securityFailures: 1 } });
      await User.updateOneAtomic({ _id: me.id, securityFailures: { $gte: 5 } }, { $set: { securityLockedUntil: Date.now() + 900000, securityFailures: 0 } });
      return NextResponse.json({ error: message }, { status: 400 });
    };
    const password = typeof data.password === "string" ? data.password : "";
    if (!(await verifyPassword(password, user.passwordHash))) return fail("Current login password ghalat hai.");
    const action = data.action;
    const code = typeof data.code === "string" ? data.code.trim() : "";
    if (user.totpSecret) {
      const step = matchTotp(decryptSecret(user.totpSecret), code, user.totpLastStep ?? -1);
      if (step === null) return fail("Authenticator ka naya 6-digit code enter karein.");
      const used = await User.updateOneAtomic({ _id: me.id, totpSecret: user.totpSecret, totpLastStep: user.totpLastStep ?? null }, { $set: { totpLastStep: step } });
      if (!used.modifiedCount) return fail("Code already used. Agla code try karein.");
      user.totpLastStep = step;
    }
    const save = async (values: Record<string, unknown>) => {
      const result = await User.updateOneAtomic({ _id: me.id, passwordHash: user.passwordHash, totpSecret: user.totpSecret ?? null, totpLastStep: user.totpLastStep ?? null, totpPendingSecret: user.totpPendingSecret ?? null, securityAnswerHash: user.securityAnswerHash ?? null }, { $set: values });
      return result.modifiedCount > 0;
    };
    const conflict = () => NextResponse.json({ error: "Security settings changed. Page refresh kar ke dobara try karein." }, { status: 409 });
    const clearFailures = { securityFailures: 0, securityLockedUntil: 0 };
    if (action === "totp-start") {
      if (user.totpSecret) return NextResponse.json({ error: "Authenticator already linked." }, { status: 400 });
      const secret = newTotpSecret();
      if (!(await save({ totpPendingSecret: encryptSecret(secret), totpPendingUntil: Date.now() + 600000, ...clearFailures }))) return conflict();
      const uri = `otpauth://totp/${encodeURIComponent(`winkox:${me.username ?? me.phone}`)}?secret=${secret}&issuer=winkox&algorithm=SHA1&digits=6&period=30`;
      return NextResponse.json({ secret, uri }, { headers: noStore });
    }
    if (action === "totp-enable") {
      if (user.totpSecret || !user.totpPendingSecret || (user.totpPendingUntil ?? 0) < Date.now()) return NextResponse.json({ error: "Setup expired. Dobara setup shuru karein." }, { status: 400 });
      const step = matchTotp(decryptSecret(user.totpPendingSecret), code);
      if (step === null) return fail("Authenticator code ghalat hai.");
      if (!(await save({ totpSecret: user.totpPendingSecret, totpLastStep: step, totpPendingSecret: null, totpPendingUntil: 0, ...clearFailures }))) return conflict();
    } else if (action === "totp-disable") {
      if (!user.totpSecret) return NextResponse.json({ error: "Authenticator linked nahi hai." }, { status: 400 });
      if (!(await save({ totpSecret: null, totpPendingSecret: null, totpPendingUntil: 0, ...clearFailures }))) return conflict();
    } else if (action === "question-save") {
      if (!SECURITY_QUESTIONS.includes(data.question) || typeof data.answer !== "string" || data.answer.trim().length < 3 || data.answer.length > 200) return NextResponse.json({ error: "Question select karein aur 3-200 characters ka answer dein." }, { status: 400 });
      if (user.securityAnswerHash && (typeof data.currentAnswer !== "string" || data.currentAnswer.length > 200 || !verifyAnswer(data.currentAnswer, user.securityAnswerHash))) return fail("Current security answer ghalat hai.");
      if (!(await save({ securityQuestion: data.question, securityAnswerHash: hashAnswer(data.answer), ...clearFailures }))) return conflict();
    } else if (action === "question-verify") {
      if (!user.securityAnswerHash || typeof data.answer !== "string" || data.answer.length > 200 || !verifyAnswer(data.answer, user.securityAnswerHash)) return fail("Security answer ghalat hai.");
      if (!(await save(clearFailures))) return conflict();
    } else if (action === "contact-save") {
      const value = typeof data.value === "string" ? data.value.trim() : "";
      if (data.field !== "phone" && data.field !== "email") return NextResponse.json({ error: "Invalid field." }, { status: 400 });
      if (data.field === "phone" ? !/^03\d{9}$/.test(value) : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) return NextResponse.json({ error: "Valid phone/email enter karein." }, { status: 400 });
      const normalized = data.field === "email" ? value.toLowerCase() : value;
      const existing = await User.findOne({ [data.field]: normalized, _id: { $ne: me.id } }).lean();
      if (existing) return NextResponse.json({ error: "Ye phone/email pehle se use ho raha hai." }, { status: 400 });
      if (!(await save({ [data.field]: normalized, ...clearFailures }))) return conflict();
    } else return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    return NextResponse.json({ success: action === "question-verify" ? "Answer verified." : "Security settings updated." }, { headers: noStore });
  } catch (error) {
    console.error("[security settings update]", error);
    return NextResponse.json({ error: "Security settings update nahi ho sakin." }, { status: 500 });
  }
}
