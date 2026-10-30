import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) {
  const searchParams = await props.searchParams;
  const query = new URLSearchParams(searchParams).toString();
  redirect(query ? `/?${query}` : "/");
}
