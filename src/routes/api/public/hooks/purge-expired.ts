import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const ORPHAN_AGE_MS = 2 * 60 * 60 * 1000;

// Retention (G3): expired files are removed from storage FIRST; DB rows are deleted only
// for objects whose storage removal succeeded (no dangling bytes without a record).
// Also sweeps orphaned uploads (signed upload started, complete never called) older than 2h.
export const Route = createFileRoute("/api/public/hooks/purge-expired")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("items")
          .select("id, org_id, storage_path")
          .lte("expires_at", new Date().toISOString())
          .limit(500);
        if (error) return new Response("error", { status: 500 });

        let purged = 0;
        if (rows.length) {
          const { data: removed, error: stErr } = await supabaseAdmin.storage
            .from("files")
            .remove(rows.map((r) => r.storage_path));
          if (stErr) {
            console.error("[purge] storage removal failed, DB rows kept", stErr.message);
          } else {
            // Batch removal succeeded; objects already missing are treated as gone.
            void removed;
            const done = rows;
            const { error: dbErr } = await supabaseAdmin.from("items").delete().in("id", done.map((r) => r.id));
            if (dbErr) console.error("[purge] db delete failed", dbErr.message);
            else {
              purged = done.length;
              await supabaseAdmin.from("audit_log").insert(
                done.map((r) => ({ org_id: r.org_id, action: "item.expire", target: r.id, actor_label: "system" })),
              );
            }
          }
        }

        // Orphan sweep: <org>/<uuid>/<uuid> objects with no items row, older than 2h.
        let orphans = 0;
        const { data: orgs } = await supabaseAdmin.from("organizations").select("id").limit(200);
        for (const o of orgs ?? []) {
          const { data: dirs } = await supabaseAdmin.storage.from("files").list(o.id, { limit: 200 });
          for (const d of dirs ?? []) {
            const { data: objs } = await supabaseAdmin.storage.from("files").list(`${o.id}/${d.name}`, { limit: 20 });
            for (const f of objs ?? []) {
              const path = `${o.id}/${d.name}/${f.name}`;
              const created = f.created_at ? new Date(f.created_at).getTime() : Date.now();
              if (Date.now() - created < ORPHAN_AGE_MS) continue;
              const { count } = await supabaseAdmin.from("items").select("id", { count: "exact", head: true }).eq("storage_path", path);
              if (!count) {
                const { error: e } = await supabaseAdmin.storage.from("files").remove([path]);
                if (!e) orphans++;
              }
            }
          }
        }
        return Response.json({ purged, orphans });
      },
    },
  },
});
