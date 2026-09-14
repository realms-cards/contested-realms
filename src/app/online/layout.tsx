"use client";

export default function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-[100dvh] bg-rc-bg">{children}</div>;
}
