import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Building2, Inbox, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PocBanner } from "@/components/PocBanner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const nav = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/clinics", label: "Gabinety", icon: Building2 },
  { to: "/settings", label: "Ustawienia", icon: Settings },
] as const;

function Layout() {
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PocBanner />
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/inbox" className="font-display text-lg font-semibold text-primary">
            DentalHub
          </Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t bg-background md:hidden">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
