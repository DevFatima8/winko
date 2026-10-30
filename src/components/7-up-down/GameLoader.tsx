"use client";

import dynamic from "next/dynamic";

const SevenUpDown = dynamic(() => import("./SevenUpDown"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen grid place-items-center text-white/70">
      Loading 7 Up Down…
    </div>
  ),
});

export default function GameLoader() {
  return <SevenUpDown />;
}
