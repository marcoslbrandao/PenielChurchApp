// Serviço "singleton" que toca a tradução ao vivo (fila de áudio) fora do
// ciclo de vida de qualquer tela — assim o áudio continua tocando mesmo
// depois que o usuário fecha a tela "Tradução ao vivo" e vai pra outra aba
// (Bíblia, Oferta, etc.). Se essa lógica estivesse dentro do componente da
// tela (como estava antes), o React desmontaria o player/canal do Supabase
// junto com a tela e o áudio pararia.
//
// Bilíngue desde 14/09/2026: o translator-service manda os dois idiomas
// (inglês e espanhol) misturados no mesmo canal, cada trecho marcado com
// `idioma`. Esse serviço só enfileira/toca o trecho se `idioma` bater com
// `idiomaSelecionado` — o outro idioma é descartado na hora (não fica
// guardado esperando, senão ao trocar de idioma tocaria um trecho antigo,
// fora de sincronia com o que está sendo falado agora).
//
// Qualquer tela pode ler o estado atual (ouvindo / legendaAtual /
// idiomaSelecionado) e assinar mudanças com `assinar(callback)`. A
// `TraducaoAoVivoScreen` é quem chama `iniciar()`/`parar()`/
// `selecionarIdioma()` a partir dos botões — parar só acontece quando o
// usuário volta nessa tela e aperta "Stop", nunca automaticamente ao sair.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { supabase } from './supabase';

export type IdiomaTraducao = 'en' | 'es';

type ChunkTraduzido = {
  seq: number;
  idioma: IdiomaTraducao;
  texto: string;
  audio: string; // base64
  formato: 'mp3';
};

type Ouvinte = () => void;

class TraducaoAudioService {
  private player: AudioPlayer | null = null;
  private canalAudio: ReturnType<typeof supabase.channel> | null = null;
  private fila: ChunkTraduzido[] = [];
  private tocando = false;
  private ouvintes = new Set<Ouvinte>();

  ouvindo = false;
  legendaAtual = '';
  idiomaSelecionado: IdiomaTraducao = 'en';

  private garantirPlayer() {
    if (this.player) return this.player;

    const player = createAudioPlayer(null);
    player.addListener('playbackStatusUpdate', (status: any) => {
      if (status?.didJustFinish) {
        this.tocando = false;
        this.tocarProximoDaFila();
      }
    });
    this.player = player;
    return player;
  }

  private tocarProximoDaFila = () => {
    if (this.tocando) return;
    const proximo = this.fila.shift();
    if (!proximo || !this.player) return;

    this.tocando = true;
    this.legendaAtual = proximo.texto;
    this.notificar();

    try {
      const uri = `data:audio/${proximo.formato};base64,${proximo.audio}`;
      this.player.replace(uri);
      this.player.play();
    } catch (erro) {
      console.error('Erro ao tocar trecho traduzido:', erro);
      this.tocando = false;
      this.tocarProximoDaFila();
    }
  };

  async iniciar() {
    if (this.ouvindo) return;

    await setAudioModeAsync({ playsInSilentMode: true });
    this.garantirPlayer();
    this.fila = [];
    this.ouvindo = true;
    this.notificar();

    this.canalAudio = supabase
      .channel('traducao-audio')
      .on('broadcast', { event: 'chunk' }, ({ payload }) => {
        const chunk = payload as ChunkTraduzido;
        // Descarta na hora qualquer trecho que não seja do idioma
        // selecionado agora — ver comentário do topo do arquivo.
        if (chunk.idioma !== this.idiomaSelecionado) return;
        this.fila.push(chunk);
        this.tocarProximoDaFila();
      })
      .subscribe();
  }

  parar() {
    this.ouvindo = false;
    this.legendaAtual = '';
    this.fila = [];
    this.tocando = false;
    this.notificar();

    if (this.canalAudio) {
      supabase.removeChannel(this.canalAudio);
      this.canalAudio = null;
    }
    this.player?.pause();
  }

  // Troca o idioma ouvido. Pode ser chamado a qualquer momento (antes ou
  // durante a escuta) — se já estiver ouvindo, descarta a fila pendente e
  // qualquer trecho tocando agora do idioma antigo, pra retomar "ao vivo"
  // no novo idioma em vez de tocar um backlog fora de sincronia.
  selecionarIdioma(idioma: IdiomaTraducao) {
    if (idioma === this.idiomaSelecionado) return;
    this.idiomaSelecionado = idioma;
    this.fila = [];
    this.tocando = false;
    this.legendaAtual = '';
    this.player?.pause();
    this.notificar();
  }

  // Retorna uma função de "desinscrever" — chame no cleanup de um useEffect.
  assinar(ouvinte: Ouvinte) {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  }

  private notificar() {
    this.ouvintes.forEach((ouvinte) => ouvinte());
  }
}

// Uma instância só, criada na primeira vez que esse módulo é importado, e
// reaproveitada por toda a vida do app.
export const traducaoAudioService = new TraducaoAudioService();
