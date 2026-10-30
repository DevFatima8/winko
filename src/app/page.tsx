import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  return <HomeClient cat={cat ?? "Hot"} />;
}
