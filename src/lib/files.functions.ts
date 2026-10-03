import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const URL_TTL_S = 120;

export const getFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), refresh: z.boolean().optional().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("items")
      .select("id, org_id, storage_path, read_at, file_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) throw new Error("Brak dostępu do pliku.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("files")
      .createSignedUrl(item.storage_path, URL_TTL_S);
    if (error || !signed) throw new Error("Nie udało się otworzyć pliku.");
    // Silent refreshes (viewer kept open) neither re-mark nor re-audit — one entry per viewing session.
    if (!data.refresh) {
      if (!item.read_at) await context.supabase.from("items").update({ read_at: new Date().toISOString() }).eq("id", item.id);
      // Delivery receipt for the sender ("otwarto"), protected column — service role only
      await supabaseAdmin.from("items").update({ first_opened_at: new Date().toISOString() }).eq("id", item.id).is("first_opened_at", null);
      await supabaseAdmin.from("audit_log").insert({
        org_id: item.org_id,
        actor_user_id: context.userId,
        action: "item.view_session_start",
        target: item.id,
      });
    }
    return { url: signed.signedUrl, expiresIn: URL_TTL_S };
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("items")
      .select("id, org_id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) throw new Error("Brak dostępu.");
    const { error } = await context.supabase.from("items").delete().eq("id", item.id);
    if (error) throw new Error("Nie można usunąć tego pliku.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("files").remove([item.storage_path]);
    await supabaseAdmin.from("audit_log").insert({
      org_id: item.org_id,
      actor_user_id: context.userId,
      action: "item.delete",
      target: item.id,
    });
    return { ok: true };
  });

export const createDropLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        forMe: z.boolean(),
        label: z.string().trim().min(1).max(80),
        expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { newToken, hashToken } = await import("./tokens.server");
    const token = newToken();
    const { error } = await context.supabase.from("drop_links").insert({
      org_id: data.orgId,
      recipient_user_id: data.forMe ? context.userId : null,
      label: data.label,
      token_hash: await hashToken(token),
      created_by: context.userId,
      expires_at: data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString()
        : null,
    });
    if (error) throw new Error("Twoja rola nie pozwala tworzyć tego linku. Linki tworzą lekarze (dla siebie) i administrator.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      org_id: data.orgId,
      actor_user_id: context.userId,
      action: "link.create",
      target: data.label,
    });
    return { token };
  });

export const renewDropLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: old } = await context.supabase.from("drop_links").select("*").eq("id", data.id).maybeSingle();
    if (!old) throw new Error("Brak dostępu.");
    await context.supabase.from("drop_links").update({ revoked_at: new Date().toISOString() }).eq("id", old.id);
    const { newToken, hashToken } = await import("./tokens.server");
    const token = newToken();
    const { error } = await context.supabase.from("drop_links").insert({
      org_id: old.org_id,
      recipient_user_id: old.recipient_user_id,
      label: old.label,
      token_hash: await hashToken(token),
      created_by: context.userId,
      expires_at: old.expires_at,
      max_uses: old.max_uses,
    });
    if (error) throw new Error("Nie udało się odnowić linku.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      org_id: old.org_id,
      actor_user_id: context.userId,
      action: "link.renew",
      target: old.label,
    });
    return { token };
  });

export const revokeDropLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("drop_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("org_id, label")
      .maybeSingle();
    if (error || !row) throw new Error("Brak dostępu.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      org_id: row.org_id,
      actor_user_id: context.userId,
      action: "link.revoke",
      target: row.label,
    });
    return { ok: true };
  });

export const addMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        email: z.string().trim().email().max(255),
        role: z.enum(["admin", "doctor", "staff"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_org_role", {
      _org: data.orgId,
      _uid: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Tylko administrator gabinetu może dodawać członków.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Already a member?
    const { data: profile } = await supabaseAdmin.from("profiles").select("id").ilike("email", data.email).maybeSingle();
    if (profile) {
      const { data: existing } = await supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("org_id", data.orgId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (existing) throw new Error("Ta osoba jest już członkiem gabinetu.");
    }
    // Nobody is added without consent: create a pending invitation the person accepts in the app.
    const { error } = await supabaseAdmin.from("invitations").insert({
      org_id: data.orgId,
      email: data.email.toLowerCase(),
      role: data.role,
      invited_by: context.userId,
    });
    if (error) throw new Error("Zaproszenie dla tego adresu już czeka na odpowiedź.");
    // DUMMY: invitation e-mail placeholder (Resend/Brevo) — no file names / patient data
    console.log("[dummy-invite-email]", data.email);
    await supabaseAdmin.from("audit_log").insert({
      org_id: data.orgId,
      actor_user_id: context.userId,
      action: "invite.send",
      target: data.email,
    });
    return { status: "invited" as const, hasAccount: !!profile };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgId: z.string().uuid(), userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // deactivate_member: admin check, last-admin guard, link revocation, file repatriation, audit — all in one transaction
    const { data: moved, error } = await context.supabase.rpc("deactivate_member", { _org: data.orgId, _target_user: data.userId });
    if (error) throw new Error(error.message);
    return { ok: true, repatriated: (moved as number | null) ?? 0 };
  });

async function notify(userId: string, orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { pushToUser } = await import("./push.server");
  const { data: org } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  void org;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await pushToUser(supabaseAdmin as any, userId).catch(() => ({ sent: 0, failed: 1 }));
  // Mark the outbox row written by the RPC with the real delivery result
  const { data: row } = await supabaseAdmin.from("notifications_outbox").select("id").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (row) await supabaseAdmin.from("notifications_outbox").update({ status: res.sent > 0 ? "sent" : res.failed > 0 ? "failed" : "no_device" }).eq("id", row.id);
}

export const assignItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ itemId: z.string().uuid(), doctorId: z.string().uuid(), orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: eff, error } = await context.supabase.rpc("assign_item", { _item_id: data.itemId, _doctor_id: data.doctorId });
    if (error) throw new Error(error.message);
    const recipient = (eff as string | null) ?? data.doctorId;
    await notify(recipient, data.orgId);
    return { ok: true, substituted: recipient !== data.doctorId };
  });

export const transferItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ itemId: z.string().uuid(), doctorId: z.string().uuid(), orgId: z.string().uuid(), note: z.string().trim().max(500).default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("transfer_item", { _item_id: data.itemId, _target_doctor: data.doctorId, _note: data.note });
    if (error) throw new Error(error.message);
    await notify(data.doctorId, data.orgId);
    return { ok: true };
  });

const sendMeta = z.object({
  orgId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  mime: z.string().max(120),
});

export const sendToClinicInit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendMeta.parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_member", { _org: data.orgId, _uid: context.userId });
    if (!ok) throw new Error("Nie jesteś członkiem tego gabinetu.");
    const { MAX_BYTES, ALLOWED_MIME } = await import("./tokens.server");
    if (data.size > MAX_BYTES) throw new Error("Plik jest za duży (maks. 50 MB).");
    if (!ALLOWED_MIME.includes(data.mime)) throw new Error("Ten typ pliku nie jest obsługiwany. Wyślij zdjęcie (JPG, PNG, WebP), PDF lub DICOM.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.orgId}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
    const { data: up, error } = await supabaseAdmin.storage.from("files").createSignedUploadUrl(path);
    if (error || !up) throw new Error("Nie udało się rozpocząć wysyłania.");
    return { path: up.path, uploadToken: up.token };
  });

export const sendToClinicComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    sendMeta.extend({ path: z.string().max(200), note: z.string().trim().max(500).optional().default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_member", { _org: data.orgId, _uid: context.userId });
    if (!ok || !data.path.startsWith(`${data.orgId}/`)) throw new Error("Brak dostępu.");
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { verifyStoredObject } = await import("./tokens.server");
      await verifyStoredObject(supabaseAdmin, data.path, data.size, data.mime);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("display_name").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin.from("items").insert({
      org_id: data.orgId,
      recipient_user_id: null,
      direction: "to_clinic",
      file_name: data.fileName,
      storage_path: data.path,
      size_bytes: data.size,
      mime_type: data.mime || "application/octet-stream",
      sender_name: prof?.display_name ?? "Lekarz",
      note: data.note || null,
    });
    if (error) throw new Error("Nie udało się zapisać pliku.");
    await supabaseAdmin.from("audit_log").insert({
      org_id: data.orgId,
      actor_user_id: context.userId,
      action: "item.send_to_clinic",
      target: data.fileName,
    });
    return { ok: true };
  });
