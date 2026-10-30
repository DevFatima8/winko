import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<Record<string, string>> }) {
  const params = await props.params;
  return <Client params={params} />;
}
