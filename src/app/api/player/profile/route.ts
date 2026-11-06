import { NextResponse } from "next/server";
import { User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getSettings } from "@/lib/platform";
import { getWinHoldSummary } from "@/lib/winHold";

export async function GET() {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const [settings, team, holds] = await Promise.all([
            getSettings(),
            User.find({ referredBy: me.id }, "totalDeposited").lean(),
            getWinHoldSummary(me.id),
        ]);
        const teamMembers = team.length;
        const teamPerformance = team.reduce((sum, member) => sum + Number(member.totalDeposited ?? 0), 0);
        const commission = Math.round((holds.referralClaimable + holds.referralLocked) * 100) / 100;
        return NextResponse.json({ me, settings, teamMembers, teamPerformance, commission, holds }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[player profile]", error);
        return NextResponse.json({ error: "Profile data load nahi ho saka." }, { status: 503 });
    }
}