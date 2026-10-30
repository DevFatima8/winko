import Client from "../wallet/Client";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <Client mode="deposit" searchParams={await searchParams} />;
}
