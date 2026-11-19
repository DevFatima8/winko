import type { WithdrawalProvider } from "@/models";

export const WITHDRAWAL_PROVIDERS = ["jazzcash", "easypaisa", "bank", "crypto", "other"] as const;
export const PAYMENT_LABELS = { jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank Transfer", crypto: "Crypto", other: "Other", raast: "Raast" };
export const isWithdrawalProvider = (value: string): value is WithdrawalProvider =>
  WITHDRAWAL_PROVIDERS.some(provider => provider === value);
export const isMobileWallet = (provider: string) => provider === "jazzcash" || provider === "easypaisa";
export function receivingAccountError(provider: WithdrawalProvider, holder: string, number: string, institution: string) {
  if (holder.length < 3 || holder.length > 100) return "Account holder ka naam 3-100 characters mein likhein.";
  if (isMobileWallet(provider) ? !/^03\d{9}$/.test(number) : number.length < 3 || number.length > 150) return "Valid account number, IBAN ya wallet address enter karein.";
  if (!isMobileWallet(provider) && (institution.length < 2 || institution.length > 100)) return "Bank, service ya crypto network ka naam enter karein.";
  return null;
}
