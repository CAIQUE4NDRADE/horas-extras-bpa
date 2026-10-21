-- =====================================================================
--  HISTÓRICO DE ALTERAÇÕES DAS HORAS EXTRAS
--  Rode UMA VEZ no Supabase: SQL Editor > New query > Run
--  Registra automaticamente toda criação, edição, aprovação, recusa e exclusão.
-- =====================================================================

create table if not exists public.he_historico (
  id             bigint generated always as identity primary key,
  he_id          bigint not null,
  colaborador_id uuid not null,
  acao           text not null,          -- criou | editou | aprovou | recusou | excluiu
  alterado_por   uuid,                   -- quem fez (auth.uid)
  alterado_em    timestamptz not null default now(),
  antes          jsonb,
  depois         jsonb
);

create index if not exists he_hist_he_idx on public.he_historico (he_id, alterado_em);

create or replace function public.registrar_historico_he()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_acao text;
begin
  if tg_op = 'INSERT' then
    v_acao := 'criou';
  elsif tg_op = 'DELETE' then
    v_acao := 'excluiu';
  elsif new.status <> old.status and new.status = 'aprovado' then
    v_acao := 'aprovou';
  elsif new.status <> old.status and new.status = 'recusado' then
    v_acao := 'recusou';
  else
    v_acao := 'editou';
  end if;

  insert into public.he_historico (he_id, colaborador_id, acao, alterado_por, antes, depois)
  values (
    coalesce(new.id, old.id),
    coalesce(new.colaborador_id, old.colaborador_id),
    v_acao,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_historico_he on public.horas_extras;
create trigger trg_historico_he
  after insert or update or delete on public.horas_extras
  for each row execute function public.registrar_historico_he();

-- Segurança: ninguém escreve direto (só o gatilho). Lê quem pode ver a HE.
alter table public.he_historico enable row level security;

drop policy if exists hist_select on public.he_historico;
create policy hist_select on public.he_historico for select to authenticated using (
  colaborador_id = auth.uid()
  or public.e_supervisor_de(colaborador_id)
  or public.meu_papel() = 'admin'
);
