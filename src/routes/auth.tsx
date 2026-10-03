import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PocBanner } from "@/components/PocBanner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logowanie — DentalHub" },
      { name: "description", content: "Zaloguj się do swojego inboksu plików." },
      { property: "og:title", content: "Logowanie — DentalHub" },
      { property: "og:description", content: "Zaloguj się do swojego inboksu plików." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Podaj poprawny e-mail").max(255),
  password: z.string().min(8, "Hasło musi mieć min. 8 znaków").max(72),
  name: z.string().trim().max(80).optional(),
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse({ email, password, name });
    if (!p.success) { toast.error(p.error.issues[0]?.message ?? "Błąd"); return; }
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error("Nieprawidłowy e-mail lub hasło.");
        navigate({ to: "/inbox" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/inbox", data: { display_name: name || undefined } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/inbox" });
        else setSent(true);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-hero">
      <PocBanner />
      <div className="mx-auto flex max-w-sm flex-col px-6 pt-16">
        <Link to="/" className="font-display text-lg font-semibold text-primary">
          DentalHub
        </Link>
        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-soft">
          {sent ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold">Sprawdź skrzynkę</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Wysłaliśmy link potwierdzający na {email}. Kliknij go, aby wejść do inboksu.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold">{mode === "in" ? "Zaloguj się" : "Załóż konto lekarza"}</h1>
              <Button
                type="button"
                variant="outline"
                className="mt-5 h-12 w-full"
                onClick={() => toast.info("Passkey (Face ID / Touch ID) będzie dostępny po wyjściu z POC.")}
              >
                <Fingerprint /> Zaloguj passkey
              </Button>
              <div className="my-4 text-center text-xs text-muted-foreground">lub e-mailem</div>
              <form onSubmit={submit} className="space-y-3">
                {mode === "up" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Imię i nazwisko</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="dr Jan Kowalski" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw">Hasło</Label>
                  <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="h-12 w-full" disabled={busy}>
                  {mode === "in" ? "Zaloguj" : "Załóż konto"}
                </Button>
              </form>
              <button
                className="mt-4 w-full text-center text-sm text-primary"
                onClick={() => setMode(mode === "in" ? "up" : "in")}
              >
                {mode === "in" ? "Nie masz konta? Załóż je" : "Masz konto? Zaloguj się"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
