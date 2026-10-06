-- Ouvre l'inscription à toute adresse SAUF @culture.gouv.fr, derrière un mot de passe d'accès commun
-- vérifié côté base ; l'accès aux données passe de "comptes @culture.gouv.fr" à "tous les comptes
-- sauf @culture.gouv.fr".
--
-- À exécuter UNE fois (Supabase → SQL Editor → coller → Run), puis définir le mot de passe d'accès :
--   select public.set_access_code('ton mot de passe commun');
-- Tant qu'aucun mot de passe n'est défini, personne ne peut s'inscrire (échec fermé).
--
-- Pour revenir en arrière sur l'accès aux données uniquement : redéfinir public.is_member()
-- (c'est la seule fonction que toutes les règles d'accès utilisent).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Mot de passe d'accès commun : seul son hash bcrypt est stocké, jamais le clair.
create table public.app_access (
  id boolean primary key default true check (id),
  code_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_access enable row level security;
revoke all on public.app_access from public, anon, authenticated;

-- Échecs récents de vérification, pour limiter les essais (20 échecs / 10 min, tous visiteurs confondus).
create table public.access_code_failures (
  at timestamptz not null default now()
);
create index access_code_failures_at_idx on public.access_code_failures (at);
alter table public.access_code_failures enable row level security;
revoke all on public.access_code_failures from public, anon, authenticated;

create or replace function private.verify_access_code(candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
  recent_failures int;
  trimmed text := btrim(coalesce(candidate, ''));
begin
  select code_hash into stored from public.app_access limit 1;
  if stored is null or trimmed = '' then
    return false;
  end if;
  delete from public.access_code_failures where at < now() - interval '1 hour';
  select count(*) into recent_failures from public.access_code_failures where at > now() - interval '10 minutes';
  if recent_failures >= 20 then
    return false;
  end if;
  if extensions.crypt(trimmed, stored) = stored then
    return true;
  end if;
  insert into public.access_code_failures default values;
  return false;
end;
$$;
revoke all on function private.verify_access_code(text) from public, anon, authenticated;

-- Définit / change le mot de passe d'accès. Réservé au propriétaire de la base (éditeur SQL).
create or replace function public.set_access_code(new_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  trimmed text := btrim(coalesce(new_code, ''));
begin
  if length(trimmed) < 8 then
    raise exception 'Le mot de passe d''accès doit faire au moins 8 caractères.';
  end if;
  insert into public.app_access (id, code_hash, updated_at)
  values (true, extensions.crypt(trimmed, extensions.gen_salt('bf', 10)), now())
  on conflict (id) do update set code_hash = excluded.code_hash, updated_at = excluded.updated_at;
  delete from public.access_code_failures;
end;
$$;
revoke all on function public.set_access_code(text) from public, anon, authenticated;

-- Appelée par la page d'entrée du site (visiteurs non connectés compris).
create or replace function public.check_access_code(code text)
returns boolean
language sql
security definer
set search_path = ''
as $$ select private.verify_access_code(code) $$;
revoke all on function public.check_access_code(text) from public;
grant execute on function public.check_access_code(text) to anon, authenticated;

-- Règles d'inscription, appliquées par la base (non contournables en appelant l'API directement) :
-- pas d'adresse @culture.gouv.fr (ni sous-domaine), et mot de passe d'accès exigé dans les
-- métadonnées d'inscription (options.data.access_code), retiré avant stockage.
create or replace function private.enforce_signup_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email ~* '@([a-z0-9-]+\.)*culture\.gouv\.fr$' then
    raise exception 'Les adresses @culture.gouv.fr ne peuvent pas s''inscrire.';
  end if;
  if not private.verify_access_code(new.raw_user_meta_data ->> 'access_code') then
    raise exception 'Mot de passe d''accès invalide.';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'access_code';
  return new;
end;
$$;
revoke all on function private.enforce_signup_rules() from public, anon, authenticated;

create trigger enforce_signup_rules_trigger
  before insert on auth.users
  for each row execute function private.enforce_signup_rules();
drop trigger enforce_culture_gouv_email_trigger on auth.users;
drop function public.enforce_culture_gouv_email();

-- Qui a accès aux données : tout compte connecté dont l'email n'est PAS en @culture.gouv.fr.
create or replace function public.is_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'email') !~* '@([a-z0-9-]+\.)*culture\.gouv\.fr$', false)
$$;
grant execute on function public.is_member() to anon, authenticated;

-- events
alter policy "culture.gouv.fr insert events" on public.events with check (public.is_member());
alter policy "culture.gouv.fr insert events" on public.events rename to "members insert events";
alter policy "culture.gouv.fr read events" on public.events using (public.is_member());
alter policy "culture.gouv.fr read events" on public.events rename to "members read events";
alter policy "culture.gouv.fr update events" on public.events using (public.is_member());
alter policy "culture.gouv.fr update events" on public.events rename to "members update events";
alter policy "host or admin delete events" on public.events
  using (public.is_member() and (host_id = auth.uid() or public.is_admin()));

-- food_reviews
alter policy "culture.gouv.fr insert food_reviews" on public.food_reviews with check (public.is_member());
alter policy "culture.gouv.fr insert food_reviews" on public.food_reviews rename to "members insert food_reviews";
alter policy "culture.gouv.fr read food_reviews" on public.food_reviews using (public.is_member());
alter policy "culture.gouv.fr read food_reviews" on public.food_reviews rename to "members read food_reviews";
alter policy "host or admin update food_reviews" on public.food_reviews
  using (public.is_member() and (host_id = auth.uid() or public.is_admin()));
alter policy "host or admin delete food_reviews" on public.food_reviews
  using (public.is_member() and (host_id = auth.uid() or public.is_admin()));

-- food_spots
alter policy "culture.gouv.fr insert food_spots" on public.food_spots with check (public.is_member());
alter policy "culture.gouv.fr insert food_spots" on public.food_spots rename to "members insert food_spots";
alter policy "culture.gouv.fr read food_spots" on public.food_spots using (public.is_member());
alter policy "culture.gouv.fr read food_spots" on public.food_spots rename to "members read food_spots";
alter policy "host or admin update food_spots" on public.food_spots
  using (public.is_member() and (host_id = auth.uid() or public.is_admin()));
alter policy "host or admin delete food_spots" on public.food_spots
  using (public.is_member() and (host_id = auth.uid() or public.is_admin()));

-- notification_preferences
alter policy "culture.gouv.fr manage own preferences" on public.notification_preferences
  using (auth.uid() = user_id and public.is_member())
  with check (auth.uid() = user_id and public.is_member());
alter policy "culture.gouv.fr manage own preferences" on public.notification_preferences
  rename to "members manage own preferences";
