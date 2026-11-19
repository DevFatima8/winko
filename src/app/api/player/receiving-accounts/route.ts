import { NextResponse } from "next/server";
import { User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isWithdrawalProvider, receivingAccountError } from "@/lib/paymentMethods";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const data = await request.json();
    const provider = data.provider;
    const holderName = typeof data.holderName === "string" ? data.holderName.trim() : "";
    const accountNumber = typeof data.accountNumber === "string" ? data.accountNumber.trim() : "";
    const institution = typeof data.institution === "string" ? data.institution.trim() : "";
    if (typeof provider !== "string" || !isWithdrawalProvider(provider)) return NextResponse.json({ error: "Withdrawal method select karein." }, { status: 400 });
    const error = receivingAccountError(provider, holderName, accountNumber, institution);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const account = { provider, holderName, accountNumber, institution };
    const result = await User.updateOne({ _id: me.id }, { $set: { [`withdrawalAccounts.${provider}`]: account } });
    if (!result.matchedCount) return NextResponse.json({ error: "Account nahi mila." }, { status: 404 });
    return NextResponse.json({ account });
  } catch (error) {
    console.error("[receiving accounts]", error);
    return NextResponse.json({ error: "Receiving account save nahi ho saka." }, { status: 500 });
  }
}
