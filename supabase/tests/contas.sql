-- Testes das contas do Faster GM. Rodar num banco de teste já com a migração:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/contas.sql
-- Cada falha para o script com a mensagem do assert. Apaga o que cria.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;
delete from fgm.contas where usuario like 'teste%';
delete from fgm.falhas_login where usuario like 'teste%';

-- 1) anon não enxerga as tabelas nem as funções internas.
set role anon;
do $$
begin
  begin
    perform 1 from fgm.contas;
    raise exception 'anon leu fgm.contas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform fgm.nova_sessao(gen_random_uuid());
    raise exception 'anon chamou fgm.nova_sessao';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 2) Criar conta, regras de nome e senha, nome repetido.
set role anon;
do $$
declare r jsonb;
begin
  r := public.fgm_criar_conta('  TesteEnio ', '123456');
  assert (r->>'ok')::boolean, 'criar: ' || r::text;
  assert r->>'usuario' = 'testeenio', 'nome em minúsculas: ' || r::text;
  assert r->>'token' ~ '^[0-9a-f]{64}$', 'token: ' || r::text;
  assert public.fgm_criar_conta('testeenio', 'outrasenha')->>'erro' = 'usuario_em_uso';
  assert public.fgm_criar_conta('TESTEENIO', 'outrasenha')->>'erro' = 'usuario_em_uso';
  assert public.fgm_criar_conta('te', '123456')->>'erro' = 'usuario_invalido';
  assert public.fgm_criar_conta('teste com espaco', '123456')->>'erro' = 'usuario_invalido';
  assert public.fgm_criar_conta('_teste', '123456')->>'erro' = 'usuario_invalido';
  assert public.fgm_criar_conta(repeat('a', 21), '123456')->>'erro' = 'usuario_invalido';
  assert public.fgm_criar_conta(null, '123456')->>'erro' = 'usuario_invalido';
  assert public.fgm_criar_conta('teste2', '12345')->>'erro' = 'senha_invalida';
  assert public.fgm_criar_conta('teste2', null)->>'erro' = 'senha_invalida';
  assert public.fgm_criar_conta('teste2', repeat('x', 73))->>'erro' = 'senha_invalida';
end $$;
reset role;
do $$ begin
  assert (select senha_hash from fgm.contas where usuario = 'testeenio') like '$2a$10$%', 'senha guardada em bcrypt';
  assert (select count(*) from fgm.sessoes s join fgm.contas c on c.id = s.conta_id where c.usuario = 'testeenio') = 1;
end $$;

-- 3) Entrar: senha certa, senha errada, nome que não existe, trava depois de 10 erros.
set role anon;
do $$
declare r jsonb; i int;
begin
  r := public.fgm_entrar('TesteEnio', '123456');
  assert (r->>'ok')::boolean and r->>'usuario' = 'testeenio', 'entrar: ' || r::text;
  assert public.fgm_entrar('testeenio', '1234567')->>'erro' = 'senha_errada';
  assert public.fgm_entrar('testeninguem', '123456')->>'erro' = 'senha_errada';
  assert public.fgm_entrar('nome invalido!', '123456')->>'erro' = 'senha_errada';
  assert public.fgm_entrar('testeenio', null)->>'erro' = 'senha_errada';
  for i in 1..8 loop
    assert public.fgm_entrar('testeenio', 'errada')->>'erro' = 'senha_errada';
  end loop;
  -- 10 erros (1 + null + 8): agora nem a senha certa entra.
  r := public.fgm_entrar('testeenio', '123456');
  assert r->>'erro' = 'muitas_tentativas', 'trava: ' || r::text;
end $$;
reset role;
do $$ begin
  assert (select count(*) from fgm.falhas_login where usuario = 'nome invalido!') = 0, 'nome impossível não grava falha';
end $$;
-- Passados 15 minutos, destrava.
update fgm.falhas_login set em = em - interval '16 minutes' where usuario = 'testeenio';
set role anon;
do $$ begin
  assert (public.fgm_entrar('testeenio', '123456')->>'ok')::boolean, 'destrava depois de 15 min';
end $$;
reset role;

-- 4) Salvar e carregar com versão; uma conta não vê a outra.
create temp table t (k text primary key, v text);
grant all on t to anon;
set role anon;
do $$
declare a text; b text; r jsonb;
begin
  a := public.fgm_entrar('testeenio', '123456')->>'token';
  insert into t values ('a', a);
  r := public.fgm_carregar(a);
  assert (r->>'ok')::boolean and (r->>'versao')::int = 0 and r->'dados' = 'null'::jsonb, 'conta nova sem progresso: ' || r::text;
  r := public.fgm_salvar(a, '{"x": 1}', 0);
  assert (r->>'ok')::boolean and (r->>'versao')::int = 1, 'primeira versão: ' || r::text;
  -- Outro aparelho salvando em cima da versão 0: conflito, recebe a versão 1 para juntar.
  r := public.fgm_salvar(a, '{"x": 2}', 0);
  assert r->>'erro' = 'conflito' and (r->>'versao')::int = 1 and r->'dados' = '{"x": 1}'::jsonb, 'conflito: ' || r::text;
  r := public.fgm_salvar(a, '{"x": 3}', 1);
  assert (r->>'ok')::boolean and (r->>'versao')::int = 2, 'segunda versão: ' || r::text;
  r := public.fgm_carregar(a, 2);
  assert (r->>'versao')::int = 2 and r->'dados' = 'null'::jsonb, 'nada novo desde a versão 2: ' || r::text;
  r := public.fgm_carregar(a, 1);
  assert r->'dados' = '{"x": 3}'::jsonb and r->>'usuario' = 'testeenio', 'carrega o mais novo: ' || r::text;
  assert public.fgm_salvar(a, '[1, 2]', 2)->>'erro' = 'dados_invalidos';
  assert public.fgm_salvar(a, null, 2)->>'erro' = 'dados_invalidos';
  assert public.fgm_salvar(a, jsonb_build_object('g', repeat('x', 3000001)), 2)->>'erro' = 'grande_demais';
  assert public.fgm_salvar(repeat('0', 64), '{}', 0)->>'erro' = 'sessao';
  assert public.fgm_salvar('nao-e-token', '{}', 0)->>'erro' = 'sessao';
  assert public.fgm_carregar(null)->>'erro' = 'sessao';
  -- Outra conta começa vazia e não alcança a primeira.
  b := public.fgm_criar_conta('testeoutro', 'senha-boa')->>'token';
  insert into t values ('b', b);
  r := public.fgm_carregar(b);
  assert (r->>'versao')::int = 0 and r->'dados' = 'null'::jsonb and r->>'usuario' = 'testeoutro', 'outra conta: ' || r::text;
  r := public.fgm_salvar(b, '{"y": 1}', 0);
  assert (r->>'ok')::boolean, 'outra conta salva: ' || r::text;
  assert public.fgm_carregar(a, 0)->'dados' = '{"x": 3}'::jsonb, 'a primeira conta não mudou';
end $$;
reset role;

-- 5) Sessão parada há mais de um ano expira; usar a sessão renova a data (no máximo 1 vez por dia).
update fgm.sessoes set usada_em = now() - interval '2 days'
 where token_hash = extensions.digest((select v from t where k = 'b'), 'sha256');
set role anon;
do $$ begin
  assert (public.fgm_carregar((select v from t where k = 'b'))->>'ok')::boolean;
end $$;
reset role;
do $$ begin
  assert (select usada_em > now() - interval '1 minute' from fgm.sessoes
           where token_hash = extensions.digest((select v from t where k = 'b'), 'sha256')), 'renovou';
end $$;
update fgm.sessoes set usada_em = now() - interval '366 days'
 where token_hash = extensions.digest((select v from t where k = 'b'), 'sha256');
set role anon;
do $$ begin
  assert public.fgm_carregar((select v from t where k = 'b'))->>'erro' = 'sessao', 'expirou';
end $$;
reset role;

-- 6) No máximo 20 aparelhos por conta.
set role anon;
\o /dev/null
select public.fgm_entrar('testeoutro', 'senha-boa') from generate_series(1, 3);
\o
reset role;
update fgm.sessoes s set usada_em = now() - interval '1 hour' from fgm.contas c where c.id = s.conta_id and c.usuario = 'testeoutro';
set role anon;
\o /dev/null
select public.fgm_entrar('testeoutro', 'senha-boa') from generate_series(1, 25);
\o
reset role;
do $$ begin
  assert (select count(*) from fgm.sessoes s join fgm.contas c on c.id = s.conta_id where c.usuario = 'testeoutro') = 20, '20 aparelhos';
  assert not exists (select 1 from fgm.sessoes s join fgm.contas c on c.id = s.conta_id
                      where c.usuario = 'testeoutro' and s.usada_em < now() - interval '30 minutes'), 'saem as mais antigas';
end $$;

-- 7) Trocar a senha tira os outros aparelhos; sair encerra a sessão.
set role anon;
do $$
declare a text := (select v from t where k = 'a'); outro text; r jsonb;
begin
  outro := public.fgm_entrar('testeenio', '123456')->>'token';
  assert public.fgm_trocar_senha(a, 'errada', 'nova-senha')->>'erro' = 'senha_errada';
  assert public.fgm_trocar_senha(a, '123456', '123')->>'erro' = 'senha_invalida';
  r := public.fgm_trocar_senha(a, '123456', 'nova-senha');
  assert (r->>'ok')::boolean, 'trocar: ' || r::text;
  assert (public.fgm_carregar(a)->>'ok')::boolean, 'este aparelho continua';
  assert public.fgm_carregar(outro)->>'erro' = 'sessao', 'o outro aparelho saiu';
  assert public.fgm_entrar('testeenio', '123456')->>'erro' = 'senha_errada', 'senha velha não entra';
  outro := public.fgm_entrar('testeenio', 'nova-senha')->>'token';
  assert outro is not null, 'senha nova entra';
  assert (public.fgm_sair(outro)->>'ok')::boolean;
  assert public.fgm_carregar(outro)->>'erro' = 'sessao', 'sair encerra a sessão';
  assert (public.fgm_sair('qualquer coisa')->>'ok')::boolean;
end $$;
reset role;

-- 8) Apagar a conta leva junto as sessões e o progresso.
set role anon;
do $$
declare a text := (select v from t where k = 'a');
begin
  assert public.fgm_apagar_conta(a, 'errada')->>'erro' = 'senha_errada';
  assert (public.fgm_apagar_conta(a, 'nova-senha')->>'ok')::boolean;
  assert public.fgm_carregar(a)->>'erro' = 'sessao';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from fgm.contas where usuario = 'testeenio');
  assert not exists (select 1 from fgm.progresso p left join fgm.contas c on c.id = p.conta_id where c.id is null), 'sem progresso órfão';
  assert not exists (select 1 from fgm.sessoes s left join fgm.contas c on c.id = s.conta_id where c.id is null), 'sem sessão órfã';
end $$;

-- 9) No máximo 30 contas novas por hora.
set role anon;
do $$
declare parou int;
begin
  for i in 1..40 loop
    if public.fgm_criar_conta('testelote' || i, '123456')->>'erro' = 'muitas_contas' then
      parou := i;
      exit;
    end if;
  end loop;
  assert parou is not null, 'o limite parou a criação';
end $$;
reset role;
do $$ begin
  assert (select count(*) from fgm.contas where criada_em > now() - interval '1 hour') = 30, '30 por hora';
end $$;

delete from fgm.contas where usuario like 'teste%';
delete from fgm.falhas_login where usuario like 'teste%';
\echo 'contas: todos os testes passaram'
