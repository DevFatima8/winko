import { cookies } from "next/headers";
export async function getTheme(): Promise<"dark" | "light"> {
  const c = (await cookies()).get("theme")?.value;
  return c === "light" ? "light" : "dark";
}
