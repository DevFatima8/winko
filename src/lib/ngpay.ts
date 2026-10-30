import crypto from "crypto";

export function getNgPayConfig() {
  const apiEndpoint = process.env.NGPAY_API_ENDPOINT || "https://api.ng-pay.com";
  return {
    merchantNo: (process.env.NGPAY_MERCHANT_NO || "").trim(),
    secretKey: (process.env.NGPAY_SECRET_KEY || "").trim(),
    username: process.env.NGPAY_USERNAME || "winkox",
    apiEndpoint,
    collectionUrl: process.env.NGPAY_COLLECTION_URL || `${apiEndpoint}/api/pay`,
    collectionQueryUrl: process.env.NGPAY_COLLECTION_QUERY_URL || `${apiEndpoint}/api/pay/query`,
    payoutUrl: process.env.NGPAY_PAYOUT_URL || `${apiEndpoint}/api/remit`,
    payoutQueryUrl: process.env.NGPAY_PAYOUT_QUERY_URL || `${apiEndpoint}/api/remit/query`,
    balanceQueryUrl: process.env.NGPAY_BALANCE_QUERY_URL || `${apiEndpoint}/api/balance/query`,
    productNo: (process.env.NGPAY_PRODUCT_NO || "20260125214").trim(),
    callbackIp: process.env.NGPAY_CALLBACK_IP || "47.245.122.100",
    isSimulation: process.env.NGPAY_SIMULATION === "true",
  };
}

/**
 * Calculates uppercase MD5 signature according to NG-Pay documentation:
 * 1. Filter out 'sign', null, undefined, and empty string ("")
 * 2. Sort remaining keys in ASCII ascending order
 * 3. Concatenate key=value joined by '&'
 * 4. Append '&key=' + secretKey
 * 5. MD5 hash in UTF-8 and convert to UPPERCASE
 */
export function generateNgPaySign(params: Record<string, any>, secretKey: string): string {
  if (!secretKey) return "";
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== null && params[k] !== undefined && params[k] !== "")
    .sort();

  const pairs = keys.map((k) => `${k}=${params[k]}`);
  const signContent = pairs.join("&") + `&key=${secretKey}`;

  return crypto.createHash("md5").update(signContent, "utf8").digest("hex").toUpperCase();
}

/**
 * Verifies that the received signature matches the calculated MD5 signature
 */
export function verifyNgPaySign(params: Record<string, any>, secretKey: string, expectedSign: string): boolean {
  if (!expectedSign || !secretKey) return false;
  const calculated = generateNgPaySign(params, secretKey);
  return calculated.toUpperCase() === expectedSign.toUpperCase();
}

/**
 * Ensures IP passed to gateway is a public IPv4 (gateways reject 127.0.0.1 / ::1)
 */
export function sanitizeClientIp(ip?: string): string {
  if (!ip) return "182.239.127.137";
  const first = ip.split(",")[0].trim();
  if (
    first === "::1" ||
    first === "127.0.0.1" ||
    first.startsWith("192.168.") ||
    first.startsWith("10.") ||
    first.startsWith("172.")
  ) {
    return "182.239.127.137"; // Valid Pakistan IP fallback for local testing
  }
  return first;
}

/**
 * Formats gateway error messages into human-friendly explanations
 */
export function formatNgPayError(msg?: string, code?: number | string): string {
  if (!msg) return `Gateway error (code ${code ?? "unknown"})`;
  if (msg.includes("IP not whitelisted")) {
    const ip = msg.split(":")[1]?.trim() || "";
    return `Server IP (${ip}) NG-Pay Merchant Portal ke IP Whitelist mein shamil nahi hai. Portal (merchant.ng-pay.com) > Security Center mein IP add karein.`;
  }
  if (msg.includes("Failed visa verification") || msg.includes("验签失败")) {
    return "Gateway Signature error: Merchant Secret Key mismatch hai. Portal se secret key check karein.";
  }
  if (msg.includes("merchantno error")) {
    return "Gateway error: Merchant ID register ya active nahi hai.";
  }
  if (msg.includes("Product number")) {
    return "Gateway error: Product number invalid ya assigned nahi hai.";
  }
  return msg;
}

export interface CollectionOrderOptions {
  merchantOrderNo: string;
  amount: number;
  payType: "EASYPAISA" | "JAZZ_CASH" | "EASYPAISA_DIRECT" | "JAZZ_CASH_DIRECT" | "EASYPAISA_QR" | "JAZZ_CASH_QR";
  productTitle?: string;
  clientIp?: string;
  notifyUrl: string;
  viewUrl?: string;
  mobile?: string;
}

/**
 * Creates a deposit / collection order via NG-Pay
 */
export async function createCollectionOrder(opts: CollectionOrderOptions) {
  const cfg = getNgPayConfig();
  if (!cfg.merchantNo) {
    return { ok: false, error: "Merchant ID not configured in .env (NGPAY_MERCHANT_NO)" };
  }
  if (!cfg.secretKey) {
    return { ok: false, error: "Secret Key not set in .env (NGPAY_SECRET_KEY). Please retrieve it from Merchant Portal." };
  }

  // Format extend JSON string if mobile is provided
  let extend = "";
  if (opts.mobile) {
    extend = JSON.stringify({ mobile: opts.mobile.replace(/\s|-/g, "") });
  }

  const payload: Record<string, any> = {
    amount: String(opts.amount),
    clientIp: sanitizeClientIp(opts.clientIp),
    coinUnit: "PKR",
    extend,
    merchantNo: cfg.merchantNo,
    merchantOrderNo: opts.merchantOrderNo,
    notifyUrl: opts.notifyUrl,
    payType: opts.payType,
    productNo: cfg.productNo,
    productTitle: opts.productTitle ? opts.productTitle.slice(0, 60) : "Winkox Deposit",
    timestamp: String(Date.now()),
    viewUrl: opts.viewUrl || "",
  };

  payload.sign = generateNgPaySign(payload, cfg.secretKey);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(cfg.collectionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => null);
    if (!data || data.code !== 200) {
      const errMsg = formatNgPayError(data?.msg, data?.code);
      return {
        ok: false,
        error: errMsg,
        raw: data,
      };
    }

    return {
      ok: true,
      orderNo: data.data?.orderNo,
      merchantOrderNo: data.data?.merchantOrderNo || opts.merchantOrderNo,
      payUrl: data.data?.payUrl,
      payContent: data.data?.payContent,
      raw: data,
    };
  } catch (err: any) {
    console.error("[createCollectionOrder error]", err);
    return {
      ok: false,
      error: err?.name === "AbortError" ? "Gateway timeout — please try again" : "Payment gateway server se connection fail ho gaya.",
    };
  }
}

/**
 * Queries the status of an existing collection order
 */
export async function queryCollectionOrder(merchantOrderNo: string, orderNo?: string) {
  const cfg = getNgPayConfig();
  if (!cfg.secretKey) return null;

  const payload: Record<string, any> = {
    merchantNo: cfg.merchantNo,
    merchantOrderNo,
    timestamp: String(Date.now()),
  };
  if (orderNo) payload.orderNo = orderNo;
  payload.sign = generateNgPaySign(payload, cfg.secretKey);

  try {
    const res = await fetch(cfg.collectionQueryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export interface PayoutOrderOptions {
  merchantOrderNo: string;
  amount: number;
  payType: "EASYPAISA" | "JAZZ_CASH" | "BANK";
  bankAccountNo: string;
  bankAccountName: string;
  bankCode?: string;
  notifyUrl: string;
  mobile?: string;
}

/**
 * Creates an automated payout / withdrawal via NG-Pay
 */
export async function createPayoutOrder(opts: PayoutOrderOptions) {
  const cfg = getNgPayConfig();
  if (!cfg.merchantNo) {
    return { ok: false, error: "Merchant ID not configured in .env (NGPAY_MERCHANT_NO)" };
  }
  if (!cfg.secretKey) {
    return { ok: false, error: "Secret Key not set in .env (NGPAY_SECRET_KEY)." };
  }

  // Format name: "FirstName,LastName" or string
  const cleanName = opts.bankAccountName.trim().replace(/\s+/g, ",");

  let extend = "";
  if (opts.mobile) {
    extend = JSON.stringify({ mobile: opts.mobile.replace(/\s|-/g, "") });
  }

  const payload: Record<string, any> = {
    amount: String(opts.amount),
    bankAccountName: cleanName,
    bankAccountNo: opts.bankAccountNo.replace(/\s|-/g, ""),
    bankCode: opts.bankCode || opts.payType,
    coinUnit: "PKR",
    extend,
    merchantNo: cfg.merchantNo,
    merchantOrderNo: opts.merchantOrderNo,
    notifyUrl: opts.notifyUrl,
    payType: opts.payType,
    productNo: cfg.productNo,
    timestamp: String(Date.now()),
  };

  payload.sign = generateNgPaySign(payload, cfg.secretKey);

  try {
    const res = await fetch(cfg.payoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!data || data.code !== 200) {
      return {
        ok: false,
        error: formatNgPayError(data?.msg, data?.code),
        raw: data,
      };
    }

    return {
      ok: true,
      orderNo: data.data?.orderNo,
      status: data.data?.status,
      raw: data,
    };
  } catch (err: any) {
    console.error("[createPayoutOrder error]", err);
    return {
      ok: false,
      error: "Payout gateway connection error.",
    };
  }
}

/**
 * Queries payout order status
 */
export async function queryPayoutOrder(merchantOrderNo: string, orderNo?: string) {
  const cfg = getNgPayConfig();
  if (!cfg.secretKey) return null;

  const payload: Record<string, any> = {
    merchantNo: cfg.merchantNo,
    merchantOrderNo,
    timestamp: String(Date.now()),
  };
  if (orderNo) payload.orderNo = orderNo;
  payload.sign = generateNgPaySign(payload, cfg.secretKey);

  try {
    const res = await fetch(cfg.payoutQueryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Queries merchant account balance from NG-Pay
 */
export async function queryMerchantBalance() {
  const cfg = getNgPayConfig();
  if (!cfg.merchantNo || !cfg.secretKey) return null;

  const payload: Record<string, any> = {
    coinUnit: "PKR",
    merchantNo: cfg.merchantNo,
    timestamp: String(Date.now()),
  };
  payload.sign = generateNgPaySign(payload, cfg.secretKey);

  try {
    const res = await fetch(cfg.balanceQueryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Diagnoses NG-Pay gateway health and returns status
 */
export async function checkNgPayGatewayHealth() {
  const cfg = getNgPayConfig();
  if (!cfg.merchantNo || !cfg.secretKey) {
    return {
      ok: false,
      status: "UNCONFIGURED",
      message: "NGPAY_MERCHANT_NO ya NGPAY_SECRET_KEY .env mein missing hai.",
    };
  }

  const res = await queryMerchantBalance();
  if (!res) {
    return {
      ok: false,
      status: "NETWORK_ERROR",
      message: "NG-Pay server (api.ng-pay.com) se connect nahi ho saka.",
    };
  }

  if (res.code === 200) {
    return {
      ok: true,
      status: "CONNECTED",
      balance: res.data?.balance,
      totalBalance: res.data?.totalBalance,
      message: "Gateway connected successfully!",
    };
  }

  const rawMsg = res.msg || "";
  if (rawMsg.includes("IP not whitelisted")) {
    const ip = rawMsg.split(":")[1]?.trim() || "";
    return {
      ok: false,
      status: "IP_NOT_WHITELISTED",
      detectedIp: ip,
      message: `Server IP (${ip}) NG-Pay Merchant Portal ke IP Whitelist mein shamil nahi hai.`,
    };
  }

  if (rawMsg.includes("Failed visa verification") || rawMsg.includes("验签失败")) {
    return {
      ok: false,
      status: "INVALID_SIGNATURE",
      message: "Secret Key mismatch: Merchant Portal se Secret Key check karein.",
    };
  }

  return {
    ok: false,
    status: "ERROR",
    message: rawMsg,
  };
}
