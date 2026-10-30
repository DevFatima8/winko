import { createHash } from "node:crypto";

export const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/[^/\s]+\/image\/upload\/\S+$/i;

export function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/** Signed upload of an image data URL to Cloudinary; returns the secure https URL. */
export async function uploadImageToCloudinary(dataUrl: string, folder = "winkox/payment-qr"): Promise<string> {
  const cfg = cloudinaryConfig();
  if (!cfg) throw new Error("CLOUDINARY_NOT_CONFIGURED");
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${cfg.apiSecret}`).digest("hex");
  const body = new FormData();
  body.set("file", dataUrl);
  body.set("api_key", cfg.apiKey);
  body.set("timestamp", String(timestamp));
  body.set("folder", folder);
  body.set("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !json.secure_url) throw new Error(json.error?.message || "Cloudinary upload failed");
  return json.secure_url;
}
