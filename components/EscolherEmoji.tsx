// components/EscolherEmoji.tsx
//
// "+" nas reações do Chat da Igreja (18/10/2026): abre a lista completa de
// emojis, separada por categorias, como no WhatsApp. Só JavaScript (sem
// biblioteca nativa), para chegar por atualização automática.

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const separar = (s: string) => Array.from(new Set(s.trim().split(/\s+/)));

const CATEGORIAS: { id: string; icone: keyof typeof Ionicons.glyphMap; emojis: string[] }[] = [
  { id: 'rostos', icone: 'happy-outline', emojis: separar(`
    😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🫡 🤐 🤨 😐 😑 😶
    😏 😒 🙄 😬 😮‍💨 😌 😔 😪 😴 😷 🤒 🤕 🤧 🥵 🥶 🥴 😵 🤯 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦
    😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 😈 👻 💀 🤡 🤠 🙈 🙉 🙊`) },
  { id: 'gestos', icone: 'hand-left-outline', emojis: separar(`
    👍 👎 👏 🙌 🫶 👐 🤲 🙏 🤝 ✌️ 🤞 🫰 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 ✍️ 🫵 👊 ✊ 🤛 🤜
    🙋 🙆 🙅 🤷 🤦 🙇 💁 🧎 🧍 🚶 🏃 💃 🕺 👨‍👩‍👧‍👦 👪 👶 👧 🧒 👦 👩 🧑 👨 👵 🧓 👴`) },
  { id: 'coracoes', icone: 'heart-outline', emojis: separar(`
    ❤️ 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💕 💞 💓 💗 💖 💘 💝 💟 ❣️ 💔 ❤️‍🔥 ❤️‍🩹 💌 💋 🫂 ✨ 🌟 ⭐ 💫 🔥 💯 ✅ ☑️ ❗ ❓
    ‼️ ⁉️ 💬 💭 🗯️ 🎉 🎊 🎈 🎁 🎂 🍰 🏆 🥇 🎖️`) },
  { id: 'fe', icone: 'book-outline', emojis: separar(`
    🙏 ✝️ ⛪ 🕊️ 📖 📜 🕯️ 👑 🛐 ☦️ 🙌 🎶 🎵 🎤 🎸 🎹 🥁 🎺 🎻 🪕 🌅 🌄 ☀️ 🌈 💧 🌊 🍞 🍷 🐑 🐟 🌿 🌾 ⚓ 🗝️
    🛡️ ⚔️ 🏔️ 🌍 🌎 🌏`) },
  { id: 'natureza', icone: 'leaf-outline', emojis: separar(`
    🌸 🌺 🌻 🌹 🌷 💐 🌼 🍀 🌱 🌳 🌲 🌴 🍁 🍂 ⛅ 🌤️ 🌧️ ⛈️ ❄️ ☃️ 🌙 ⭐ 🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸
    🐵 🐔 🐧 🐦 🦅 🦋 🐝 🐞 🐢 🐍 🐠 🐬 🐳 🦒 🐘`) },
  { id: 'comida', icone: 'fast-food-outline', emojis: separar(`
    🍎 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🥔 🍞 🥐 🧀 🥚 🍳 🥓 🥩 🍗 🍔 🍟 🍕 🌭 🥪 🌮 🍝
    🍜 🍲 🍛 🍣 🍱 🥗 🍿 🧁 🍩 🍪 🎂 🍫 🍬 🍭 ☕ 🍵 🧃 🥤 🧋 🍽️`) },
  { id: 'atividades', icone: 'football-outline', emojis: separar(`
    ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🏋️ 🚴 🏊 🧘 🎯 🎮 🎲 🧩 🎨 🎭 🎬 📷 📸 📱 💻 ⌚ 📞 📅 📆 ⏰ 🕐 📌 📍 ✏️ 📝 📚 🎓
    🏠 🏡 🏫 🏥 🚗 🚌 🚆 ✈️ 🚀 ⛵ 🧳 🗺️ 🎒 🛒 💡 🔔 📢 🔑 🔒`) },
];

export default function EscolherEmoji({ visivel, isDark, cor, onEscolher, onFechar }: {
  visivel: boolean;
  isDark: boolean;
  cor: string;
  onEscolher: (emoji: string) => void;
  onFechar: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [cat, setCat] = useState(CATEGORIAS[0].id);
  const lista = useMemo(() => CATEGORIAS.find(c => c.id === cat)!.emojis, [cat]);
  const colunas = Math.max(6, Math.floor((width - 24) / 46));
  const bg = isDark ? '#1C1940' : '#FFFFFF';
  const borda = isDark ? '#332D5C' : '#E5E0D8';
  const suave = isDark ? '#A69FD6' : '#8C8799';
  const texto = isDark ? '#F1EFFA' : '#1A1A2E';

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <Pressable style={st.fundo} onPress={onFechar}>
        <Pressable style={[st.folha, { backgroundColor: bg, paddingBottom: Math.max(insets.bottom, 10) }]} onPress={() => {}}>
          <View style={st.topo}>
            <Text style={[st.titulo, { color: texto }]}>{t('chatGeral.escolherEmoji')}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={10}>
              <Ionicons name="close" size={24} color={suave} />
            </TouchableOpacity>
          </View>
          <View style={[st.abas, { borderBottomColor: borda }]}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity key={c.id} onPress={() => setCat(c.id)} style={[st.aba, cat === c.id && { borderBottomColor: cor }]} hitSlop={4}>
                <Ionicons name={c.icone} size={20} color={cat === c.id ? cor : suave} />
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            key={`${cat}-${colunas}`}
            data={lista}
            numColumns={colunas}
            keyExtractor={(e, i) => `${e}-${i}`}
            style={{ height: 300 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => onEscolher(item)} style={st.celula}>
                <Text style={st.emoji}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 8 },
  titulo: { fontSize: 16, fontWeight: '800' },
  abas: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  aba: { paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  celula: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
});
