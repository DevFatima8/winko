"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, HomeIcon } from "./Icons";
import { Drawer as Panel } from "./Drawer";
import { PlayerMenu } from "./PlayerMenu";

export type MobileNavItem = { href: string; label: string; icon: ReactNode; badge?: ReactNode };

export function MobileNavDrawer({ items, title, footer, playerMenu }: { items: MobileNavItem[]; title: string; footer?: ReactNode; playerMenu?: { name: string; uid?: string; balance?: number; onLogout?: () => void } }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Menu" className="flex h-10 w-10 items-center justify-center text-white transition hover:text-[#ffc933]"><MenuIcon size={24} /></button>
      <Panel open={open} onClose={() => setOpen(false)} side="left" showClose={false} widthClass={playerMenu ? "w-[62%] min-w-[250px] max-w-[320px]" : undefined}>
        {playerMenu ? <PlayerMenu {...playerMenu} onNavigate={() => setOpen(false)} /> : (<>
        <div className="border-b wx-drawer-border bg-gradient-to-br from-[#241044] via-[#180d31] to-[#0e0920] px-4 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b8a7e6]">Navigation</div><span className="block truncate text-lg font-black text-gold-grad">{title}</span></div>
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-200 ring-1 ring-white/15 transition hover:bg-[#ff3b5c]/20 hover:text-white">×</button>
          </div>
        </div>
        <nav className="min-w-0 space-y-1 p-2 sm:p-3">
          {items.map((n, index) => {
            const active = path === n.href || (n.href !== "/admin" && n.href !== "/player" && path.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} style={{ "--drawer-index": index } as CSSProperties} className={`wx-drawer-item flex min-w-0 items-center gap-2 rounded-2xl px-2.5 py-3 text-sm font-semibold transition sm:gap-3 sm:px-3.5 sm:py-3.5 ${active ? "bg-gradient-to-r from-[#8b5cf6]/25 to-[#d946ef]/10 text-white ring-1 ring-[#8b5cf6]/60 shadow-lg shadow-[#8b5cf6]/10" : "wx-rowtext hover:bg-white/5 hover:text-white"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9 ${active ? "text-[#ffcf4a]" : "text-white"}`}>{n.icon}</span><span className="min-w-0 flex-1 truncate">{n.label}</span>{n.badge}
              </Link>
            );
          })}
          <Link href="/" className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 px-3.5 py-3.5 text-sm font-semibold wx-rowtext transition hover:bg-white/5 hover:text-white"><span className="flex h-9 w-9 items-center justify-center text-white"><HomeIcon size={20} /></span>Home</Link>
        </nav>
        {footer && <div className="mt-auto border-t wx-drawer-border bg-black/10 p-4">{footer}</div>}
        </>)}
      </Panel>
    </>
  );
}

export function ActiveLink({ href, className, activeClassName, children, exact }: { href: string; className: string; activeClassName: string; children: ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return <Link href={href} className={`${className} ${active ? activeClassName : ""}`}>{children}</Link>;
}
