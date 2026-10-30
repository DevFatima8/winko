"use client";
import { Card } from "@/components/Shell";
import { ProfileDevices } from "@/components/ProfileDevices";
import { SubHeader } from "@/components/PlayerUi";

export default function DevicesPageClient(_props: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <SubHeader title="Login device" />
      <Card title="Login devices">
        <p className="mb-3 text-xs text-[#b8a7e6]">Review active sessions and remove any device you no longer use.</p>
        <ProfileDevices />
      </Card>
    </div>
  );
}
