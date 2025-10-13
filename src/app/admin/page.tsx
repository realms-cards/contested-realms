import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { ADMIN_ACTIONS } from "@/lib/admin/actions";
import { getAdminSession } from "@/lib/admin/auth";
import { getAdminStats, runConnectionTests } from "@/lib/admin/diagnostics";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { session, isAdmin } = await getAdminSession();
  if (!isAdmin) {
    redirect("/");
  }

  const [stats, connections] = await Promise.all([
    getAdminStats(),
    runConnectionTests(),
  ]);

  const adminName =
    (session?.user as { name?: string | null })?.name ??
    (session?.user as { email?: string | null })?.email ??
    "admin";

  return (
    <AdminDashboard
      adminName={adminName}
      initialStats={stats}
      initialConnections={connections}
      initialStatusTimestamp={new Date().toISOString()}
      actions={[...ADMIN_ACTIONS]}
    />
  );
}
