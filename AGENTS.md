<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- File bytes live in a private `files` bucket accessed only via short-lived server-issued signed URLs; upload links are write-only — anonymous senders never read.
- Uploads are verified server-side after the direct PUT (object exists, size matches, magic bytes match an allow-listed MIME) before an items row is created — client metadata is never trusted.
- State-changing operations on items/memberships (assign, transfer, deactivate, leave) go through SECURITY DEFINER RPCs; authenticated users only get column-level UPDATE on per-user flags — business invariants live in the DB.
- Memberships are deactivated (`is_active=false`), never deleted; helpers `is_member`/`has_org_role`/`shares_org` ignore inactive rows and offboarding repatriates files to the clinic inbox — access ends instantly without losing clinic records.
- Retention purge deletes from storage before the DB row — never leave bytes without a record.
- Role capabilities are defined once in src/lib/roles.ts and mirrored by RLS/RPCs — keep both in sync.
- External services (Web Push without VAPID keys, e-mail, antivirus) are dummies writing to `notifications_outbox` — POC runs without third-party accounts.
