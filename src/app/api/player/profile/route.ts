import { NextResponse } from "next/server";
import { User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getSettings } from "@/lib/platform";

export async function GET() {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const [settings, team] = await Promise.all([
            getSettings(),
            User.find({ referredBy: me.id }, "totalDeposited").lean(),
        ]);
        const teamMembers = team.length;
        const teamPerformance = team.reduce((sum, member) => sum + Number(member.totalDeposited ?? 0), 0);
        const commission = Number(me.commissionEarned ?? 0);
        return NextResponse.json({ me, settings, teamMembers, teamPerformance, commission }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[player profile]", error);
        return NextResponse.json({ error: "Profile data load nahi ho saka." }, { status: 503 });
    }
}