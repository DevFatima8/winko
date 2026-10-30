import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const SECURITY_QUESTIONS = [
  "What was the name of your first school?",
  "What was the name of your first pet?",
  "In which city did your parents meet?",
  "What is the first name of your childhood best friend?",
];

export function newTotpSecret() {
  let bits = "";
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, "0");
  return bits.match(/.{5}/g)!.map((part) => alphabet[parseInt(part, 2)]).join("");
}

export function totp(secret: string, step: number) {
  let bits = "";
  for (const ch of secret) {
    const value = alphabet.indexOf(ch);
    if (value < 0) throw new Error("Invalid authenticator secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}

export function matchTotp(secret: string, code: string, lastStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

function encryptionKey() {
  if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET must be configured for Authenticator.");
  return createHash("sha256").update(`winkox-totp:${process.env.NEXTAUTH_SECRET}`).digest();
}
export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".");
}
export function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8");
}
const normalizeAnswer = (answer: string) => answer.trim().normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ");
export function hashAnswer(answer: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(normalizeAnswer(answer), salt, 32).toString("hex")}`;
}
export function verifyAnswer(answer: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(normalizeAnswer(answer), salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
