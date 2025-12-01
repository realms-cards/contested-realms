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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold tracking-wide text-slate-300">
            Admin
          </div>
          <nav className="flex items-center gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
