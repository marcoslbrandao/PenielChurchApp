import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Modal, View, Text, TouchableOpacity, Pressable, TextInput, ActivityIndicator, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useShareIntent } from 'expo-share-intent';
import { useAuth } from '../lib/useAuth';
import { useAcesso } from '../lib/acesso';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { formatarTamanho, type Compartilhado } from '../lib/chatGeral';
import { enviarCompartilhado } from '../lib/chatAnexos';
import { primeiroLinkDeImagem } from '../lib/links';
import { baixarImagemDoLink } from '../lib/imagemDoLink';
import ChatGeralModal from './ChatGeralModal';
import { useFolgaDoTeclado } from '../lib/folgaDoTeclado';

// ─── "Compartilhar → Peniel" (13/10/2026; destino escolhido desde 14/10) ─────
// No app da RTM (ou em Arquivos, Fotos, Safari, WhatsApp...), o membro toca em
// Compartilhar, escolhe "Peniel" e o app pergunta PARA ONDE vai: Chat da
// Igreja, o chat de um dos grupos dele ou o da Banda.
//   • Chat da Igreja → abre o chat com o arquivo "pronto para enviar".
//   • Grupo / Banda → uma folha com a prévia e a legenda; o envio é direto
//     (lib/chatAnexos.ts › enviarCompartilhado), sem abrir a tela do grupo.
// Só aparecem os destinos que a pessoa pode usar: grupos em que participa ou
// lidera (admin vê todos) e a Banda para quem tem acesso a ela.
//
// Por baixo é o `expo-share-intent` (NATIVO, binário 1.5.0+): o App.tsx só
// carrega este arquivo quando o módulo existe no binário.

type Destino = { id: string; nome: string; icone: keyof typeof Ionicons.glyphMap; cor: string };

const GRUPOS_DO_CHAT: { id: string; chave: string; padrao: string; icone: keyof typeof Ionicons.glyphMap; cor: string }[] = [
  { id: 'mulheres', chave: 'grupos.mulheresNome', padrao: 'Grupo de Mulheres', icone: 'flower-outline', cor: '#C2185B' },
  { id: 'homens', chave: 'grupos.homensNome', padrao: 'Grupo de Homens', icone: 'shield-outline', cor: '#1565C0' },
  { id: 'jovens', chave: 'grupos.jovensNome', padrao: 'Peniel Alive', icone: 'flash-outline', cor: '#4A1AA8' },
  { id: 'estudo_biblico', chave: 'grupos.estudoBiblicoNome', padrao: 'Estudo Bíblico', icone: 'book-outline', cor: '#2E7D32' },
  { id: 'infantil', chave: 'compartilhar.infantil', padrao: 'Ministério Infantil', icone: 'happy-outline', cor: '#EF6C00' },
];

const COR_IGREJA = '#6A55E0';

export default function RecebeCompartilhamento({ irParaLogin }: { irParaLogin: () => void }) {
  const { t } = useTranslation();
  const { hasShareIntent, shareIntent, resetShareIntent, error: erroShare } = useShareIntent({ resetOnBackground: true });
  const { user, loading: carregandoSessao } = useAuth();
  const { ehMembro, ehAdmin, carregando } = useAcesso();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const C = useMemo(() => (isDark
    ? { bg: '#1C1940', text: '#F1EFFA', muted: '#A69FD6', linha: '#332D5C', campo: '#241F4D' }
    : { bg: '#FFFFFF', text: '#1A1A2E', muted: '#8C8799', linha: '#E5E0D8', campo: '#F0EDE8' }), [isDark]);

  const [conteudo, setConteudo] = useState<Compartilhado | null>(null);
  const [destinos, setDestinos] = useState<Destino[] | null>(null);
  const [escolhido, setEscolhido] = useState<Destino | null>(null);
  const [legenda, setLegenda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [meuNome, setMeuNome] = useState('Membro');
  // Chat da Igreja: o conteúdo segue para o ChatGeralModal.
  const [chatIgrejaAberto, setChatIgrejaAberto] = useState(false);
  const [paraChatIgreja, setParaChatIgreja] = useState<Compartilhado | null>(null);
  // Baixando a imagem de um link compartilhado (ex.: app da RTM).
  const [baixandoImagem, setBaixandoImagem] = useState(false);

  // ─── Compartilhamento que chega VAZIO (14/10/2026) ──────────────────────────
  // A extensão do iPhone abre o app com "penielchurch://dataUrl=…#tipo" mesmo
  // quando não conseguiu copiar o arquivo (ex.: áudio da RTM). O módulo então
  // não entrega nada e antes o app abria em silêncio. Agora avisa, com o tipo
  // que a extensão tentou (#file, #media, #text, #weburl) para diagnóstico.
  const ultimoRecebido = useRef(0);
  // Campo de legenda da folha "Enviar para": no Android edge-to-edge o
  // teclado cobria o campo (lib/folgaDoTeclado.ts, 17/10/2026).
  const folhaRef = useRef<View>(null);
  useEffect(() => {
    const verificar = (url: string | null) => {
      if (!url || !url.includes('dataUrl=')) return;
      const chegou = Date.now();
      const tipo = url.split('#')[1] || '?';
      setTimeout(() => {
        if (ultimoRecebido.current >= chegou) return;
        Alert.alert(
          t('compartilhar.vazioTitulo', 'Não chegou nada'),
          `${t('compartilhar.vazioTexto', 'O Peniel abriu, mas o outro app não entregou o arquivo. Tente de novo ou envie pelo 📎 › Arquivo dentro do chat.')}\n\n(${tipo}${erroRef.current ? ` · ${erroRef.current}` : ''})`,
        );
      }, 4000);
    };
    Linking.getInitialURL().then(verificar).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => verificar(url));
    return () => sub.remove();
  }, []);
  const erroRef = useRef<string | null>(null);
  useEffect(() => { erroRef.current = erroShare ? String(erroShare) : null; }, [erroShare]);

  useEffect(() => {
    // Espera a sessão e o papel: no arranque a frio eles chegam depois.
    if (!hasShareIntent) return;
    ultimoRecebido.current = Date.now();
    // Este componente tem a própria instância do useAuth: espera ela também,
    // senão o "user" ainda vazio daqui pedia login a quem já está logado.
    if (carregando || carregandoSessao) return;

    const f = shareIntent.files?.[0];
    const novo: Compartilhado = f
      ? {
          arquivo: {
            uri: f.path,
            nome: f.fileName || 'arquivo',
            mime: f.mimeType || null,
            tamanho: f.size ?? null,
            largura: f.width ?? null,
            altura: f.height ?? null,
            duracaoMs: f.duration ?? null,
          },
        }
      : { texto: (shareIntent.text || shareIntent.webUrl || '').trim() || null };
    // Limpa o pedido no módulo nativo (o arquivo continua no cache do app).
    resetShareIntent();

    if (!novo.arquivo && !novo.texto) return;
    if (!user) {
      Alert.alert(t('chatGeral.compartilharTitulo'), t('chatGeral.compartilharEntrar'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('chatGeral.entrar'), onPress: irParaLogin },
      ]);
      return;
    }
    if (!ehMembro) {
      Alert.alert(t('chatGeral.compartilharTitulo'), t('chatGeral.compartilharSoMembros'));
      return;
    }
    const uid = user.id;

    // Só um link, e ele é de uma imagem (o app da RTM manda assim): baixa a
    // imagem e segue como foto; o resto do texto vira a legenda. Se não der
    // para baixar, continua como link de texto, igual a antes.
    const img = !novo.arquivo && novo.texto ? primeiroLinkDeImagem(novo.texto) : null;
    if (img) {
      setBaixandoImagem(true);
      baixarImagemDoLink(img.url).then(arquivo => {
        setBaixandoImagem(false);
        abrirDestinos(uid, arquivo ? { arquivo, texto: img.resto || null } : novo);
      });
      return;
    }
    abrirDestinos(uid, novo);
  }, [hasShareIntent, carregando, carregandoSessao, user, ehMembro]);

  const abrirDestinos = (uid: string, novo: Compartilhado) => {
    setConteudo(novo);
    setEscolhido(null);
    setLegenda('');
    carregarDestinos(uid, novo);
  };

  const carregarDestinos = async (uid: string, novo: Compartilhado) => {
    setDestinos(null);
    const [{ data: perfil }, { data: liderados }, { data: grupos }] = await Promise.all([
      supabase.from('profiles').select('role, full_name, banda_acesso').eq('id', uid).single(),
      supabase.from('group_leaders').select('grupo').eq('profile_id', uid),
      supabase.rpc('meus_grupos'),
    ]);
    const admin = (perfil as any)?.role === 'admin' || ehAdmin;
    setMeuNome((perfil as any)?.full_name || 'Membro');
    const meus = new Set<string>([
      ...((grupos ?? []) as string[]),
      ...(((liderados ?? []) as { grupo: string }[]).map(l => l.grupo)),
    ]);
    const lista: Destino[] = [{ id: 'igreja', nome: t('chatGeral.titulo'), icone: 'chatbubbles', cor: COR_IGREJA }];
    for (const g of GRUPOS_DO_CHAT) {
      if (admin || meus.has(g.id)) lista.push({ id: g.id, nome: t(g.chave, g.padrao), icone: g.icone, cor: g.cor });
    }
    if (admin || (perfil as any)?.banda_acesso) {
      lista.push({ id: 'banda', nome: t('compartilhar.banda'), icone: 'musical-notes', cor: '#F2A93B' });
    }
    // Só o Chat da Igreja disponível: nem pergunta.
    if (lista.length === 1) { irParaChatIgreja(novo); return; }
    setDestinos(lista);
  };

  const fecharFolha = () => { setDestinos(null); setEscolhido(null); setConteudo(null); setLegenda(''); };

  const irParaChatIgreja = (c: Compartilhado | null) => {
    setParaChatIgreja(c);
    setChatIgrejaAberto(true);
    setDestinos(null);
    setEscolhido(null);
  };
  const escolher = (d: Destino) => {
    if (d.id === 'igreja') { irParaChatIgreja(conteudo); return; }
    // Link/texto vira a própria mensagem (ou a legenda da imagem baixada).
    setLegenda(conteudo?.texto ?? '');
    setEscolhido(d);
  };

  const enviar = async () => {
    if (!escolhido || !user || enviando) return;
    if (!conteudo?.arquivo && !legenda.trim()) return;
    setEnviando(true);
    try {
      const ehBanda = escolhido.id === 'banda';
      await enviarCompartilhado({
        t,
        prefixo: escolhido.id,
        autorId: user.id,
        arquivo: conteudo?.arquivo,
        texto: legenda,
        inserir: async (campos) => {
          const { error } = ehBanda
            ? await supabase.from('banda_chat_mensagens').insert({ autor_id: user.id, autor_nome: meuNome, ...campos })
            : await supabase.from('grupo_chat_mensagens').insert({ grupo: escolhido.id, autor_id: user.id, autor_nome: meuNome, ...campos });
          if (error) throw error;
        },
      });
      const nome = escolhido.nome;
      fecharFolha();
      Alert.alert(t('compartilhar.enviadoTitulo'), t('compartilhar.enviadoPara', { destino: nome }));
    } catch (e: any) {
      Alert.alert(t('chatGeral.erroEnviar'), e?.message ?? t('chatGeral.erroEnviarTexto'));
    } finally {
      setEnviando(false);
    }
  };

  const arq = conteudo?.arquivo;
  const iconeArquivo: keyof typeof Ionicons.glyphMap = !arq ? 'link'
    : (arq.mime ?? '').startsWith('image/') ? 'image'
    : (arq.mime ?? '').startsWith('video/') ? 'videocam'
    : (arq.mime ?? '').startsWith('audio/') ? 'musical-notes' : 'document-text';

  // Antes do return condicional: hook não pode ficar depois dele.
  const folgaTeclado = useFolgaDoTeclado(folhaRef, !!destinos);
  if (!user || !ehMembro) return null;

  return (
    <>
      <Modal visible={baixandoImagem} transparent animationType="fade">
        <View style={st.baixandoFundo}>
          <View style={[st.baixando, { backgroundColor: C.bg }]}>
            <ActivityIndicator color={COR_IGREJA} />
            <Text style={[st.nome, { color: C.text, flex: 0 }]}>{t('compartilhar.baixandoImagem', 'Preparando a imagem…')}</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!destinos} transparent animationType="slide" onRequestClose={fecharFolha}>
        <View ref={folhaRef} collapsable={false} style={{ flex: 1, paddingBottom: folgaTeclado }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={st.fundo} onPress={enviando ? undefined : fecharFolha}>
            <Pressable style={[st.folha, { backgroundColor: C.bg, paddingBottom: 16 + insets.bottom }]} onPress={() => {}}>
              {/* Prévia do que chegou */}
              <View style={[st.previa, { backgroundColor: C.campo }]}>
                <Ionicons name={iconeArquivo} size={22} color={COR_IGREJA} />
                <Text style={[st.previaTexto, { color: C.text }]} numberOfLines={2}>
                  {arq ? [arq.nome, formatarTamanho(arq.tamanho)].filter(Boolean).join(' · ') : conteudo?.texto}
                </Text>
              </View>

              {!escolhido ? (
                <>
                  <Text style={[st.titulo, { color: C.text }]}>{t('compartilhar.enviarPara')}</Text>
                  <ScrollView style={{ maxHeight: 380 }}>
                    {(destinos ?? []).map(d => (
                      <TouchableOpacity key={d.id} style={[st.linha, { borderBottomColor: C.linha }]} onPress={() => escolher(d)}>
                        <View style={[st.icone, { backgroundColor: d.cor }]}>
                          <Ionicons name={d.icone} size={18} color="#fff" />
                        </View>
                        <Text style={[st.nome, { color: C.text }]}>{d.nome}</Text>
                        <Ionicons name="chevron-forward" size={18} color={C.muted} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity onPress={fecharFolha} style={st.cancelar}>
                    <Text style={[st.cancelarTexto, { color: C.muted }]}>{t('common.cancelar')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={st.cabecalho}>
                    <TouchableOpacity onPress={() => setEscolhido(null)} disabled={enviando} hitSlop={10}>
                      <Ionicons name="chevron-back" size={22} color={C.text} />
                    </TouchableOpacity>
                    <View style={[st.icone, { backgroundColor: escolhido.cor }]}>
                      <Ionicons name={escolhido.icone} size={18} color="#fff" />
                    </View>
                    <Text style={[st.titulo, { color: C.text, marginBottom: 0, flex: 1 }]} numberOfLines={1}>{escolhido.nome}</Text>
                  </View>
                  <TextInput
                    style={[st.campo, { backgroundColor: C.campo, color: C.text }]}
                    placeholder={arq ? t('compartilhar.legenda') : t('chatGeral.placeholder')}
                    placeholderTextColor={C.muted}
                    value={legenda}
                    onChangeText={setLegenda}
                    multiline
                    maxLength={1000}
                    editable={!enviando}
                  />
                  <TouchableOpacity
                    style={[st.enviar, { backgroundColor: escolhido.cor, opacity: enviando || (!arq && !legenda.trim()) ? 0.6 : 1 }]}
                    onPress={enviar}
                    disabled={enviando || (!arq && !legenda.trim())}
                  >
                    {enviando
                      ? <ActivityIndicator color="#fff" />
                      : <><Ionicons name="send" size={16} color="#fff" /><Text style={st.enviarTexto}>{t('compartilhar.enviar')}</Text></>}
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      <ChatGeralModal
        visible={chatIgrejaAberto}
        userId={user.id}
        ehAdmin={ehAdmin}
        onClose={() => { setChatIgrejaAberto(false); setParaChatIgreja(null); setConteudo(null); }}
        compartilhado={paraChatIgreja}
        onCompartilhadoUsado={() => setParaChatIgreja(null)}
      />
    </>
  );
}

const st = StyleSheet.create({
  baixandoFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  baixando: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingHorizontal: 16 },
  previa: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 14 },
  previaTexto: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  titulo: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icone: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nome: { flex: 1, fontSize: 15, fontWeight: '600' },
  cancelar: { alignItems: 'center', paddingVertical: 14 },
  cancelarTexto: { fontSize: 15, fontWeight: '600' },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  campo: { minHeight: 46, maxHeight: 120, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, marginBottom: 12 },
  enviar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 24 },
  enviarTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
