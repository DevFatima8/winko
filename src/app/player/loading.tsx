import { PageLoadingSkeleton } from "@/lib/useDb";

export default function PlayerLoading() {
  return <div className="wx-bg min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-6xl"><PageLoadingSkeleton message="Player page loading" /></div></div>;
}
