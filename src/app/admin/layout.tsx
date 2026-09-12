import Link from "next/link";
import { ReactNode } from "react";
import { requireAdminSession } from "@/lib/admin/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminSession();
  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/performance", label: "Performance" },
    { href: "/admin/meta", label: "Meta" },
    { href: "/admin/training", label: "Training" },
    { href: "/admin/ladder", label: "Ladder" },
  ];
  return (
    <div className="rc-app min-h-screen">
      <header className="sticky top-0 z-10 border-b border-rc-line/18 bg-[rgba(7,10,20,0.72)] backdrop-blur-[6px]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="rc-eyebrow">Admin</div>
          <nav className="flex flex-wrap items-center gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-rc-mono text-[11px] uppercase tracking-[0.18em] text-rc-fg-muted transition-colors hover:text-rc-accent-ring"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
