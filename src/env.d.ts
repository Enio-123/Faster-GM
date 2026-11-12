/** Identificador do build, definido no vite.config.ts. */
declare const __BUILD__: string

interface ImportMetaEnv {
  /** Endereço do projeto Supabase das contas (https://<ref>.supabase.co). */
  readonly VITE_CONTA_URL?: string
  /** Chave publicável do projeto (pública por natureza; o banco só expõe as funções fgm_*). */
  readonly VITE_CONTA_KEY?: string
}
