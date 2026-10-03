// Real Web Push (VAPID) sender for the Worker runtime.
// Notifications are sent WITHOUT a payload on purpose (guardrail G3): the
// service worker renders a generic "Nowy plik" message, so no file name,
// sender or patient data ever leaves the app through a push service.

type Subscription = { id: string; endpoint: string };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function vapidHeader(endpoint: string): Promise<string | null> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY_PKCS8"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:hub@example.com";
  if (!publicKey || !privateKey) return null;

  const aud = new URL(endpoint).origin;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }),
    ),
  );
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    b64ToBytes(privateKey) as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `vapid t=${signingInput}.${b64url(sig)}, k=${publicKey}`;
}

export function pushConfigured(): boolean {
  return !!process.env["VAPID_PUBLIC_KEY"] && !!process.env["VAPID_PRIVATE_KEY_PKCS8"];
}

/** Sends a content-free push to every device of a user. Dead endpoints are pruned. */
export async function pushToUser(
  admin: {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: Subscription[] | null }> };
      delete: () => { eq: (c: string, v: string) => Promise<unknown> };
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
    };
  },
  userId: string,
): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint").eq("user_id", userId);
  let sent = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    try {
      const auth = await vapidHeader(sub.endpoint);
      if (!auth) break;
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: { Authorization: auth, TTL: "86400", "Content-Length": "0" },
      });
      if (res.status === 404 || res.status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
        failed++;
      } else if (res.ok) {
        sent++;
        await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
