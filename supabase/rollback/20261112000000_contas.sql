-- Desfaz 20261112000000_contas.sql: apaga as contas, as sessões e o progresso salvo nelas.
drop function if exists public.fgm_criar_conta(text, text);
drop function if exists public.fgm_entrar(text, text);
drop function if exists public.fgm_sair(text);
drop function if exists public.fgm_carregar(text, bigint);
drop function if exists public.fgm_salvar(text, jsonb, bigint);
drop function if exists public.fgm_trocar_senha(text, text, text);
drop function if exists public.fgm_apagar_conta(text, text);
drop schema if exists fgm cascade;
notify pgrst, 'reload schema';
