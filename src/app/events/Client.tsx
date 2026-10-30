"use client";

import Image from "next/image";
import Link from "next/link";
import { Header, BottomNav, CONTAINER } from "@/components/lobby/Lobby";
import { SupportWidget } from "@/components/SupportWidget";
import { ArrowLeftIcon } from "@/components/Icons";
import { useSession } from "@/lib/useDb";
import { useI18n } from "@/lib/i18n/client";
import firstDeposit from "../../../public/events/02_First_Deposit_20_Percent.png";
import weeklyCashback from "../../../public/events/01_Weekly_Cashback.png";
import depositBonus from "../../../public/events/05_Deposit_Bonus_5_Percent.png";
import invite from "../../../public/events/03_Invite_A_Friend_600_Rewards.png";
import rewardWheel from "../../../public/events/06_Free_Reward_Wheel.png";
import vip from "../../../public/events/07_VIP_Program.png";
import maxDrop from "../../../public/events/04_Max_Drop_100000_PKR.png";
import aviator from "../../../public/events/08_Aviator.png";

const EVENTS = [
  { image: firstDeposit, title: "First Deposit - Up to 20% Bonus" },
  { image: weeklyCashback, title: "Weekly Cashback - 25% weekly cashback" },
  { image: depositBonus, title: "Deposit Bonus - Get 5% deposit bonus" },
  { image: invite, title: "Invite a Friend - Get up to 600 rewards" },
  { image: rewardWheel, title: "Free Reward Wheel - Free rewards and spins" },
  { image: vip, title: "VIP Program - Higher withdrawal limits and benefits" },
  { image: maxDrop, title: "Max Drop - Up to PKR 100,000" },
  { image: aviator, title: "Aviator - Game promotion" },
];

export default function EventsClient() {
  const { user } = useSession();
  const { t, isUr } = useI18n();
  const viewer = { loggedIn: !!user, isAdmin: user?.role === "admin", name: user?.name, balance: user?.balance, uid: user?.role === "client" ? user.displayId ?? undefined : user?.adminId ?? user?.id };
  return (
    <div className="wx-bg min-h-[100dvh] text-white">
      <Header viewer={viewer} />
      <main className={`${CONTAINER} space-y-4 px-3 pb-28 pt-3 md:px-4 md:pb-12 lg:px-6`}>
        <div className="flex items-center gap-3">
          <Link href="/" aria-label={t("backHome")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-300"><ArrowLeftIcon size={18} /></Link>
          <h1 className="text-xl font-bold md:text-2xl">{isUr ? "ایونٹس" : "Events"}</h1>
        </div>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {EVENTS.map((event, index) => (
            <article key={event.image.src} aria-label={event.title} className={`overflow-hidden rounded-xl border border-white/10 bg-black/20 ${index === 0 ? "md:col-span-2" : ""}`}>
              <Image src={event.image} alt={event.title} sizes={index === 0 ? "(min-width: 1320px) 1280px, 100vw" : "(min-width: 1320px) 640px, (min-width: 768px) 50vw, 100vw"} priority={index === 0} className="h-auto w-full" />
            </article>
          ))}
        </div>
      </main>
      <SupportWidget userName={viewer.name} />
      <BottomNav viewer={viewer} active="home" />
    </div>
  );
}
