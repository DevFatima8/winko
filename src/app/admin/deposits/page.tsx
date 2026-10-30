import Client from "../transactions/Client";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) {
    const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
    return <Client type="deposit" params={params} searchParams={searchParams} />;
}