-- ============================================================================
-- Migration: K24 – Administrácia: member role, oprávnenia a aktivačné kódy
-- Date: 20261128
-- Idempotná (CREATE OR REPLACE / IF NOT EXISTS). IBA PODFRVA, NEAPLIKOVAŤ
-- automaticky do žiadnej databázy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_permission_denials – explicitné odobratie oprávnenia.
--    Potlačí oprávnenie zdedené z roly aj individuálne pridané.
--    Efektívne oprávnenie = (role ∨ individuálny grant) \ individuálny odber.
-- ---------------------------------------------------------------------------
create table if not exists public.user_permission_denials (
    user_id       uuid not null references auth.users(id) on delete cascade,
    permission_id uuid not null references public.permissions(id) on delete cascade,
    created_at    timestamptz not null default now(),
    created_by    uuid references auth.users(id) on delete set null,
    primary key (user_id, permission_id)
);

alter table public.user_permission_denials enable row level security;

drop policy if exists user_permission_denials_select_authenticated on public.user_permission_denials;
create policy user_permission_denials_select_authenticated
  on public.user_permission_denials for select to authenticated
  using (true);

drop policy if exists user_permission_denials_manage_admin on public.user_permission_denials;
create policy user_permission_denials_manage_admin
  on public.user_permission_denials for all to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.code = 'ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.code = 'ADMIN'
    )
  );

revoke all on public.user_permission_denials from anon, public;
grant select on public.user_permission_denials to authenticated;
grant insert, update, delete on public.user_permission_denials to authenticated;
grant all on public.user_permission_denials to service_role;

-- ---------------------------------------------------------------------------
-- 2. invitation_permissions – oprávnenia schválené v aktivačnom kóde.
--    Po uplatnení kódu sa udelia ako individuálne granty danému účtu.
-- ---------------------------------------------------------------------------
create table if not exists public.invitation_permissions (
    invitation_id uuid not null references public.invitations(id) on delete cascade,
    permission_id uuid not null references public.permissions(id) on delete cascade,
    primary key (invitation_id, permission_id)
);

alter table public.invitation_permissions enable row level security;

drop policy if exists invitation_permissions_select_authenticated on public.invitation_permissions;
create policy invitation_permissions_select_authenticated
  on public.invitation_permissions for select to authenticated
  using (true);

drop policy if exists invitation_permissions_manage_admin on public.invitation_permissions;
create policy invitation_permissions_manage_admin
  on public.invitation_permissions for all to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.code = 'ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.code = 'ADMIN'
    )
  );

revoke all on public.invitation_permissions from anon, public;
grant select on public.invitation_permissions to authenticated;
grant insert, update, delete on public.invitation_permissions to authenticated;
grant all on public.invitation_permissions to service_role;

-- ---------------------------------------------------------------------------
-- 3. invitations – stĺpce pre ochranu proti brute-force (neodstraňuje žiadne
--    existujúce stĺpce, iba pridáva).
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz null;

create index if not exists idx_invitations_locked_until
  on public.invitations (locked_until)
  where locked_until is not null;


-- ---------------------------------------------------------------------------
-- 4. has_permission – konzistentne odčíta explicitné odobratia (denials).
--    Stejný výpočet musí byť v SQL (has_permission RPC) aj v TS (getAuthContext).
-- ---------------------------------------------------------------------------
create or replace function public.has_permission(p_user_id uuid, p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id and r.code = 'ADMIN'
    )
    or exists (
      select 1 from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = p_user_id and p.code = p_permission_code
    )
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_user_id and p.code = p_permission_code
    )
  )
  and not exists (
    select 1 from public.user_permission_denials upd
    join public.permissions p2 on p2.id = upd.permission_id
    where upd.user_id = p_user_id and p2.code = p_permission_code
  );
$$;

revoke all on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. create_invitation – ADMIN rola nie je priraditeľná bežným aktivačným kódom.
--    len volajúci s rolu ADMIN smie vytvoriť kód s rolu ADMIN.
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(
    p_role_code      text,
    p_code_hash      text,
    p_expires_at     timestamptz,
    p_target_email   text default null,
    p_member_id      uuid default null,
    p_max_uses       integer default 1,
    p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_uid        uuid := auth.uid();
    v_role_id    uuid;
    v_invitation uuid;
begin
    if v_uid is null then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;

    if not public.has_permission(v_uid, 'admin.users') then
        raise exception 'Forbidden: admin.users permission required' using errcode = '42501';
    end if;

    -- Whitelist rolí (mirror src/lib/auth/roles.ts).
    if p_role_code is null
       or p_role_code not in ('ADMIN','VEDENIE','VELITEL','POKLADNIK','TRENER','CLEN','RODIC') then
        raise exception 'Unknown role code' using errcode = '22023';
    end if;

    -- ADMIN smie byť v aktivačnom kóde iba ak si to výslovne dovolí sám ADMIN.
    if p_role_code = 'ADMIN' and not public.has_role(v_uid, 'ADMIN') then
        raise exception 'Role ADMIN cannot be assigned via activation code' using errcode = '42501';
    end if;

    if p_code_hash is null or length(btrim(p_code_hash)) <> 64 then
        raise exception 'Invalid code hash' using errcode = '22023';
    end if;

    if p_expires_at is null or p_expires_at <= now() then
        raise exception 'Expiration must be in the future' using errcode = '22023';
    end if;

    if p_max_uses is null or p_max_uses < 1 or p_max_uses > 100 then
        raise exception 'Invalid max_uses' using errcode = '22023';
    end if;

    select r.id into v_role_id
    from public.roles r
    where r.code = p_role_code;

    if v_role_id is null then
        raise exception 'Role does not exist' using errcode = '23503';
    end if;

    insert into public.invitations (
        code_hash, role, max_uses, use_count, expires_at,
        created_by, target_email, member_id, status, notes
    ) values (
        lower(btrim(p_code_hash)),
        p_role_code,
        p_max_uses,
        0,
        p_expires_at,
        v_uid,
        nullif(btrim(lower(coalesce(p_target_email, ''))), ''),
        p_member_id,
        'active',
        nullif(btrim(p_notes), '')
    )
    returning id into v_invitation;

    return v_invitation;
end;
$$;

revoke all on function public.create_invitation(text, text, timestamptz, text, uuid, integer, text) from public;
grant execute on function public.create_invitation(text, text, timestamptz, text, uuid, integer, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. claim_invitation_code – atomické uplatnenie s ochranou proti brute-force
--    a udelením oprávnení z kódu (nie iba roly).
-- ---------------------------------------------------------------------------
create or replace function public.claim_invitation_code(
    p_code    text,
    p_user_id uuid,
    p_email   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_normalized text;
    v_hash       text;
    v_invitation uuid;
    v_role       text;
    v_role_id    uuid;
    v_uid        uuid := auth.uid();
    v_locked     boolean;
begin
    if p_user_id is null then
        return jsonb_build_object('success', false, 'error', 'invalid_code');
    end if;

    if v_uid is not null then
        if p_user_id <> v_uid then
            raise exception 'Forbidden: user id mismatch' using errcode = '42501';
        end if;
    elsif current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;

    v_normalized := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9-]', '', 'g'));
    v_hash := encode(digest(v_normalized::bytea, 'sha256'::text), 'hex');

    select exists (
      select 1 from public.invitations
      where code_hash = v_hash and locked_until is not null and locked_until > now()
    ) into v_locked;
    if v_locked then
        return jsonb_build_object('success', false, 'error', 'code_unusable');
    end if;

    update public.invitations i
       set use_count = i.use_count + 1
     where i.code_hash = v_hash
       and i.status = 'active'
       and i.use_count < i.max_uses
       and i.expires_at > now()
    returning i.id, i.role into v_invitation, v_role;

    if v_invitation is null then
        update public.invitations
           set failed_attempts = failed_attempts + 1,
               locked_until = case
                                when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
                                else locked_until
                              end
         where code_hash = v_hash;

        if exists (select 1 from public.invitations where code_hash = v_hash) then
            return jsonb_build_object('success', false, 'error', 'code_unusable');
        end if;
        return jsonb_build_object('success', false, 'error', 'invalid_code');
    end if;

    update public.invitations
       set failed_attempts = 0, locked_until = null
     where id = v_invitation;

    select r.id into v_role_id
    from public.roles r
    where r.code = v_role;

    if v_role_id is null then
        raise exception 'Role does not exist' using errcode = '23503';
    end if;

    insert into public.user_roles (user_id, role_id)
    values (p_user_id, v_role_id)
    on conflict (user_id, role_id) do nothing;

    insert into public.user_permissions (user_id, permission_id, granted_by)
    select p_user_id, ip.permission_id, p_user_id
    from public.invitation_permissions ip
    where ip.invitation_id = v_invitation
    on conflict (user_id, permission_id) do nothing;

    insert into public.invitation_claims (invitation_id, user_id, email)
    values (v_invitation, p_user_id, lower(btrim(coalesce(p_email, ''))));

    insert into public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) values (
        p_user_id, 'activation.use', 'users', 'invitation', v_invitation,
        jsonb_build_object('role', v_role)
    );

    insert into public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) values (
        p_user_id, 'activation.role_assigned', 'users', 'invitation', v_invitation,
        jsonb_build_object('role', v_role)
    );

    return jsonb_build_object(
        'success', true,
        'invitation_id', v_invitation,
        'role', v_role
    );
end;
$$;

revoke all on function public.claim_invitation_code(text, uuid, text) from public;
grant execute on function public.claim_invitation_code(text, uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. set_member_access – atomická zmena role + individuálnych oprávnení
--    (grant + deny) v jednej databázovej transakcii.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_access(
    p_user_id            uuid,
    p_role_code          text,
    p_grant_permissions  text[] default '{}',
    p_deny_permissions   text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_uid      uuid := auth.uid();
    v_role_id  uuid;
    v_old_role text;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'not_authenticated');
    end if;

    if not public.has_permission(v_uid, 'admin.users') then
        return jsonb_build_object('success', false, 'error', 'forbidden');
    end if;

    if p_user_id is null then
        return jsonb_build_object('success', false, 'error', 'invalid_user');
    end if;

    if p_user_id = v_uid and p_role_code = 'ADMIN' then
        return jsonb_build_object('success', false, 'error', 'self_escalation');
    end if;

    if p_role_code = 'ADMIN' and not public.has_role(v_uid, 'ADMIN') then
        return jsonb_build_object('success', false, 'error', 'admin_role_restricted');
    end if;

    select r.id into v_role_id
    from public.roles r
    where r.code = p_role_code;

    if v_role_id is null then
        return jsonb_build_object('success', false, 'error', 'unknown_role');
    end if;

    if exists (
        select 1 from unnest(p_grant_permissions) as g(code)
        where not exists (select 1 from public.permissions p where p.code = g.code)
    ) then
        return jsonb_build_object('success', false, 'error', 'invalid_permission');
    end if;

    if exists (
        select 1 from unnest(p_deny_permissions) as d(code)
        where not exists (select 1 from public.permissions p where p.code = d.code)
    ) then
        return jsonb_build_object('success', false, 'error', 'invalid_permission');
    end if;

    select r.code into v_old_role
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
    limit 1;

    delete from public.user_roles where user_id = p_user_id;
    insert into public.user_roles (user_id, role_id) values (p_user_id, v_role_id);

    delete from public.user_permission_denials where user_id = p_user_id;
    insert into public.user_permission_denials (user_id, permission_id, created_by)
    select p_user_id, p.id, v_uid
    from public.permissions p
    where p.code = any(p_deny_permissions);

    delete from public.user_permissions where user_id = p_user_id;
    insert into public.user_permissions (user_id, permission_id, granted_by)
    select p_user_id, p.id, v_uid
    from public.permissions p
    where p.code = any(p_grant_permissions);

    return jsonb_build_object(
        'success', true,
        'old_role', v_old_role,
        'new_role', p_role_code,
        'user_id', p_user_id
    );
end;
$$;

revoke all on function public.set_member_access(uuid, text, text[], text[]) from public;
grant execute on function public.set_member_access(uuid, text, text[], text[]) to authenticated, service_role;

-- ============================================================================
-- KONIEC migrácie 20261128_k24_admin_access.sql
-- ============================================================================

