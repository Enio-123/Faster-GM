-- Faster GM: contas com nome de usuário e senha, e o progresso de cada conta.
--
-- Sem e-mail: a conta é um nome de usuário e uma senha (bcrypt, pgcrypto).
-- O app só fala com as funções public.fgm_* (security definer). As tabelas ficam no
-- esquema fgm, que a API não expõe; anon e authenticated não têm acesso a ele.
--
-- Sessão: o app recebe um código aleatório de 32 bytes; o banco guarda só o sha256.
-- Proteções: 10 senhas erradas em 15 minutos travam aquele usuário por 15 minutos;
-- no máximo 30 contas novas por hora no total; até 20 aparelhos por conta;
-- progresso de até 3 MB por conta; sessão parada há mais de um ano expira.
-- Salvar usa versão: quem salva em cima de uma versão velha recebe a versão atual
-- para juntar no aparelho e salvar de novo (nada some quando dois aparelhos salvam).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists fgm;
revoke all on schema fgm from public;

create table fgm.contas (
  id uuid primary key default gen_random_uuid(),
  usuario text not null unique check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,19}$'),
  senha_hash text not null,
  criada_em timestamptz not null default now(),
  senha_trocada_em timestamptz not null default now()
);

create table fgm.sessoes (
  token_hash bytea primary key,
  conta_id uuid not null references fgm.contas (id) on delete cascade,
  criada_em timestamptz not null default now(),
  usada_em timestamptz not null default now()
);
create index sessoes_conta_idx on fgm.sessoes (conta_id);

create table fgm.progresso (
  conta_id uuid primary key references fgm.contas (id) on delete cascade,
  versao bigint not null check (versao > 0),
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table fgm.falhas_login (
  id bigint generated always as identity primary key,
  usuario text not null,
  em timestamptz not null default now()
);
create index falhas_login_usuario_idx on fgm.falhas_login (usuario, em);

alter table fgm.contas enable row level security;
alter table fgm.sessoes enable row level security;
alter table fgm.progresso enable row level security;
alter table fgm.falhas_login enable row level security;
revoke all on all tables in schema fgm from public, anon, authenticated;
revoke all on all sequences in schema fgm from public, anon, authenticated;

-- ---------- Funções internas (não aparecem na API) ----------

create function fgm.conta_da_sessao(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hash bytea;
  v_conta uuid;
  v_usada timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  v_hash := extensions.digest(p_token, 'sha256');
  select s.conta_id, s.usada_em into v_conta, v_usada from fgm.sessoes s where s.token_hash = v_hash;
  if v_conta is null then
    return null;
  end if;
  if v_usada < now() - interval '365 days' then
    delete from fgm.sessoes s where s.token_hash = v_hash;
    return null;
  end if;
  if v_usada < now() - interval '1 day' then
    update fgm.sessoes s set usada_em = now() where s.token_hash = v_hash;
  end if;
  return v_conta;
end;
$$;

create function fgm.nova_sessao(p_conta uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into fgm.sessoes (token_hash, conta_id) values (extensions.digest(v_token, 'sha256'), p_conta);
  -- No máximo 20 aparelhos por conta: as sessões menos usadas saem.
  delete from fgm.sessoes s
   where s.conta_id = p_conta
     and s.token_hash not in (
       select s2.token_hash from fgm.sessoes s2
        where s2.conta_id = p_conta
        order by s2.usada_em desc, s2.criada_em desc
        limit 20);
  return v_token;
end;
$$;

create function fgm.senha_valida(p_senha text) returns boolean
language sql immutable set search_path = '' as $$
  select p_senha is not null and char_length(p_senha) >= 6 and octet_length(p_senha) <= 72
$$;

revoke all on function fgm.conta_da_sessao(text) from public;
revoke all on function fgm.nova_sessao(uuid) from public;
revoke all on function fgm.senha_valida(text) from public;

-- ---------- API do app ----------

create function public.fgm_criar_conta(p_usuario text, p_senha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario text := lower(btrim(coalesce(p_usuario, '')));
  v_conta uuid;
begin
  if char_length(v_usuario) > 20 or v_usuario !~ '^[a-z0-9][a-z0-9._-]{2,19}$' then
    return jsonb_build_object('ok', false, 'erro', 'usuario_invalido');
  end if;
  if not fgm.senha_valida(p_senha) then
    return jsonb_build_object('ok', false, 'erro', 'senha_invalida');
  end if;
  if (select count(*) from fgm.contas c where c.criada_em > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_contas');
  end if;
  insert into fgm.contas (usuario, senha_hash)
  values (v_usuario, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)))
  on conflict (usuario) do nothing
  returning id into v_conta;
  if v_conta is null then
    return jsonb_build_object('ok', false, 'erro', 'usuario_em_uso');
  end if;
  return jsonb_build_object('ok', true, 'usuario', v_usuario, 'token', fgm.nova_sessao(v_conta));
end;
$$;

create function public.fgm_entrar(p_usuario text, p_senha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario text := lower(btrim(coalesce(p_usuario, '')));
  v_conta fgm.contas%rowtype;
begin
  -- Nome que nem poderia existir: resposta igual à de senha errada, sem gravar nada.
  if char_length(v_usuario) > 20 or v_usuario !~ '^[a-z0-9][a-z0-9._-]{2,19}$' then
    return jsonb_build_object('ok', false, 'erro', 'senha_errada');
  end if;
  delete from fgm.falhas_login f where f.em < now() - interval '1 day';
  if (select count(*) from fgm.falhas_login f
       where f.usuario = v_usuario and f.em > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  select * into v_conta from fgm.contas c where c.usuario = v_usuario;
  if v_conta.id is null or p_senha is null or octet_length(p_senha) > 72
     or v_conta.senha_hash <> extensions.crypt(p_senha, v_conta.senha_hash) then
    insert into fgm.falhas_login (usuario) values (v_usuario);
    return jsonb_build_object('ok', false, 'erro', 'senha_errada');
  end if;
  return jsonb_build_object('ok', true, 'usuario', v_conta.usuario, 'token', fgm.nova_sessao(v_conta.id));
end;
$$;

create function public.fgm_sair(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_token ~ '^[0-9a-f]{64}$' then
    delete from fgm.sessoes s where s.token_hash = extensions.digest(p_token, 'sha256');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.fgm_carregar(p_token text, p_desde bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conta uuid := fgm.conta_da_sessao(p_token);
  v_usuario text;
  v_prog fgm.progresso%rowtype;
begin
  if v_conta is null then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;
  select c.usuario into v_usuario from fgm.contas c where c.id = v_conta;
  select * into v_prog from fgm.progresso p where p.conta_id = v_conta;
  return jsonb_build_object(
    'ok', true,
    'usuario', v_usuario,
    'versao', coalesce(v_prog.versao, 0),
    'atualizado_em', v_prog.atualizado_em,
    'dados', case when coalesce(v_prog.versao, 0) > coalesce(p_desde, 0) then v_prog.dados end);
end;
$$;

create function public.fgm_salvar(p_token text, p_dados jsonb, p_versao bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conta uuid := fgm.conta_da_sessao(p_token);
  v_atual fgm.progresso%rowtype;
begin
  if v_conta is null then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if octet_length(p_dados::text) > 3000000 then
    return jsonb_build_object('ok', false, 'erro', 'grande_demais');
  end if;
  select * into v_atual from fgm.progresso p where p.conta_id = v_conta for update;
  if v_atual.conta_id is null then
    if coalesce(p_versao, 0) <> 0 then
      return jsonb_build_object('ok', false, 'erro', 'conflito', 'versao', 0, 'dados', null);
    end if;
    insert into fgm.progresso (conta_id, versao, dados) values (v_conta, 1, p_dados)
    on conflict (conta_id) do nothing;
    if not found then
      -- Outro aparelho salvou a primeira versão ao mesmo tempo.
      select * into v_atual from fgm.progresso p where p.conta_id = v_conta;
      return jsonb_build_object('ok', false, 'erro', 'conflito', 'versao', v_atual.versao, 'dados', v_atual.dados);
    end if;
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;
  if p_versao is distinct from v_atual.versao then
    return jsonb_build_object('ok', false, 'erro', 'conflito', 'versao', v_atual.versao, 'dados', v_atual.dados);
  end if;
  update fgm.progresso p
     set versao = p.versao + 1, dados = p_dados, atualizado_em = now()
   where p.conta_id = v_conta;
  return jsonb_build_object('ok', true, 'versao', v_atual.versao + 1);
end;
$$;

create function public.fgm_trocar_senha(p_token text, p_senha_atual text, p_senha_nova text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conta uuid := fgm.conta_da_sessao(p_token);
  v_hash text;
begin
  if v_conta is null then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;
  if not fgm.senha_valida(p_senha_nova) then
    return jsonb_build_object('ok', false, 'erro', 'senha_invalida');
  end if;
  select c.senha_hash into v_hash from fgm.contas c where c.id = v_conta;
  if p_senha_atual is null or octet_length(p_senha_atual) > 72
     or v_hash <> extensions.crypt(p_senha_atual, v_hash) then
    return jsonb_build_object('ok', false, 'erro', 'senha_errada');
  end if;
  update fgm.contas c
     set senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)), senha_trocada_em = now()
   where c.id = v_conta;
  -- Os outros aparelhos saem da conta; este continua.
  delete from fgm.sessoes s
   where s.conta_id = v_conta and s.token_hash <> extensions.digest(p_token, 'sha256');
  return jsonb_build_object('ok', true);
end;
$$;

create function public.fgm_apagar_conta(p_token text, p_senha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conta uuid := fgm.conta_da_sessao(p_token);
  v_hash text;
begin
  if v_conta is null then
    return jsonb_build_object('ok', false, 'erro', 'sessao');
  end if;
  select c.senha_hash into v_hash from fgm.contas c where c.id = v_conta;
  if p_senha is null or octet_length(p_senha) > 72 or v_hash <> extensions.crypt(p_senha, v_hash) then
    return jsonb_build_object('ok', false, 'erro', 'senha_errada');
  end if;
  delete from fgm.contas c where c.id = v_conta;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fgm_criar_conta(text, text) from public;
revoke all on function public.fgm_entrar(text, text) from public;
revoke all on function public.fgm_sair(text) from public;
revoke all on function public.fgm_carregar(text, bigint) from public;
revoke all on function public.fgm_salvar(text, jsonb, bigint) from public;
revoke all on function public.fgm_trocar_senha(text, text, text) from public;
revoke all on function public.fgm_apagar_conta(text, text) from public;
grant execute on function public.fgm_criar_conta(text, text) to anon, authenticated;
grant execute on function public.fgm_entrar(text, text) to anon, authenticated;
grant execute on function public.fgm_sair(text) to anon, authenticated;
grant execute on function public.fgm_carregar(text, bigint) to anon, authenticated;
grant execute on function public.fgm_salvar(text, jsonb, bigint) to anon, authenticated;
grant execute on function public.fgm_trocar_senha(text, text, text) to anon, authenticated;
grant execute on function public.fgm_apagar_conta(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
