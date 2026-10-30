import { PageLoadingSkeleton } from "@/lib/useDb";

export default function AdminLoading() {
  return <div className="wx-bg min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-6xl"><PageLoadingSkeleton message="Admin page loading" /></div></div>;
}
