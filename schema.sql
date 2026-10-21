-- =====================================================================
--  HORAS EXTRAS · J036 Base de Paulínia
--  Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- ---------- TABELAS ----------
create table if not exists public.colaboradores (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  cs            text not null unique,
  cargo         text not null,
  turno         text not null check (turno in ('T1','T2','T3')),
  papel         text not null default 'colaborador'
                check (papel in ('colaborador','supervisor','admin')),
  supervisor_id uuid references public.colaboradores(id),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table if not exists public.horas_extras (
  id              bigint generated always as identity primary key,
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  data            date not null,
  turno           text not null check (turno in ('T1','T2','T3')),
  -- "Horário previsto": só preencher quando a jornada foi diferente da prevista
  jornada_entrada time,
  jornada_saida   time,
  refeicao_inicio time,
  refeicao_fim    time,
  -- Horas extras
  inicio          time not null,
  fim             time not null,
  min_35          int not null default 0 check (min_35   >= 0),
  min_80          int not null default 0 check (min_80   >= 0),
  min_80n         int not null default 0 check (min_80n  >= 0),
  min_100         int not null default 0 check (min_100  >= 0),
  min_100n        int not null default 0 check (min_100n >= 0),
  justificativa   text not null check (length(trim(justificativa)) > 0),
  -- Aprovação
  status          text not null default 'pendente'
                  check (status in ('pendente','aprovado','recusado')),
  aprovado_por    uuid references public.colaboradores(id),
  aprovado_em     timestamptz,
  motivo_recusa   text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (colaborador_id, data),
  check (min_35 + min_80 + min_80n + min_100 + min_100n > 0)
);

create index if not exists he_colab_data_idx on public.horas_extras (colaborador_id, data);
create index if not exists he_status_idx     on public.horas_extras (status);

-- ---------- FUNÇÕES DE APOIO ----------
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.colaboradores where id = auth.uid() and ativo
$$;

create or replace function public.e_supervisor_de(p_colab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.colaboradores
    where id = p_colab and supervisor_id = auth.uid()
  )
$$;

-- Colaborador comum não consegue mudar o próprio papel, supervisor, CS ou status ativo.
-- (No SQL Editor auth.uid() é nulo, então você como dono do banco pode mudar tudo.)
create or replace function public.proteger_colaborador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'admin' then
    new.papel         := old.papel;
    new.supervisor_id := old.supervisor_id;
    new.cs            := old.cs;
    new.ativo         := old.ativo;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_colaborador on public.colaboradores;
create trigger trg_proteger_colaborador
  before update on public.colaboradores
  for each row execute function public.proteger_colaborador();

-- Quando o próprio colaborador edita um lançamento, ele volta para "pendente".
create or replace function public.he_antes_update()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if auth.uid() = old.colaborador_id then
    new.colaborador_id := old.colaborador_id;
    new.status         := 'pendente';
    new.aprovado_por   := null;
    new.aprovado_em    := null;
    new.motivo_recusa  := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_he_antes_update on public.horas_extras;
create trigger trg_he_antes_update
  before update on public.horas_extras
  for each row execute function public.he_antes_update();

-- Aprovação / recusa: só o supervisor direto (ou admin), nunca a própria HE.
create or replace function public.decidir_he(p_id bigint, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_colab uuid;
begin
  select colaborador_id into v_colab from public.horas_extras where id = p_id;
  if v_colab is null then
    raise exception 'Lançamento não encontrado';
  end if;
  if v_colab = auth.uid() then
    raise exception 'Você não pode aprovar a própria hora extra';
  end if;
  if not (public.e_supervisor_de(v_colab) or public.meu_papel() = 'admin') then
    raise exception 'Sem permissão para aprovar este colaborador';
  end if;
  if not p_aprovar and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da recusa';
  end if;

  update public.horas_extras set
    status        = case when p_aprovar then 'aprovado' else 'recusado' end,
    aprovado_por  = auth.uid(),
    aprovado_em   = now(),
    motivo_recusa = case when p_aprovar then null else trim(p_motivo) end
  where id = p_id;
end $$;

revoke all on function public.decidir_he(bigint, boolean, text) from public, anon;
grant execute on function public.decidir_he(bigint, boolean, text) to authenticated;

-- ---------- SEGURANÇA (RLS) ----------
alter table public.colaboradores enable row level security;
alter table public.horas_extras  enable row level security;

-- colaboradores
drop policy if exists colab_select on public.colaboradores;
create policy colab_select on public.colaboradores for select to authenticated using (
  id = auth.uid()
  or supervisor_id = auth.uid()
  or papel in ('supervisor','admin')          -- para escolher o supervisor no cadastro
  or public.meu_papel() = 'admin'
);

drop policy if exists colab_insert on public.colaboradores;
create policy colab_insert on public.colaboradores for insert to authenticated with check (
  id = auth.uid() and papel = 'colaborador'
);

drop policy if exists colab_update on public.colaboradores;
create policy colab_update on public.colaboradores for update to authenticated
  using (id = auth.uid() or public.meu_papel() = 'admin')
  with check (id = auth.uid() or public.meu_papel() = 'admin');

-- horas_extras
drop policy if exists he_select on public.horas_extras;
create policy he_select on public.horas_extras for select to authenticated using (
  colaborador_id = auth.uid()
  or public.e_supervisor_de(colaborador_id)
  or public.meu_papel() = 'admin'
);

drop policy if exists he_insert on public.horas_extras;
create policy he_insert on public.horas_extras for insert to authenticated with check (
  colaborador_id = auth.uid()
  and status = 'pendente'
  and aprovado_por is null
);

drop policy if exists he_update on public.horas_extras;
create policy he_update on public.horas_extras for update to authenticated
  using (colaborador_id = auth.uid() and status <> 'aprovado')
  with check (colaborador_id = auth.uid());

drop policy if exists he_delete on public.horas_extras;
create policy he_delete on public.horas_extras for delete to authenticated using (
  colaborador_id = auth.uid() and status <> 'aprovado'
);

-- =====================================================================
--  DEPOIS QUE VOCÊ CRIAR SUA CONTA NO SITE, rode isto para virar admin:
--    update public.colaboradores set papel = 'admin' where cs = 'cs338104';
-- =====================================================================
