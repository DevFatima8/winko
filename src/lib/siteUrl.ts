export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://winkox.shop").replace(/\/+$/, "");

export const referralLink = (code?: string | null) => `${SITE_URL}/signup?ref=${encodeURIComponent(code ?? "")}`;
