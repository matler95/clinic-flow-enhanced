import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, Plus, RefreshCw, Send, UserMinus, Ban, Building2, UserRound, MailCheck, LogOut, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyOrgs, type Org } from "@/lib/queries";
import {
  createDropLink,
  renewDropLink,
  revokeDropLink,
  addMember,
  removeMember,
  sendToClinicInit,
  sendToClinicComplete,
} from "@/lib/files.functions";
import { dropUrl, guessMime, putSigned, ACCEPT } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check, Minus, Inbox as InboxIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { roleLabel, roleTagline, capabilities, can } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/clinics")({
  head: () => ({
    meta: [
      { title: "Gabinety — DentalHub" },
      { name: "description", content: "Zarządzaj gabinetami, linkami do wysyłania i dostępem." },
      { property: "og:title", content: "Gabinety — DentalHub" },
      { property: "og:description", content: "Zarządzaj gabinetami, linkami do wysyłania i dostępem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClinicsPage,
});

const roleHint = roleTagline;

function ClinicsPage() {
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: fetchMyOrgs });
  const [sel, setSel] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const current = orgs.data?.find((o) => o.id === sel) ?? orgs.data?.[0];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Gabinety</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Dodaj gabinet
        </Button>
      </div>

      <PendingInvites onAccepted={(id) => setSel(id)} />

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {orgs.data?.map((o) => (
          <button
            key={o.id}
            onClick={() => setSel(o.id)}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium ${current?.id === o.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
          >
            {o.kind === "personal" ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {o.kind === "personal" ? "Moja praktyka" : o.name}
            <span className="text-xs opacity-70">· {roleLabel[o.role]}</span>
          </button>
        ))}
      </div>

      {current && <OrgPanel key={current.id} org={current} />}
      <AddClinicDialog open={addOpen} onOpenChange={setAddOpen} onCreated={(id) => setSel(id)} />
    </div>
  );
}

function PendingInvites({ onAccepted }: { onAccepted: (orgId: string) => void }) {
  const qc = useQueryClient();
  const invites = useQuery({
    queryKey: ["my-invites"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email?.toLowerCase();
      if (!email) return [];
      const { data, error } = await supabase
        .from("invitations")
        .select("id, org_id, role, created_at")
        .eq("email", email)
        .is("accepted_at", null)
        .is("declined_at", null);
      if (error) throw error;
      return data;
    },
  });

  async function respond(id: string, accept: boolean) {
    const { data, error } = await supabase.rpc("respond_invitation", { _id: id, _accept: accept });
    if (error) { toast.error("Nie udało się odpowiedzieć na zaproszenie."); return; }
    toast.success(accept ? "Dołączono do gabinetu" : "Zaproszenie odrzucone");
    await qc.invalidateQueries({ queryKey: ["my-invites"] });
    await qc.invalidateQueries({ queryKey: ["orgs"] });
    if (accept && data) onAccepted(data);
  }

  if (!invites.data?.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {invites.data.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-secondary p-4">
          <MailCheck className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Zaproszenie do gabinetu</p>
            <p className="text-sm text-muted-foreground">Rola: {roleLabel[i.role]} — {roleHint[i.role]}</p>
          </div>
          <Button size="sm" onClick={() => respond(i.id, true)}>Dołącz</Button>
          <Button size="sm" variant="ghost" onClick={() => respond(i.id, false)}>Odrzuć</Button>
        </div>
      ))}
    </div>
  );
}

function AddClinicDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"choose" | "join" | "create">("choose");
  const [newName, setNewName] = useState("");
  const [myEmail, setMyEmail] = useState("");

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) { setStep("choose"); setNewName(""); }
  }

  async function create() {
    const name = newName.trim();
    if (!name || name.length > 120) { toast.error("Podaj nazwę gabinetu."); return; }
    const { data, error } = await supabase.rpc("create_organization", { _name: name, _kind: "clinic" });
    if (error) { toast.error("Nie udało się utworzyć gabinetu."); return; }
    await qc.invalidateQueries({ queryKey: ["orgs"] });
    toast.success("Gabinet utworzony");
    if (data) onCreated(data);
    close(false);
  }

  async function showJoin() {
    const { data } = await supabase.auth.getUser();
    setMyEmail(data.user?.email ?? "");
    setStep("join");
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {step === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>Dodaj gabinet</DialogTitle>
              <DialogDescription>Gabinet należy do placówki — to ona decyduje, kto ma dostęp.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <button onClick={showJoin} className="rounded-xl border p-4 text-left hover:bg-muted">
                <p className="font-medium">Gabinet już korzysta z DentalHub</p>
                <p className="text-sm text-muted-foreground">Poproś administratora o zaproszenie. Dołączysz jako lekarz.</p>
              </button>
              <button onClick={() => setStep("create")} className="rounded-xl border p-4 text-left hover:bg-muted">
                <p className="font-medium">Gabinetu jeszcze tu nie ma</p>
                <p className="text-sm text-muted-foreground">Utwórz go. Na start będziesz administratorem — możesz potem przekazać tę rolę placówce.</p>
              </button>
            </div>
          </>
        )}
        {step === "join" && (
          <>
            <DialogHeader>
              <DialogTitle>Dołącz przez zaproszenie</DialogTitle>
              <DialogDescription>
                Przekaż administratorowi gabinetu swój adres e-mail. Gdy wyśle zaproszenie, pojawi się ono na górze tej strony.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <span className="flex-1 truncate font-mono text-sm">{myEmail}</span>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(myEmail); toast.success("Skopiowano"); }}>
                <Copy /> Kopiuj
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setStep("choose")}>Wstecz</Button>
          </>
        )}
        {step === "create" && (
          <>
            <DialogHeader>
              <DialogTitle>Nowy gabinet</DialogTitle>
              <DialogDescription>
                Zostaniesz administratorem. Najlepiej od razu zaprosić osobę zarządzającą placówką i przekazać jej administrację.
              </DialogDescription>
            </DialogHeader>
            <Input autoFocus placeholder="Nazwa gabinetu, np. Dental Clinic Mokotów" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("choose")}>Wstecz</Button>
              <Button className="flex-1" onClick={create}><Plus /> Utwórz</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OrgPanel({ org }: { org: Org }) {
  const qc = useQueryClient();
  const isAdmin = org.role === "admin";
  const personal = org.kind === "personal";
  const memberCount = useQuery({
    queryKey: ["member-count", org.id],
    enabled: isAdmin && !personal,
    queryFn: async () => {
      const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", org.id);
      return count ?? 0;
    },
  });

  async function leave() {
    if (!confirm(`Opuścić „${org.name}”? Stracisz dostęp do plików tego gabinetu, a Twoje linki zostaną wyłączone.`)) return;
    const { error } = await supabase.rpc("leave_organization", { _org: org.id });
    if (error) {
      toast.error(error.message.includes("last admin") ? "Najpierw przekaż administrację innej osobie." : "Nie udało się opuścić gabinetu.");
      return;
    }
    toast.success("Opuszczono gabinet");
    qc.invalidateQueries({ queryKey: ["orgs"] });
  }

  return (
    <div className="mt-6 rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{personal ? "Moja praktyka" : org.name}</h2>
        <Badge variant="secondary">{roleLabel[org.role]}</Badge>
        {!personal && (
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={leave}>
            <LogOut /> Opuść
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {personal ? "Twoja prywatna praktyka — tylko Ty masz tu dostęp." : roleHint[org.role]}
      </p>
      {isAdmin && !personal && memberCount.data === 1 && (
        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm">
          <p className="font-medium">Jesteś jedyną osobą w tym gabinecie</p>
          <p className="mt-1 text-muted-foreground">
            Zaproś recepcję i osobę zarządzającą placówką (zakładka „Członkowie”). Gdy dołączy, możesz nadać jej rolę administratora i zmienić swoją na „Lekarz”.
          </p>
        </div>
      )}
      {!personal && <RoleCard role={org.role} />}
      {org.role === "staff" && !personal && (
        <Button asChild variant="secondary" className="mt-4 w-full sm:w-auto">
          <Link to="/inbox"><InboxIcon /> Otwórz skrzynkę gabinetu</Link>
        </Button>
      )}
      <Tabs defaultValue={isAdmin && !personal ? "members" : can.ownLinks(org.role) ? "links" : "send"} className="mt-4">
        <TabsList>
          {isAdmin && !personal && <TabsTrigger value="members">Zespół</TabsTrigger>}
          {can.ownLinks(org.role) && <TabsTrigger value="links">{isAdmin && !personal ? "Linki" : "Moje linki"}</TabsTrigger>}
          {!personal && <TabsTrigger value="send">Wyślij do skrzynki</TabsTrigger>}
          {can.audit(org.role) && <TabsTrigger value="audit">Audyt</TabsTrigger>}
        </TabsList>
        {can.ownLinks(org.role) && <TabsContent value="links"><LinksTab org={org} /></TabsContent>}
        {!personal && <TabsContent value="send"><SendTab org={org} /></TabsContent>}
        {isAdmin && !personal && <TabsContent value="members"><MembersTab org={org} /></TabsContent>}
        {can.audit(org.role) && <TabsContent value="audit"><AuditTab org={org} /></TabsContent>}
      </Tabs>
    </div>
  );
}

function RoleCard({ role }: { role: string }) {
  const caps = capabilities(role);
  return (
    <details className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm">
      <summary className="cursor-pointer font-medium">Co możesz jako {roleLabel[role]}?</summary>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {caps.map((c) => (
          <li key={c.label} className={`flex items-center gap-2 ${c.allowed ? "" : "text-muted-foreground"}`}>
            {c.allowed ? <Check className="h-4 w-4 text-primary" /> : <Minus className="h-4 w-4" />}
            {c.label}
          </li>
        ))}
      </ul>
      {role !== "admin" && <p className="mt-3 text-xs text-muted-foreground">Potrzebujesz więcej? Poproś administratora gabinetu o zmianę roli.</p>}
    </details>
  );
}

function LinksTab({ org }: { org: Org }) {
  const qc = useQueryClient();
  const create = useServerFn(createDropLink);
  const renew = useServerFn(renewDropLink);
  const revoke = useServerFn(revokeDropLink);
  const [label, setLabel] = useState("Recepcja");
  const [forMe, setForMe] = useState("me");
  const [fresh, setFresh] = useState<string | null>(null);
  const links = useQuery({
    queryKey: ["links", org.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drop_links")
        .select("*")
        .eq("org_id", org.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function run(fn: () => Promise<{ token?: string } | unknown>) {
    try {
      const r = (await fn()) as { token?: string };
      if (r?.token) setFresh(dropUrl(r.token));
      qc.invalidateQueries({ queryKey: ["links", org.id] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Etykieta, np. Recepcja, Laboratorium" />
        <Select value={forMe} onValueChange={setForMe}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="me">Pliki dla mnie</SelectItem>
            {org.role === "admin" && <SelectItem value="clinic">Do skrzynki gabinetu</SelectItem>}
          </SelectContent>
        </Select>
        <Button onClick={() => run(() => create({ data: { orgId: org.id, forMe: forMe === "me", label: label.trim() || "Link" } }))}>
          <Link2 /> Utwórz link
        </Button>
      </div>
      <ul className="divide-y rounded-xl border">
        {links.data?.length === 0 && <li className="p-4 text-sm text-muted-foreground">Brak aktywnych linków.</li>}
        {links.data?.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">
                {l.recipient_user_id ? "Dla lekarza" : "Skrzynka gabinetu"} · wysłano {l.uses} ·{" "}
                {l.expires_at ? `wygasa ${new Date(l.expires_at).toLocaleDateString("pl-PL")}` : "bez terminu"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => run(() => renew({ data: { id: l.id } }))}>
              <RefreshCw /> Odnów
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => revoke({ data: { id: l.id } }))}>
              <Ban /> Wyłącz
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Link jest pokazywany tylko raz (przechowujemy jedynie jego skrót). Zgubiony link — kliknij „Odnów”.
      </p>
      <Dialog open={!!fresh} onOpenChange={(v) => !v && setFresh(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link do wysyłania gotowy</DialogTitle>
            <DialogDescription>Skopiuj go teraz i przekaż recepcji. Nie pokażemy go ponownie.</DialogDescription>
          </DialogHeader>
          <div className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{fresh}</div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { navigator.clipboard.writeText(fresh!); toast.success("Skopiowano"); }}>
              <Copy /> Kopiuj
            </Button>
            <Button variant="outline" asChild>
              <a href={fresh ?? "#"} target="_blank" rel="noreferrer">Otwórz</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SendTab({ org }: { org: Org }) {
  const init = useServerFn(sendToClinicInit);
  const complete = useServerFn(sendToClinicComplete);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!file) return;
    setBusy(true);
    try {
      const meta = { orgId: org.id, fileName: file.name, size: file.size, mime: guessMime(file) };
      const r = await init({ data: meta });
      await putSigned(r.path, r.uploadToken, file, meta.mime);
      await complete({ data: { ...meta, path: r.path, note } });
      toast.success(`Wysłano do skrzynki: ${org.name}`);
      setFile(null);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm text-muted-foreground">Wyślij plik do skrzynki gabinetu (widzą go administrator i recepcja).</p>
      <Input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Input placeholder="Notatka (opcjonalnie)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <Button disabled={!file || busy} onClick={send}>
        <Send /> Wyślij do gabinetu
      </Button>
    </div>
  );
}

function MembersTab({ org }: { org: Org }) {
  const qc = useQueryClient();
  const add = useServerFn(addMember);
  const remove = useServerFn(removeMember);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"doctor" | "staff" | "admin">("staff");
  const members = useQuery({
    queryKey: ["members", org.id],
    queryFn: async () => {
      const { data: ms, error } = await supabase.from("memberships").select("id, user_id, role").eq("org_id", org.id).eq("is_active", true);
      if (error) throw error;
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email").in("id", ms.map((m) => m.user_id));
      return ms.map((m) => ({ ...m, profile: ps?.find((p) => p.id === m.user_id) }));
    },
  });
  const pending = useQuery({
    queryKey: ["org-invites", org.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, created_at")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .is("declined_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["members", org.id] });
    qc.invalidateQueries({ queryKey: ["org-invites", org.id] });
    qc.invalidateQueries({ queryKey: ["member-count", org.id] });
    qc.invalidateQueries({ queryKey: ["orgs"] });
  };

  async function invite() {
    try {
      const r = await add({ data: { orgId: org.id, email, role } });
      toast.success(
        r.hasAccount
          ? "Zaproszenie wysłane — osoba zobaczy je po zalogowaniu"
          : "Zaproszenie zapisane — zobaczy je po założeniu konta (e-mail w trybie demo nie wychodzi)",
      );
      setEmail("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (error) toast.error("Nie udało się anulować.");
    refresh();
  }

  async function changeRole(id: string, r: string) {
    const { error } = await supabase.rpc("set_member_role", { _membership: id, _role: r });
    if (error) {
      toast.error(error.message.includes("ostatniego") ? "Gabinet musi mieć co najmniej jednego administratora." : "Nie udało się zmienić roli.");
    } else toast.success("Rola zmieniona");
    refresh();
  }

  async function revokeAccess(userId: string) {
    if (!confirm("Odebrać dostęp? Działa natychmiast: linki tej osoby zostaną wyłączone, a jej pliki z tego gabinetu trafią do wspólnej skrzynki.")) return;
    try {
      const r = await remove({ data: { orgId: org.id, userId } });
      toast.success(r.repatriated ? `Dostęp odebrany · ${r.repatriated} plików przeniesiono do skrzynki gabinetu` : "Dostęp odebrany");
      qc.invalidateQueries({ queryKey: ["items"] });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="email" placeholder="e-mail osoby" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="staff">Recepcja</SelectItem>
            <SelectItem value="doctor">Lekarz</SelectItem>
            <SelectItem value="admin">Administrator</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={invite}><Plus /> Zaproś</Button>
      </div>
      <p className="text-xs text-muted-foreground">{roleHint[role]} Osoba musi sama przyjąć zaproszenie.</p>
      <ul className="divide-y rounded-xl border">
        {members.data?.map((m) => {
          const me = m.id === org.membershipId;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.profile?.display_name ?? "—"}{me && <span className="text-muted-foreground"> (Ty)</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
              </div>
              <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="doctor">Lekarz</SelectItem>
                  <SelectItem value="staff">Recepcja</SelectItem>
                </SelectContent>
              </Select>
              {!me && (
                <Button size="sm" variant="outline" onClick={() => revokeAccess(m.user_id)}>
                  <UserMinus /> Odbierz dostęp
                </Button>
              )}
            </li>
          );
        })}
        {pending.data?.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.email}</p>
              <p className="text-xs text-muted-foreground">Czeka na przyjęcie · {roleLabel[i.role]}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => cancelInvite(i.id)}>
              <X /> Anuluj
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const actionLabel: Record<string, string> = {
  "org.create": "Utworzono gabinet",
  "item.drop": "Wrzucono plik przez link",
  "item.open": "Otwarto plik",
  "item.delete": "Usunięto plik",
  "item.send_to_clinic": "Wysłano plik do gabinetu",
  "link.create": "Utworzono link",
  "link.renew": "Odnowiono link",
  "link.revoke": "Wyłączono link",
  "member.add": "Dodano członka",
  "member.revoke": "Odebrano dostęp",
  "member.role": "Zmieniono rolę",
  "member.leave": "Członek opuścił gabinet",
  "invite.send": "Wysłano zaproszenie",
  "invite.accept": "Przyjęto zaproszenie",
  "invite.decline": "Odrzucono zaproszenie",
};

function AuditTab({ org }: { org: Org }) {
  const log = useQuery({
    queryKey: ["audit", org.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  return (
    <ul className="mt-2 divide-y rounded-xl border text-sm">
      {log.data?.length === 0 && <li className="p-4 text-muted-foreground">Brak wpisów.</li>}
      {log.data?.map((a) => (
        <li key={a.id} className="flex justify-between gap-3 p-3">
          <span>
            {actionLabel[a.action] ?? a.action}
            {a.actor_label && <span className="text-muted-foreground"> · {a.actor_label}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pl-PL")}</span>
        </li>
      ))}
    </ul>
  );
}
