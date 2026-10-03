import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public VAPID key, needed by the browser to create a push subscription. */
export const getPushConfig = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["VAPID_PUBLIC_KEY"] ?? null;
  return { publicKey: key, enabled: !!key };
});

const subSchema = z.object({
  endpoint: z.string().url().max(600),
  p256dh: z.string().min(10).max(300),
  auth: z.string().min(5).max(300),
  userAgent: z.string().max(200).optional().default(""),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => subSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent || null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error("Nie udało się włączyć powiadomień na tym urządzeniu.");
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().url().max(600) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

/** Lets the doctor verify on a real device that push actually arrives (Sprint 3 DoD). */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pushToUser } = await import("./push.server");
    const result = await pushToUser(supabaseAdmin as never, context.userId);
    if (result.sent === 0) {
      throw new Error("Nie dotarło na żadne urządzenie. Włącz powiadomienia i spróbuj ponownie.");
    }
    return result;
  });

/** Devices with notifications enabled, for the settings screen. */
export const listPushDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, created_at, last_used_at")
      .order("created_at", { ascending: false });
    return data ?? [];
  });
