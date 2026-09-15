import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './useAuth';

// ─── Papel do usuário no app ─────────────────────────────────────────────────
// O app é híbrido: qualquer pessoa cria conta e usa Início, Bíblia, Agenda,
// Mídia e Perfil. A Área do Membro (Grupos, Escalas, Banda, Diretório, Admin)
// é exclusiva de quem a igreja reconhece como membro.
//
// Antes, esse papel era buscado dentro da própria AreaMembroScreen — o que
// deixava a aba "Membros" visível pra todo mundo e obrigava o visitante a
// bater numa tela de "Acesso Restrito" pra descobrir que ela não era pra ele.
// Agora o papel vive num contexto único, acima da navegação, e é a navegação
// que decide se a aba existe. Visitante não vê porta trancada: não vê porta.
export type Papel = 'visitante' | 'membro' | 'lider' | 'admin';

type Acesso = {
  papel: Papel | null;
  /** membro, líder, admin — ou quem lidera algum grupo — quem enxerga a Área do Membro */
  ehMembro: boolean;
  /** administrador da igreja — quem enxerga as abas Admin e Membros */
  ehAdmin: boolean;
  /** true enquanto a sessão OU o papel ainda estão sendo carregados */
  carregando: boolean;
  /** relê o papel no Supabase (usar depois de ativar um código de convite) */
  recarregar: () => Promise<void>;
  /** atualiza o papel localmente sem ida ao servidor (resposta imediata da UI) */
  definirPapel: (papel: Papel) => void;
};

const AcessoContext = createContext<Acesso>({
  papel: null,
  ehMembro: false,
  ehAdmin: false,
  carregando: true,
  recarregar: async () => {},
  definirPapel: () => {},
});

export function AcessoProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [papel, setPapel] = useState<Papel | null>(null);
  const [carregandoPapel, setCarregandoPapel] = useState(false);
  const [lideraGrupo, setLideraGrupo] = useState(false);
  const userId = user?.id ?? null;

  const recarregar = useCallback(async () => {
    if (!userId) { setPapel(null); setLideraGrupo(false); return; }
    setCarregandoPapel(true);
    // Liderar um grupo entra na conta junto com o papel. Nomear alguém em
    // `group_leaders` não mexe no `role`, então a pessoa virava líder de um
    // grupo que ela não conseguia nem abrir — eram dois passos, e esquecer o
    // segundo falhava em silêncio, sem erro nenhum na tela.
    const [{ data }, { data: liderancas }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).single(),
      supabase.from('group_leaders').select('grupo').eq('profile_id', userId).limit(1),
    ]);
    setPapel((data?.role as Papel) ?? 'visitante');
    setLideraGrupo((liderancas ?? []).length > 0);
    setCarregandoPapel(false);
  }, [userId]);

  // Depende do ID, não do objeto `user`: o Supabase troca a instância a cada
  // refresh de token, e usar o objeto refazia essa consulta a cada hora.
  useEffect(() => { recarregar(); }, [recarregar]);

  const ehMembro = papel === 'membro' || papel === 'lider' || papel === 'admin' || lideraGrupo;
  const ehAdmin = papel === 'admin';

  return (
    <AcessoContext.Provider
      value={{
        papel,
        ehMembro,
        ehAdmin,
        carregando: loading || carregandoPapel,
        recarregar,
        definirPapel: setPapel,
      }}
    >
      {children}
    </AcessoContext.Provider>
  );
}

export function useAcesso() {
  return useContext(AcessoContext);
}
