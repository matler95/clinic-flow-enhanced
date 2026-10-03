import { supabase } from "@/integrations/supabase/client";

export type Org = { id: string; name: string; kind: string; role: string; membershipId: string };

export async function fetchMyOrgs(): Promise<Org[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, organizations(id, name, kind)")
    .eq("user_id", u.user.id)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? [])
    .filter((m) => m.organizations)
    .map((m) => ({
      id: m.organizations!.id,
      name: m.organizations!.name,
      kind: m.organizations!.kind,
      role: m.role,
      membershipId: m.id,
    }))
    .sort((a, b) => (a.kind === "personal" ? 1 : 0) - (b.kind === "personal" ? 1 : 0) || a.name.localeCompare(b.name));
}
