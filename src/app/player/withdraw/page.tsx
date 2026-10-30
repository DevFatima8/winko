import Client from "../wallet/Client";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Client mode="withdraw" />;
}
