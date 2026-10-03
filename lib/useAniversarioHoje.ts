import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAcesso } from './acesso';
import { useAuth } from './useAuth';
import { useBirthdays, BirthdayMember } from './useBirthdays';

// Aniversários de hoje para a Home.
//
// • Membro (e admin): a lista vem da RPC `aniversariantes_de_hoje`, que
//   respeita a privacidade da tabela `members` e já traz a mensagem da igreja
//   (`textos_app.aniversario_membro`, editável em Admin › Textos). Visitante
//   não entra nessa lista. O admin ganha, por cima, telefone e idade (para o
//   botão Felicitar), que só ele pode ler.
// • Visitante: `meu_aniversario_hoje` devolve a mensagem só para ele, no dia
//   do aniversário dele (`textos_app.aniversario_visitante`).
export type AniversarianteHoje = BirthdayMember & { mensagem?: string };

export function useAniversarioHoje() {
  const { isLoggedIn } = useAuth();
  const { ehMembro, ehAdmin, carregando } = useAcesso();
  const { todayBirthdays } = useBirthdays();
  const [lista, setLista] = useState<AniversarianteHoje[]>([]);
  const [mensagemIgreja, setMensagemIgreja] = useState<string | null>(null);
  const [meuParabens, setMeuParabens] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (carregando) return;
    if (!isLoggedIn) { setLista([]); setMeuParabens(null); return; }
    if (ehMembro) {
      const { data } = await supabase.rpc('aniversariantes_de_hoje');
      const linhas = (data as { id: string; nome: string; sobrenome: string; mensagem: string }[] | null) ?? [];
      setLista(linhas.map(l => ({
        id: l.id, nome: l.nome, sobrenome: l.sobrenome,
        data_nascimento: '', telefone: '', idade: 0,
      })));
      const nomes = linhas.map(l => l.nome);
      const juntos = nomes.length <= 2 ? nomes.join(' e ') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
      const modelo = linhas[0]?.mensagem ?? '';
      setMensagemIgreja(modelo && nomes.length ? modelo.split('{nome}').join(juntos) : null);
      setMeuParabens(null);
    } else {
      setLista([]);
      setMensagemIgreja(null);
      const { data } = await supabase.rpc('meu_aniversario_hoje');
      const linha = (data as { nome: string; mensagem: string }[] | null)?.[0];
      setMeuParabens(linha?.mensagem || null);
    }
  }, [isLoggedIn, ehMembro, carregando]);

  useEffect(() => { carregar(); }, [carregar]);

  // Admin: completa com telefone e idade.
  const aniversariantes: AniversarianteHoje[] = ehAdmin
    ? lista.map(l => {
        const completo = todayBirthdays.find(b => b.id === l.id);
        return completo ? { ...completo } : l;
      })
    : lista;

  return { aniversariantes, mensagemIgreja, meuParabens, recarregar: carregar };
}
