import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Fingerprint, LogOut, Smartphone, Share } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Ustawienia — DentalHub" },
      { name: "description", content: "Profil, powiadomienia i urządzenia." },
      { property: "og:title", content: "Ustawienia — DentalHub" },
      { property: "og:description", content: "Profil, powiadomienia i urządzenia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Bell; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [name, setName] = useState("");
  const [push, setPush] = useState(false);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user.id).single()).data,
  });
  const outbox = useQuery({
    queryKey: ["outbox"],
    queryFn: async () =>
      (await supabase.from("notifications_outbox").select("*").order("created_at", { ascending: false }).limit(6)).data ?? [],
  });
  useEffect(() => {
    if (profile.data?.display_name) setName(profile.data.display_name);
    setPush(localStorage.getItem("dh_push") === "1");
  }, [profile.data]);

  async function save() {
    const n = name.trim();
    if (!n || n.length > 80) { toast.error("Podaj imię i nazwisko."); return; }
    const { error } = await supabase.from("profiles").update({ display_name: n }).eq("id", user.id);
    if (error) toast.error("Nie udało się zapisać.");
    else toast.success("Zapisano");
  }

  async function togglePush(v: boolean) {
    // DUMMY: real Web Push (VAPID) subscription goes here
    if (v && "Notification" in window) {
      const p = await Notification.requestPermission();
      if (p !== "granted") { toast.error("Powiadomienia zablokowane w przeglądarce."); return; }
    }
    setPush(v);
    localStorage.setItem("dh_push", v ? "1" : "0");
    toast.success(v ? "Powiadomienia włączone (tryb demo)" : "Powiadomienia wyłączone");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ustawienia</h1>
      <Card title="Profil" icon={Fingerprint}>
        <div className="space-y-1.5">
          <Label htmlFor="dn">Imię i nazwisko (widoczne na linkach)</Label>
          <div className="flex gap-2">
            <Input id="dn" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <Button onClick={save}>Zapisz</Button>
          </div>
        </div>
        <p className="text-muted-foreground">{user.email}</p>
        <Button variant="outline" onClick={() => toast.info("Passkey będzie dostępny po wyjściu z POC.")}>
          <Fingerprint /> Dodaj passkey (wkrótce)
        </Button>
      </Card>
      <Card title="Powiadomienia" icon={Bell}>
        <div className="flex items-center justify-between">
          <span>Powiadomienia push o nowych plikach</span>
          <Switch checked={push} onCheckedChange={togglePush} />
        </div>
        <p className="text-muted-foreground">Treść powiadomień nie zawiera nazw plików ani danych pacjentów. E-mail działa jako kanał zapasowy.</p>
        {outbox.data && outbox.data.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Ostatnie powiadomienia (demo)</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {outbox.data.map((o) => (
                <li key={o.id}>
                  {new Date(o.created_at).toLocaleString("pl-PL")} · {o.channel === "web_push" ? "Push" : "E-mail"} · {o.body}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card title="Dodaj do ekranu głównego (iPhone)" icon={Smartphone}>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Otwórz DentalHub w Safari.</li>
          <li>Stuknij <Share className="inline h-4 w-4" /> „Udostępnij”.</li>
          <li>Wybierz „Do ekranu początkowego”.</li>
          <li>Uruchom aplikację z ikony i dopiero wtedy włącz powiadomienia.</li>
        </ol>
      </Card>
      <Button variant="outline" className="w-full" onClick={signOut}>
        <LogOut /> Wyloguj
      </Button>
    </div>
  );
}
