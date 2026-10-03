import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getDropInfo, dropInit, dropComplete } from "@/lib/drop.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PocBanner } from "@/components/PocBanner";
import { fmtSize, guessMime, putSigned, ACCEPT } from "@/lib/upload";

export const Route = createFileRoute("/d/$token")({
  head: () => ({
    meta: [
      { title: "Wyślij plik — DentalHub" },
      { name: "description", content: "Wyślij plik bezpośrednio do lekarza." },
      { property: "og:title", content: "Wyślij plik — DentalHub" },
      { property: "og:description", content: "Wyślij plik bezpośrednio do lekarza, bez zakładania konta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params }) => getDropInfo({ data: { token: params.token } }),
  errorComponent: () => <Msg text="Nie udało się otworzyć linku. Odśwież stronę." />,
  notFoundComponent: () => <Msg text="Nie znaleziono linku." />,
  component: DropPage,
});

function Msg({ text }: { text: string }) {
  return (
    <div className="min-h-screen">
      <PocBanner />
      <div className="mx-auto mt-24 max-w-md px-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-4 text-lg">{text}</p>
      </div>
    </div>
  );
}

function DropPage() {
  const info = Route.useLoaderData();
  const { token } = Route.useParams();
  const [files, setFiles] = useState<File[]>([]);
  const [sender, setSender] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<{ at: string; count: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSender(localStorage.getItem("dh_sender") ?? "");
  }, []);

  if (!info.ok) return <Msg text={info.error} />;
  const title = info.recipientName ? `Plik dla ${info.recipientName}` : `Plik do skrzynki: ${info.orgName}`;

  async function send() {
    if (!files.length) return;
    localStorage.setItem("dh_sender", sender);
    setProgress(0);
    let last = "";
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f) continue;
        const meta = { token, fileName: f.name, size: f.size, mime: guessMime(f) };
        const init = await dropInit({ data: meta });
        await putSigned(init.path, init.uploadToken, f, meta.mime);
        const r = await dropComplete({ data: { ...meta, path: init.path, senderName: sender, note } });
        last = r.deliveredAt;
        setProgress(((i + 1) / files.length) * 100);
      }
      setDone({ at: last, count: files.length });
    } catch (e) {
      toast.error((e as Error).message);
      setProgress(null);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col bg-success text-success-foreground">
        <PocBanner />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CheckCircle2 className="h-20 w-20" />
          <h1 className="mt-6 text-3xl font-semibold">Dostarczono</h1>
          <p className="mt-2 text-lg opacity-90">
            {info.recipientName ?? info.orgName} otrzymał(a) {done.count > 1 ? `${done.count} pliki` : "plik"} o{" "}
            {new Date(done.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <Button
            variant="secondary"
            className="mt-8"
            onClick={() => {
              setDone(null);
              setFiles([]);
              setNote("");
              setProgress(null);
            }}
          >
            Wyślij kolejny
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hero">
      <PocBanner />
      <div className="mx-auto max-w-lg px-5 py-10">
        <p className="text-sm text-muted-foreground">{info.orgName}</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{title}</h1>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            setFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-10 text-center transition ${drag ? "border-primary bg-accent" : "border-border"}`}
        >
          <Upload className="h-10 w-10 text-primary" />
          <p className="mt-3 font-medium">Upuść plik tutaj lub kliknij</p>
          <p className="text-sm text-muted-foreground">Zdjęcia, PDF, ZIP — do 50 MB</p>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </div>
        <Button variant="outline" className="mt-3 h-12 w-full md:hidden" onClick={() => camRef.current?.click()}>
          <Camera /> Zrób zdjęcie dokumentu
        </Button>
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />

        {files.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.name} className="flex justify-between rounded-lg bg-card px-3 py-2">
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground">{fmtSize(f.size)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s">Od kogo (opcjonalnie)</Label>
            <Input id="s" value={sender} maxLength={100} onChange={(e) => setSender(e.target.value)} placeholder="np. Recepcja, Anna" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n">Notatka (opcjonalnie)</Label>
            <Textarea id="n" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {progress !== null && <Progress value={progress} className="mt-5" />}
        <Button className="mt-5 h-12 w-full" disabled={!files.length || progress !== null} onClick={send}>
          Wyślij
        </Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Bez logowania. Ten link pozwala tylko wysyłać — nie można nim niczego odczytać.
        </p>
      </div>
    </div>
  );
}
