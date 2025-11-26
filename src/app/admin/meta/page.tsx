import { redirect } from "next/navigation";
import MetaDashboard from "@/components/admin/MetaDashboard";
import { getAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function MetaPage() {
  const { session, isAdmin } = await getAdminSession();
  if (!isAdmin) {
    redirect("/");
  }

  const adminName =
    (session?.user as { name?: string | null })?.name ??
    (session?.user as { email?: string | null })?.email ??
    "admin";

  return <MetaDashboard adminName={adminName} />;
}
