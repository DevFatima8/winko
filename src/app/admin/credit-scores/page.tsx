import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <Client searchParams={await searchParams} />;
}
