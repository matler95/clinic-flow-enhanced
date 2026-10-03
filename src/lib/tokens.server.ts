export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Strict allow-list: images, PDF and DICOM only. exe/zip/txt and unknown types are rejected.
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/dicom"];

function sniff(b: Uint8Array): string | null {
  const at = (o: number, sig: number[]) => sig.every((v, i) => b[o + i] === v);
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (at(128, [0x44, 0x49, 0x43, 0x4d])) return "application/dicom";
  return null;
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/**
 * Server-side verification after a direct-to-storage upload: the object must exist,
 * its stored size must match the declared size, and its magic bytes must match the
 * declared (allow-listed) MIME type. On failure the object is removed.
 */
export async function verifyStoredObject(admin: Admin, path: string, size: number, mime: string): Promise<void> {
  const fail = async (msg: string) => {
    await admin.storage.from("files").remove([path]);
    throw new Error(msg);
  };
  if (!ALLOWED_MIME.includes(mime)) await fail("Ten typ pliku nie jest obsługiwany. Wyślij zdjęcie (JPG, PNG, WebP), PDF lub DICOM.");
  const dir = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").pop()!;
  const { data: listed } = await admin.storage.from("files").list(dir, { search: name, limit: 5 });
  const obj = listed?.find((o) => o.name === name);
  if (!obj) throw new Error("Plik nie dotarł na serwer. Spróbuj ponownie.");
  const realSize = Number((obj.metadata as { size?: number } | null)?.size ?? -1);
  if (realSize !== size || realSize > MAX_BYTES) await fail("Rozmiar pliku nie zgadza się z deklaracją.");
  const { data: signed } = await admin.storage.from("files").createSignedUrl(path, 30);
  if (!signed) await fail("Nie udało się zweryfikować pliku.");
  const res = await fetch(signed!.signedUrl, { headers: { Range: "bytes=0-135" } });
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 136);
  if (sniff(head) !== mime) await fail("Zawartość pliku nie odpowiada jego typowi. Plik odrzucono.");
}

export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * M3: notify a user about a new file. Real Web Push (VAPID, content-free) to every
 * registered device; the outbox row records the delivery result. E-mail stays a
 * recorded fallback until an e-mail provider is connected.
 */
export async function sendDummyNotification(
  admin: { from: (t: string) => any },
  userId: string,
  orgName: string,
) {
  const body = `Nowy plik w: ${orgName}`; // no file names / patient data (G3)
  const { pushToUser, pushConfigured } = await import("./push.server");
  const res = await pushToUser(admin as any, userId).catch(() => ({ sent: 0, failed: 1 }));
  const pushStatus = !pushConfigured() ? "not_configured" : res.sent > 0 ? "sent" : res.failed > 0 ? "failed" : "no_device";
  await admin.from("notifications_outbox").insert([
    { user_id: userId, channel: "web_push", body, status: pushStatus },
    { user_id: userId, channel: "email", body, status: "queued_no_provider" },
  ]);
}
