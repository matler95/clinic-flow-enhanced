-- ===== Base schema (from repo) =====
create table public.profiles (id uuid primary key, email text, display_name text, created_at timestamptz not null default now());
create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 120), kind text not null default 'clinic' check (kind in ('clinic','personal')), created_at timestamptz not null default now());
create table public.memberships (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null, role text not null default 'doctor' check (role in ('admin','doctor','staff')), is_active boolean not null default true, created_at timestamptz not null default now(), unique (org_id, user_id));
create index memberships_user_active_idx on public.memberships (user_id) where is_active;
create table public.drop_links (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, recipient_user_id uuid, label text not null default 'Link do wysyłania', token_hash text not null unique, revoked_at timestamptz, expires_at timestamptz, max_uses int, uses int not null default 0, created_by uuid not null, created_at timestamptz not null default now());
create table public.items (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, recipient_user_id uuid, drop_link_id uuid references public.drop_links(id) on delete set null, direction text not null default 'in' check (direction in ('in','to_clinic')), file_name text not null, storage_path text not null, size_bytes bigint not null default 0, mime_type text not null default 'application/octet-stream', sender_name text, note text, scan_status text not null default 'unscanned', important boolean not null default false, read_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '30 days'));
create index on public.items (recipient_user_id, created_at desc);
create index on public.items (org_id) where recipient_user_id is null;
create index on public.items (expires_at);
create table public.audit_log (id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade, actor_user_id uuid, actor_label text, action text not null, target text, created_at timestamptz not null default now());
create table public.notifications_outbox (id uuid primary key default gen_random_uuid(), user_id uuid not null, channel text not null, body text not null, status text not null default 'dummy_sent', created_at timestamptz not null default now());
create table public.invitations (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, email text not null check (char_length(email) between 3 and 255), role text not null default 'doctor' check (role in ('admin','doctor','staff')), invited_by uuid not null, accepted_at timestamptz, declined_at timestamptz, created_at timestamptz not null default now());
create unique index invitations_pending_uniq on public.invitations (org_id, lower(email)) where accepted_at is null and declined_at is null;
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null, endpoint text not null unique, p256dh text not null, auth text not null, user_agent text, created_at timestamptz not null default now(), last_used_at timestamptz);
create index on public.push_subscriptions (user_id);

grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update on public.drop_links to authenticated;
-- M0: column-level update only (expires_at, scan_status, recipient_user_id are protected)
grant select, delete on public.items to authenticated;
grant update (read_at, important, archived_at) on public.items to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.notifications_outbox to authenticated;
grant select, delete on public.invitations to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.profiles, public.organizations, public.memberships, public.drop_links, public.items, public.audit_log, public.notifications_outbox, public.invitations, public.push_subscriptions to service_role;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.drop_links enable row level security;
alter table public.items enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications_outbox enable row level security;
alter table public.invitations enable row level security;
alter table public.push_subscriptions enable row level security;

-- M0 helpers: original parameter names kept, inactive members excluded
create or replace function public.is_member(_org uuid, _uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id=_org and m.user_id=_uid and m.is_active) $$;
create or replace function public.has_org_role(_org uuid, _uid uuid, _role text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id=_org and m.user_id=_uid and m.is_active and m.role=_role) $$;
create or replace function public.shares_org(_a uuid, _b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m1 join memberships m2 on m1.org_id=m2.org_id where m1.user_id=_a and m2.user_id=_b and m1.is_active and m2.is_active) $$;

create policy "profiles read" on public.profiles for select to authenticated using (id = auth.uid() or public.shares_org(auth.uid(), id));
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "orgs read" on public.organizations for select to authenticated using (public.is_member(id, auth.uid()));
create policy "orgs admin update" on public.organizations for update to authenticated using (public.has_org_role(id, auth.uid(), 'admin'));
create policy "members read" on public.memberships for select to authenticated using (user_id = auth.uid() or public.is_member(org_id, auth.uid()));
create policy "links read" on public.drop_links for select to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin') or (recipient_user_id = auth.uid() and public.is_member(org_id, auth.uid())));
create policy "links insert" on public.drop_links for insert to authenticated with check (created_by = auth.uid() and public.is_member(org_id, auth.uid()) and (public.has_org_role(org_id, auth.uid(), 'admin') or (recipient_user_id = auth.uid() and public.has_org_role(org_id, auth.uid(), 'doctor'))));
create policy "links update" on public.drop_links for update to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin') or (recipient_user_id = auth.uid() and public.is_member(org_id, auth.uid())));
create policy "items read" on public.items for select to authenticated using (expires_at > now() and public.is_member(org_id, auth.uid()) and (recipient_user_id = auth.uid() or (recipient_user_id is null and (public.has_org_role(org_id, auth.uid(), 'admin') or public.has_org_role(org_id, auth.uid(), 'staff')))));
create policy "items update" on public.items for update to authenticated using (expires_at > now() and public.is_member(org_id, auth.uid()) and (recipient_user_id = auth.uid() or (recipient_user_id is null and (public.has_org_role(org_id, auth.uid(), 'admin') or public.has_org_role(org_id, auth.uid(), 'staff')))));
create policy "items delete" on public.items for delete to authenticated using (public.is_member(org_id, auth.uid()) and (recipient_user_id = auth.uid() or (recipient_user_id is null and public.has_org_role(org_id, auth.uid(), 'admin'))));
create policy "audit read" on public.audit_log for select to authenticated using (actor_user_id = auth.uid() or public.has_org_role(org_id, auth.uid(), 'admin'));
create policy "outbox read own" on public.notifications_outbox for select to authenticated using (user_id = auth.uid());
create policy "inv read" on public.invitations for select to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin') or lower(email) = lower(auth.jwt()->>'email'));
create policy "inv admin delete" on public.invitations for delete to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin'));
create policy "push read own" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push delete own" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create or replace function public.create_organization(_name text, _kind text default 'clinic') returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations(name, kind) values (_name, coalesce(_kind,'clinic')) returning id into _id;
  insert into memberships(org_id, user_id, role) values (_id, auth.uid(), 'admin');
  insert into audit_log(org_id, actor_user_id, action, target) values (_id, auth.uid(), 'org.create', _name);
  return _id;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare _org uuid; _name text;
begin
  _name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));
  insert into profiles(id, email, display_name) values (new.id, new.email, _name);
  insert into organizations(name, kind) values ('Własny gabinet', 'personal') returning id into _org;
  insert into memberships(org_id, user_id, role) values (_org, new.id, 'admin');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- T10: re-accepting an invitation reactivates a deactivated membership
create or replace function public.respond_invitation(_id uuid, _accept boolean) returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from invitations where id = _id and accepted_at is null and declined_at is null;
  if inv.id is null or lower(inv.email) <> lower(auth.jwt()->>'email') then raise exception 'invitation not found'; end if;
  if _accept then
    insert into memberships(org_id, user_id, role, is_active) values (inv.org_id, auth.uid(), inv.role, true)
      on conflict (org_id, user_id) do update set is_active = true, role = excluded.role;
    update invitations set accepted_at = now() where id = _id;
    insert into audit_log(org_id, actor_user_id, action, target) values (inv.org_id, auth.uid(), 'invite.accept', inv.email);
  else
    update invitations set declined_at = now() where id = _id;
    insert into audit_log(org_id, actor_user_id, action, target) values (inv.org_id, auth.uid(), 'invite.decline', inv.email);
  end if;
  return inv.org_id;
end $$;

create or replace function public.set_member_role(_membership uuid, _role text) returns void language plpgsql security definer set search_path = public as $$
declare m memberships; admins int;
begin
  if _role not in ('admin','doctor','staff') then raise exception 'bad role'; end if;
  select * into m from memberships where id = _membership and is_active;
  if m.id is null or not public.has_org_role(m.org_id, auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if m.role = 'admin' and _role <> 'admin' then
    select count(*) into admins from memberships where org_id = m.org_id and role = 'admin' and is_active;
    if admins <= 1 then raise exception 'Nie można zdegradować ostatniego administratora gabinetu.'; end if;
  end if;
  update memberships set role = _role where id = _membership;
  insert into audit_log(org_id, actor_user_id, action, target) values (m.org_id, auth.uid(), 'member.role', _role);
end $$;

-- Shared offboarding core: deactivate, revoke links, repatriate files to clinic inbox
create or replace function public._offboard(_org uuid, _target uuid, _actor uuid, _action text) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update memberships set is_active = false where org_id = _org and user_id = _target;
  update drop_links set revoked_at = now() where org_id = _org and recipient_user_id = _target and revoked_at is null;
  update items set recipient_user_id = null, direction = 'to_clinic' where org_id = _org and recipient_user_id = _target and expires_at > now();
  get diagnostics n = row_count;
  insert into audit_log(org_id, actor_user_id, action, target) values (_org, _actor, _action, _target::text);
  if n > 0 then
    insert into audit_log(org_id, actor_user_id, action, target) values (_org, _actor, 'item.repatriated_to_clinic', n::text || ' plików');
  end if;
  return n;
end $$;

create or replace function public.deactivate_member(_org uuid, _target_user uuid) returns int language plpgsql security definer set search_path = public as $$
declare _active_admins int; _target_role text; _kind text;
begin
  if not public.has_org_role(_org, auth.uid(), 'admin') then raise exception 'Brak uprawnień administratora.'; end if;
  select kind into _kind from organizations where id = _org;
  if _kind = 'personal' then raise exception 'Nie można odebrać dostępu we własnym gabinecie.'; end if;
  select role into _target_role from memberships where org_id = _org and user_id = _target_user and is_active;
  if _target_role is null then raise exception 'Użytkownik nie jest aktywnym członkiem gabinetu.'; end if;
  if _target_role = 'admin' then
    select count(*) into _active_admins from memberships where org_id = _org and role = 'admin' and is_active;
    if _active_admins <= 1 then raise exception 'Nie można dezaktywować ostatniego administratora gabinetu.'; end if;
  end if;
  return public._offboard(_org, _target_user, auth.uid(), 'member.deactivate');
end $$;

create or replace function public.leave_organization(_org uuid) returns void language plpgsql security definer set search_path = public as $$
declare m memberships; admins int; k text;
begin
  select kind into k from organizations where id = _org;
  if k = 'personal' then raise exception 'personal'; end if;
  select * into m from memberships where org_id = _org and user_id = auth.uid() and is_active;
  if m.id is null then raise exception 'not member'; end if;
  if m.role = 'admin' then
    select count(*) into admins from memberships where org_id = _org and role = 'admin' and is_active;
    if admins <= 1 and (select count(*) from memberships where org_id = _org and is_active) > 1 then raise exception 'last admin'; end if;
  end if;
  perform public._offboard(_org, auth.uid(), auth.uid(), 'member.leave');
end $$;

-- M1: triage
create or replace function public.assign_item(_item_id uuid, _doctor_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare _org uuid;
begin
  select org_id into _org from items where id = _item_id and recipient_user_id is null and expires_at > now();
  if _org is null then raise exception 'Plik nie istnieje lub został już przypisany.'; end if;
  if not (public.has_org_role(_org, auth.uid(), 'admin') or public.has_org_role(_org, auth.uid(), 'staff')) then
    raise exception 'Brak uprawnień do przypisywania plików w tym gabinecie.'; end if;
  if not (public.has_org_role(_org, _doctor_id, 'doctor') or public.has_org_role(_org, _doctor_id, 'admin')) then
    raise exception 'Wybrany odbiorca nie jest aktywnym lekarzem w tym gabinecie.'; end if;
  update items set recipient_user_id = _doctor_id, direction = 'in', read_at = null, archived_at = null where id = _item_id;
  insert into audit_log (org_id, actor_user_id, action, target) values (_org, auth.uid(), 'item.assign', _item_id::text);
  insert into notifications_outbox (user_id, channel, body) values (_doctor_id, 'web_push', 'Nowy plik w Twojej skrzynce');
end $$;

-- M1: doctor-to-colleague handover (e.g. substitute), same clinic only
create or replace function public.transfer_item(_item_id uuid, _target_doctor uuid, _note text) returns void language plpgsql security definer set search_path = public as $$
declare _org uuid; _from text;
begin
  select org_id into _org from items where id = _item_id and recipient_user_id = auth.uid() and expires_at > now();
  if _org is null then raise exception 'Plik nie należy do Ciebie.'; end if;
  if not public.is_member(_org, auth.uid()) then raise exception 'Nie jesteś aktywnym członkiem gabinetu.'; end if;
  if _target_doctor = auth.uid() then raise exception 'Nie możesz przekazać pliku sobie.'; end if;
  if not (public.has_org_role(_org, _target_doctor, 'doctor') or public.has_org_role(_org, _target_doctor, 'admin')) then
    raise exception 'Odbiorca nie jest aktywnym lekarzem tego gabinetu.'; end if;
  select coalesce(display_name, email) into _from from profiles where id = auth.uid();
  update items
    set recipient_user_id = _target_doctor, read_at = null, archived_at = null,
        note = left(coalesce(note || E'\n', '') || '[Przekazane przez ' || coalesce(_from,'lekarza') || ']: ' || coalesce(nullif(trim(_note),''), '—'), 2000)
    where id = _item_id;
  insert into audit_log (org_id, actor_user_id, action, target) values (_org, auth.uid(), 'item.transfer', _item_id::text);
  insert into notifications_outbox (user_id, channel, body) values (_target_doctor, 'web_push', 'Przekazano Ci plik w gabinecie');
end $$;

-- Upload hardening: atomic link consumption (service role only)
create or replace function public.consume_drop_link(_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update drop_links set uses = uses + 1
   where id = _id and revoked_at is null and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses);
  get diagnostics n = row_count;
  return n = 1;
end $$;

alter publication supabase_realtime add table public.items;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_member(uuid, uuid), public.has_org_role(uuid, uuid, text), public.shares_org(uuid, uuid),
  public.create_organization(text, text), public.respond_invitation(uuid, boolean), public.set_member_role(uuid, text),
  public.deactivate_member(uuid, uuid), public.leave_organization(uuid), public.assign_item(uuid, uuid), public.transfer_item(uuid, uuid, text)
  to authenticated;
revoke execute on function public._offboard(uuid, uuid, uuid, text), public.consume_drop_link(uuid), public.handle_new_user() from authenticated;
