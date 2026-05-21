import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BirthdayMember } from '../lib/useBirthdays';

interface BirthdayBannerProps {
  birthdays: BirthdayMember[];
}

export default function BirthdayBanner({ birthdays }: BirthdayBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || birthdays.length === 0) return null;

  const openWhatsApp = (phone: string, name: string) => {
    const digits = phone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    const msg = encodeURIComponent(
      `🎂 Feliz aniversário, ${name}! Que Deus abençoe mais um ano da sua vida! 🙏✨`
    );
    Linking.openURL(`https://wa.me/${number}?text=${msg}`).catch(() => {});
  };

  return (
    <View style={s.container}>
      {/* Header do banner */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.emoji}>🎂</Text>
          <View>
            <Text style={s.title}>
              {birthdays.length === 1
                ? 'Aniversário Hoje!'
                : `${birthdays.length} Aniversários Hoje!`}
            </Text>
            <Text style={s.sub}>Não esqueça de parabenizar</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setDismissed(true)} style={s.closeBtn}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Lista de aniversariantes */}
      {birthdays.map((member, idx) => (
        <View
          key={member.id}
          style={[s.memberRow, idx < birthdays.length - 1 && s.memberRowBorder]}
        >
          {/* Avatar */}
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {member.nome[0]}{member.sobrenome?.[0] ?? ''}
            </Text>
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text style={s.memberName}>{member.nome} {member.sobrenome}</Text>
            <Text style={s.memberAge}>🎉 {member.idade} anos hoje!</Text>
          </View>

          {/* WhatsApp */}
          {!!member.telefone && (
            <TouchableOpacity
              style={s.waBtn}
              onPress={() => openWhatsApp(member.telefone, member.nome)}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
              <Text style={s.waBtnText}>Felicitar</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#1A1740',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,200,66,0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(245,200,66,0.12)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 28 },
  title: { fontSize: 15, fontWeight: '800', color: '#F5C842' },
  sub: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  memberRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(245,200,66,0.2)',
    borderWidth: 1, borderColor: 'rgba(245,200,66,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#F5C842' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  memberAge: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#25D366',
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20,
  },
  waBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
