import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isStaff } from "@/lib/auth";
import { checkNgPayGatewayHealth, getNgPayConfig } from "@/lib/ngpay";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || !isStaff(me.dbRole) || me.level < 1) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const cfg = getNgPayConfig();
    const health = await checkNgPayGatewayHealth();

    return NextResponse.json({
      config: {
        merchantNo: cfg.merchantNo,
        secretKeyConfigured: Boolean(cfg.secretKey),
        productNo: cfg.productNo,
        apiEndpoint: cfg.apiEndpoint,
        callbackIp: cfg.callbackIp,
        isSimulation: cfg.isSimulation,
      },
      health,
    });
  } catch (error) {
    console.error("[gateway test error]", error);
    return NextResponse.json({ error: "Gateway test failed." }, { status: 500 });
  }
}
