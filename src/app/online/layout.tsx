"use client";

import UserBadge from "@/components/auth/UserBadge";

export default function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-900">
      {children}
      {/* Floating presence/user badge for all online pages */}
      <UserBadge variant="floating" />
    </div>
  );
}
