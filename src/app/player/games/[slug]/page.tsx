import Client from "./Client";
import { redirect } from "next/navigation";
import { LOCAL_GAMES_CONNECTED } from "@/lib/gameAvailability";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) {
  if (!LOCAL_GAMES_CONNECTED) redirect("/games-all");
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  return <Client params={params} searchParams={searchParams} />;
}
