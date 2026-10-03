-- M2: planned substitutions (time windows)
create table public.substitutions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  absent_user_id uuid not null,
  substitute_user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 200),
  created_by uuid not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (absent_user_id <> substitute_user_id)
);
create index substitutions_lookup_idx on public.substitutions (org_id, absent_user_id, starts_at, ends_at) where cancelled_at is null;
grant select on public.substitutions to authenticated;
grant all on public.substitutions to service_role;
alter table public.substitutions enable row level security;
create policy "subs read" on public.substitutions for select to authenticated using (public.is_member(org_id, auth.uid()));

alter table public.items add column substitute_for uuid;

-- Resolve the effective recipient: active substitute if the doctor is absent now
create or replace function public.resolve_recipient(_org uuid, _doctor uuid) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.substitute_user_id from substitutions s
    where s.org_id = _org and s.absent_user_id = _doctor and s.cancelled_at is null
      and now() >= s.starts_at and now() < s.ends_at
      and public.is_member(_org, s.substitute_user_id)
    order by s.created_at desc limit 1
  ), _doctor) $$;

create or replace function public.create_substitution(_org uuid, _absent uuid, _substitute uuid, _starts timestamptz, _ends timestamptz, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (public.has_org_role(_org, auth.uid(), 'admin') or (_absent = auth.uid() and public.has_org_role(_org, auth.uid(), 'doctor'))) then
    raise exception 'Zastępstwo może ustawić administrator lub sam nieobecny lekarz.'; end if;
  if _absent = _substitute then raise exception 'Lekarz nie może zastępować samego siebie.'; end if;
  if _ends <= _starts then raise exception 'Koniec zastępstwa musi być po jego początku.'; end if;
  if _ends < now() then raise exception 'Zastępstwo nie może kończyć się w przeszłości.'; end if;
  if not (public.has_org_role(_org, _absent, 'doctor') or public.has_org_role(_org, _absent, 'admin')) then
    raise exception 'Nieobecna osoba nie jest aktywnym lekarzem gabinetu.'; end if;
  if not (public.has_org_role(_org, _substitute, 'doctor') or public.has_org_role(_org, _substitute, 'admin')) then
    raise exception 'Zastępca nie jest aktywnym lekarzem gabinetu.'; end if;
  if exists (select 1 from substitutions where org_id = _org and absent_user_id = _absent and cancelled_at is null
             and tstzrange(starts_at, ends_at) && tstzrange(_starts, _ends)) then
    raise exception 'W tym terminie istnieje już zastępstwo dla tego lekarza.'; end if;
  if exists (select 1 from substitutions where org_id = _org and absent_user_id = _substitute and cancelled_at is null
             and tstzrange(starts_at, ends_at) && tstzrange(_starts, _ends)) then
    raise exception 'Zastępca jest w tym czasie nieobecny.'; end if;
  insert into substitutions(org_id, absent_user_id, substitute_user_id, starts_at, ends_at, reason, created_by)
    values (_org, _absent, _substitute, _starts, _ends, nullif(trim(_reason),''), auth.uid()) returning id into _id;
  insert into audit_log(org_id, actor_user_id, action, target) values (_org, auth.uid(), 'substitution.create', _id::text);
  return _id;
end $$;

create or replace function public.cancel_substitution(_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare s substitutions;
begin
  select * into s from substitutions where id = _id and cancelled_at is null;
  if s.id is null then raise exception 'Zastępstwo nie istnieje.'; end if;
  if not (public.has_org_role(s.org_id, auth.uid(), 'admin') or s.absent_user_id = auth.uid() or s.created_by = auth.uid()) then
    raise exception 'Brak uprawnień.'; end if;
  update substitutions set cancelled_at = now() where id = _id;
  insert into audit_log(org_id, actor_user_id, action, target) values (s.org_id, auth.uid(), 'substitution.cancel', _id::text);
end $$;

-- Offboarding also cancels substitutions involving the person
create or replace function public._offboard(_org uuid, _target uuid, _actor uuid, _action text) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update memberships set is_active = false where org_id = _org and user_id = _target;
  update drop_links set revoked_at = now() where org_id = _org and recipient_user_id = _target and revoked_at is null;
  update substitutions set cancelled_at = now() where org_id = _org and cancelled_at is null and (absent_user_id = _target or substitute_user_id = _target);
  update items set recipient_user_id = null, direction = 'to_clinic' where org_id = _org and recipient_user_id = _target and expires_at > now();
  get diagnostics n = row_count;
  insert into audit_log(org_id, actor_user_id, action, target) values (_org, _actor, _action, _target::text);
  if n > 0 then
    insert into audit_log(org_id, actor_user_id, action, target) values (_org, _actor, 'item.repatriated_to_clinic', n::text || ' plików');
  end if;
  return n;
end $$;

-- M1+M2: triage respects substitutions; returns the effective recipient
drop function public.assign_item(uuid, uuid);
create or replace function public.assign_item(_item_id uuid, _doctor_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare _org uuid; _eff uuid;
begin
  select org_id into _org from items where id = _item_id and recipient_user_id is null and expires_at > now();
  if _org is null then raise exception 'Plik nie istnieje lub został już przypisany.'; end if;
  if not (public.has_org_role(_org, auth.uid(), 'admin') or public.has_org_role(_org, auth.uid(), 'staff')) then
    raise exception 'Brak uprawnień do przypisywania plików w tym gabinecie.'; end if;
  if not (public.has_org_role(_org, _doctor_id, 'doctor') or public.has_org_role(_org, _doctor_id, 'admin')) then
    raise exception 'Wybrany odbiorca nie jest aktywnym lekarzem w tym gabinecie.'; end if;
  _eff := public.resolve_recipient(_org, _doctor_id);
  update items set recipient_user_id = _eff, direction = 'in', read_at = null, archived_at = null,
    substitute_for = case when _eff <> _doctor_id then _doctor_id else null end where id = _item_id;
  insert into audit_log (org_id, actor_user_id, action, target) values (_org, auth.uid(), case when _eff <> _doctor_id then 'item.assign_substitute' else 'item.assign' end, _item_id::text);
  insert into notifications_outbox (user_id, channel, body, status) values (_eff, 'web_push', 'Nowy plik w Twojej skrzynce', 'pending');
  return _eff;
end $$;

alter table public.notifications_outbox alter column status set default 'pending';
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
    set recipient_user_id = _target_doctor, read_at = null, archived_at = null, substitute_for = null,
        note = left(coalesce(note || E'\n', '') || '[Przekazane przez ' || coalesce(_from,'lekarza') || ']: ' || coalesce(nullif(trim(_note),''), '—'), 2000)
    where id = _item_id;
  insert into audit_log (org_id, actor_user_id, action, target) values (_org, auth.uid(), 'item.transfer', _item_id::text);
  insert into notifications_outbox (user_id, channel, body) values (_target_doctor, 'web_push', 'Przekazano Ci plik w gabinecie');
end $$;

-- Sender delivery receipt: "otwarto" timestamp, readable by service role only
alter table public.items add column first_opened_at timestamptz;

revoke execute on function public.resolve_recipient(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_substitution(uuid, uuid, uuid, timestamptz, timestamptz, text), public.cancel_substitution(uuid), public.assign_item(uuid, uuid) from public, anon;
grant execute on function public.create_substitution(uuid, uuid, uuid, timestamptz, timestamptz, text), public.cancel_substitution(uuid), public.assign_item(uuid, uuid) to authenticated;
grant execute on function public.resolve_recipient(uuid, uuid) to service_role;
alter publication supabase_realtime add table public.substitutions;
