// lib/frequencia.ts
//
// A conta do relatório de frequência de um grupo, separada da tela porque é a
// parte que pode estar errada em silêncio: um denominador trocado não quebra
// nada, só produz um número plausível e falso. Aqui ela não importa nada do
// React Native, então roda em node e é testável de verdade.

export type StatusPresenca = 'presente' | 'justificado' | 'ausente';

/** Uma aula que JÁ TEVE CHAMADA. Encontro sem chamada não entra na conta. */
export type AulaFreq = { id: string; data: string; titulo: string };

export type LinhaPresenca = {
  evento_id: string;
  membro_id: string;
  nome: string;
  sobrenome: string;
  status: StatusPresenca;
};

export type PessoaTurma = { membro_id: string; nome: string };

export type PessoaFrequencia = {
  membro_id: string;
  nome: string;
  presentes: number;
  justificados: number;
  ausentes: number;
  /** Aulas em que a pessoa estava na turma — o denominador DELA. */
  consideradas: number;
  porStatus: Record<string, StatusPresenca>;
  /** Faltas (`ausente`) seguidas contando da aula mais recente para trás. */
  faltasSeguidas: number;
  naTurma: boolean;
};

/**
 * Monta a lista de pessoas do relatório.
 *
 * DUAS REGRAS QUE O NÚMERO DEPENDE, E QUE NÃO SÃO ÓBVIAS:
 *
 * 1. O denominador é POR PESSOA, não a quantidade de aulas do período. A
 *    chamada grava uma linha para cada participante daquele dia, então "ter
 *    linha na aula" é exatamente "estava na turma naquele dia". Sem isso, quem
 *    entrou na semana 10 aparece com 0% e quem saiu na 3ª aparece com 20% —
 *    dois números errados, e os dois puxam a média da turma para baixo.
 *
 * 2. Faltas seguidas contam só `ausente`, de trás para frente, e param na
 *    primeira aula sem registro. Quem justificou avisou que não vinha; o
 *    alerta existe para quem sumiu sem dizer nada.
 */
export function montarFrequencia(
  turma: PessoaTurma[],
  linhas: LinhaPresenca[],
  aulas: AulaFreq[],
): { pessoas: PessoaFrequencia[]; mediaTurma: number } {
  const porMembro = new Map<string, PessoaFrequencia>();
  const nova = (membro_id: string, nome: string, naTurma: boolean): PessoaFrequencia => ({
    membro_id, nome, presentes: 0, justificados: 0, ausentes: 0,
    consideradas: 0, porStatus: {}, faltasSeguidas: 0, naTurma,
  });

  // Quem está na turma hoje entra mesmo com zero registro: alguém adicionado
  // no meio do semestre precisa ser visto, nem que seja com um traço.
  turma.forEach(p => porMembro.set(p.membro_id, nova(p.membro_id, p.nome, true)));

  // Quem saiu do grupo no meio do caminho continua no relatório do período —
  // as aulas em que ele esteve aconteceram de verdade.
  linhas.forEach(l => {
    if (!porMembro.has(l.membro_id)) {
      porMembro.set(l.membro_id, nova(l.membro_id, `${l.nome} ${l.sobrenome}`.trim(), false));
    }
    porMembro.get(l.membro_id)!.porStatus[l.evento_id] = l.status;
  });

  const idsAula = aulas.map(a => a.id);

  porMembro.forEach(p => {
    idsAula.forEach(id => {
      const st = p.porStatus[id];
      if (!st) return;                 // não estava na turma naquele dia
      p.consideradas += 1;
      if (st === 'presente') p.presentes += 1;
      else if (st === 'justificado') p.justificados += 1;
      else p.ausentes += 1;
    });

    let seguidas = 0;
    for (let i = idsAula.length - 1; i >= 0; i--) {
      if (p.porStatus[idsAula[i]] === 'ausente') seguidas += 1;
      else break;
    }
    p.faltasSeguidas = seguidas;
  });

  // Menor frequência primeiro: o relatório existe para achar quem está
  // sumindo, e essa pessoa não pode ficar no fim de uma lista alfabética.
  // Quem não tem nenhuma aula considerada vai para o FIM — "0 de 0" é
  // ausência de dado, não frequência ruim, e no topo roubaria a atenção.
  const pessoas = [...porMembro.values()].sort((a, b) => {
    if (a.consideradas === 0 || b.consideradas === 0) {
      if (a.consideradas === b.consideradas) return a.nome.localeCompare(b.nome);
      return a.consideradas === 0 ? 1 : -1;
    }
    return (a.presentes / a.consideradas) - (b.presentes / b.consideradas)
      || a.nome.localeCompare(b.nome);
  });

  const contam = pessoas.filter(p => p.consideradas > 0);
  const mediaTurma = contam.length === 0 ? 0 : Math.round(
    (contam.reduce((acc, p) => acc + p.presentes / p.consideradas, 0) / contam.length) * 100,
  );

  return { pessoas, mediaTurma };
}

/** Frequência da pessoa em %, ou null quando ela não tem aula considerada. */
export function percentual(p: PessoaFrequencia): number | null {
  return p.consideradas === 0 ? null : Math.round((p.presentes / p.consideradas) * 100);
}
