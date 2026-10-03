import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.string().min(20).max(100);

async function resolveLink(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { hashToken } = await import("./tokens.server");
  const hash = await hashToken(token);
  const { data: link } = await supabaseAdmin
    .from("drop_links")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!link) return { error: "Ten link nie istnieje. Poproś gabinet o aktualny link." as const };
  if (link.revoked_at) return { error: "Ten link został odnowiony lub wyłączony. Poproś o nowy." as const };
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return { error: "Ten link wygasł. Poproś gabinet o nowy." as const };
  if (link.max_uses != null && link.uses >= link.max_uses)
    return { error: "Limit wysyłek dla tego linku został wyczerpany." as const };
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", link.org_id)
    .single();
  let recipientName: string | null = null;
  if (link.recipient_user_id) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", link.recipient_user_id)
      .maybeSingle();
    recipientName = p?.display_name ?? null;
  }
  return { link, orgName: org?.name ?? "Gabinet", recipientName };
}

export const getDropInfo = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const r = await resolveLink(data.token);
    if ("error" in r) return { ok: false as const, error: r.error };
    return { ok: true as const, orgName: r.orgName, recipientName: r.recipientName, label: r.link.label };
  });

const fileMeta = z.object({
  token: tokenSchema,
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  mime: z.string().max(120),
});

export const dropInit = createServerFn({ method: "POST" })
  .inputValidator((d) => fileMeta.parse(d))
  .handler(async ({ data }) => {
    const { ALLOWED_MIME, MAX_BYTES } = await import("./tokens.server");
    const r = await resolveLink(data.token);
    if ("error" in r) throw new Error(r.error);
    if (data.size > MAX_BYTES) throw new Error("Plik jest za duży (maks. 50 MB).");
    const mime = data.mime || "application/octet-stream";
    if (!ALLOWED_MIME.includes(mime)) throw new Error("Ten typ pliku nie jest obsługiwany. Wyślij zdjęcie (JPG, PNG, WebP), PDF lub DICOM.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${r.link.org_id}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
    const { data: up, error } = await supabaseAdmin.storage.from("files").createSignedUploadUrl(path);
    if (error || !up) throw new Error("Nie udało się rozpocząć wysyłania. Spróbuj ponownie.");
    return { path: up.path, uploadToken: up.token };
  });

export const dropComplete = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    fileMeta
      .extend({
        path: z.string().max(200),
        senderName: z.string().trim().max(100).optional().default(""),
        note: z.string().trim().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await resolveLink(data.token);
    if ("error" in r) throw new Error(r.error);
    if (!data.path.startsWith(`${r.link.org_id}/`)) throw new Error("Nieprawidłowa ścieżka.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendDummyNotification, verifyStoredObject } = await import("./tokens.server");
    const mime = data.mime || "application/octet-stream";
    await verifyStoredObject(supabaseAdmin, data.path, data.size, mime);
    // Atomic: uses = uses + 1 only while the link is still valid and under its limit
    const { data: consumed } = await supabaseAdmin.rpc("consume_drop_link", { _id: r.link.id });
    if (!consumed) {
      await supabaseAdmin.storage.from("files").remove([data.path]);
      throw new Error("Limit wysyłek dla tego linku został wyczerpany.");
    }
    // M2: if the addressed doctor is on a planned absence, deliver to the substitute
    let recipient = r.link.recipient_user_id;
    if (recipient) {
      const { data: eff } = await supabaseAdmin.rpc("resolve_recipient", { _org: r.link.org_id, _doctor: recipient });
      if (eff) recipient = eff as string;
    }
    const substituteFor = recipient && recipient !== r.link.recipient_user_id ? r.link.recipient_user_id : null;
    const { data: item, error } = await supabaseAdmin
      .from("items")
      .insert({
        org_id: r.link.org_id,
        recipient_user_id: recipient,
        substitute_for: substituteFor,
        drop_link_id: r.link.id,
        file_name: data.fileName,
        storage_path: data.path,
        size_bytes: data.size,
        mime_type: mime,
        sender_name: data.senderName || null,
        note: data.note || null,
        scan_status: "unscanned", // DUMMY: ClamAV scan placeholder
      })
      .select("id, created_at")
      .single();
    if (error || !item) throw new Error("Nie udało się zapisać pliku.");
    await supabaseAdmin.from("audit_log").insert({
      org_id: r.link.org_id,
      actor_label: data.senderName || "Link do wysyłania",
      action: "item.drop",
      target: item.id,
    });
    if (recipient) {
      await sendDummyNotification(supabaseAdmin, recipient, r.orgName);
    } else {
      // Clinic inbox: notify active reception/admins so someone triages it
      const { data: staff } = await supabaseAdmin
        .from("memberships").select("user_id").eq("org_id", r.link.org_id).eq("is_active", true).in("role", ["admin", "staff"]);
      for (const s of staff ?? []) await sendDummyNotification(supabaseAdmin, s.user_id, r.orgName);
    }
    return { deliveredAt: item.created_at, recipientName: r.recipientName, orgName: r.orgName, itemId: item.id };
  });
