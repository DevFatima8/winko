import { NextResponse } from "next/server";
import { Feedback } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";

export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const rows = await Feedback.find({ userId: me.id }).sort({ createdAt: -1 }).limit(100).lean();
    const list = rows.map(({ _id, type, message, status, createdAt }) => ({ id: String(_id), type, message, status, createdAt }));
    return NextResponse.json({ list }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[player feedback]", error);
    return NextResponse.json({ error: "Feedback load nahi ho saka. Dobara try karein." }, { status: 503 });
  }
}
