export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatINR(n: number): string {
  return "Rs. " + Math.round(n).toLocaleString("en-PK");
}
