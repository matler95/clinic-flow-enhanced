export function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

export function guessMime(f: File) {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (ext === "stl") return "model/stl";
  if (ext === "dcm") return "application/dicom";
  return "application/octet-stream";
}

export function dropUrl(token: string) {
  return `${window.location.origin}/d/${token}`;
}

export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.dcm,application/dicom";

/** Direct PUT to a server-issued signed upload URL; stored with Cache-Control: no-store. */
export async function putSigned(path: string, token: string, file: File, mime: string) {
  const base = import.meta.env['VITE_SUPABASE_URL'] as string;
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;
  const res = await fetch(`${base}/storage/v1/object/upload/sign/files/${path}?token=${encodeURIComponent(token)}`, {
    method: "PUT",
    headers: { "content-type": mime, "cache-control": "no-store", "x-upsert": "false", apikey: key },
    body: file,
  });
  if (!res.ok) throw new Error("Wysyłanie przerwane. Sprawdź połączenie i spróbuj ponownie.");
}
