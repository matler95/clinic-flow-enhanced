import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Building2, Fingerprint, Link2, ShieldCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PocBanner } from "@/components/PocBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DentalHub — pliki ze wszystkich gabinetów w jednym inboksie" },
      { name: "description", content: "Recepcja wrzuca pliki przez link bez konta, lekarz otwiera je w dwóch tapnięciach." },
      { property: "og:title", content: "DentalHub — jeden inbox dla lekarza" },
      { property: "og:description", content: "Wiele gabinetów, jeden inbox plików. Bez haseł, bez Dysku Google." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Inbox, t: "Jeden inbox", d: "Pliki ze wszystkich gabinetów, z filtrem i licznikiem nieprzeczytanych." },
  { icon: Link2, t: "Link bez konta", d: "Recepcja i laboratorium wrzucają pliki przez link tylko do wysyłania." },
  { icon: Bell, t: "Od razu wiesz", d: "Powiadomienie bez nazw plików i danych wrażliwych." },
  { icon: Building2, t: "Gabinet decyduje", d: "Admin gabinetu odbiera dostęp jednym przyciskiem." },
  { icon: Fingerprint, t: "Bez haseł", d: "Logowanie passkey (Face ID) — w POC zastąpione e-mailem." },
  { icon: ShieldCheck, t: "Minimalizacja", d: "Pliki znikają po 30 dniach. To inbox, nie archiwum." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <PocBanner />
      <div className="bg-hero">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-display text-lg font-semibold text-primary">DentalHub</span>
          <Button asChild variant="ghost">
            <Link to="/auth">Zaloguj się</Link>
          </Button>
        </header>
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-12 md:pt-20">
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            Pliki z każdego gabinetu.
            <br />
            <span className="text-primary">Jeden inbox.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Recepcja wrzuca plik „dla dr Kowalskiego” przez link. Ty dostajesz powiadomienie i otwierasz go w dwóch
            tapnięciach.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Zacznij za darmo</Link>
            </Button>
          </div>
        </section>
      </div>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.t} className="rounded-2xl border bg-card p-6 shadow-soft">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
