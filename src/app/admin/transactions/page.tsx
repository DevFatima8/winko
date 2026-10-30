import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) {
  await props.params; await props.searchParams;
  redirect("/admin/deposits");
}
