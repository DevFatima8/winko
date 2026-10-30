"use client";
import { getCurrentUser } from "@/lib/auth";
import { Header, BottomNav, CONTAINER } from "@/components/lobby/Lobby";
import { SupportWidget } from "@/components/SupportWidget";
import { FeedbackForm } from "@/components/FeedbackForm";
import { MailIcon } from "@/components/Icons";
import { useI18n } from "@/lib/i18n/client";
import { usePage } from "@/lib/useDb";

export default function FeedbackPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { locale } = useI18n();
  void locale;
  void params; void searchParams;
  return usePage(async () => {

  const ur = locale === "ur";
  const me = await getCurrentUser();
  const viewer = { loggedIn: !!me, isAdmin: me?.role === "admin", name: me?.name, balance: me?.balance };
  return (
    <div className="wx-bg min-h-screen text-white">
      <Header viewer={viewer} />
      <main className={`${CONTAINER} space-y-4 px-3 pb-28 pt-3 md:px-4 md:pb-12 lg:px-6`}>
        <div className="wx-card flex items-start gap-4 rounded-2xl p-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center text-white"><MailIcon size={30} /></span>
          <div><h1 className="text-xl font-black md:text-2xl">{ur ? "ریوارڈ فیڈبیک" : "Reward Feedback"}</h1><p className="mt-1 text-sm text-[#b8a7e6]">{ur ? "بونس/انعام کلیم کریں، شکایت درج کریں یا تجویز دیں۔ ہر پیغام ایڈمن ٹیم دیکھتی ہے۔" : "Claim a bonus/reward, file a complaint or share a suggestion. Every message is reviewed by the admin team."}</p></div>
        </div>
        <div className="wx-card max-w-2xl rounded-2xl p-5"><FeedbackForm loggedIn={!!me} name={me?.name} phone={me?.phone} /></div>
      </main>
      <SupportWidget userName={viewer.name} />
      <BottomNav viewer={viewer} active="home" />
    </div>
  );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
