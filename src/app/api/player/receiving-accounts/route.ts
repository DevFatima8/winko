import { NextResponse } from "next/server";
import { User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const data = await request.json();
    const provider = data.provider;
    const holderName = typeof data.holderName === "string" ? data.holderName.trim() : "";
    const accountNumber = typeof data.accountNumber === "string" ? data.accountNumber.trim() : "";
    if (provider !== "jazzcash" && provider !== "easypaisa") return NextResponse.json({ error: "JazzCash ya Easypaisa select karein." }, { status: 400 });
    if (holderName.length < 3 || holderName.length > 100) return NextResponse.json({ error: "Account holder ka naam 3-100 characters mein likhein." }, { status: 400 });
    if (!/^03\d{9}$/.test(accountNumber)) return NextResponse.json({ error: "Account number 03XXXXXXXXX format mein likhein." }, { status: 400 });
    const account = { provider, holderName, accountNumber };
    const result = await User.updateOne({ _id: me.id }, { $set: { [`withdrawalAccounts.${provider}`]: account } });
    if (!result.matchedCount) return NextResponse.json({ error: "Account nahi mila." }, { status: 404 });
    return NextResponse.json({ account });
  } catch (error) {
    console.error("[receiving accounts]", error);
    return NextResponse.json({ error: "Receiving account save nahi ho saka." }, { status: 500 });
  }
}
