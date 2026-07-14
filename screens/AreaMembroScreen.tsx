import React from 'react';
import { View, Text, StyleSheet, StatusBar, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import BandaScreen from './BandaScreen';
import MembrosScreen from './MembrosScreen';
import JovensScreen from './JovensScreen';
import AdminScreen from './AdminScreen';
import AuthScreen from './AuthScreen';
import GruposScreen from './GruposScreen';
import { useAuth } from '../lib/useAuth';

// ─── Componente de código de convite para visitantes ─────────────────────────
function InviteCodeInput({ userId, onSuccess }: { userId: string; onSuccess: () => void }) {
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleActivate = async () => {
    if (!code.trim()) { setError('Digite o código.'); return; }
    setLoading(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('use_invite_code', {
      p_code: code.trim().toUpperCase(),
    });
    setLoading(false);
    if (rpcError || !data?.success) {
      setError(data?.error ?? 'Código inválido ou expirado.');
    } else {
      onSuccess();
    }
  };

  return (
    <View style={{ width: '100%', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 12, borderWidth: 1, borderColor: error ? '#FF4D4D' : '#2A2A30', paddingHorizontal: 14, height: 52 }}>
        <Ionicons name="ticket-outline" size={18} color="#8A8A96" style={{ marginRight: 10 }} />
        <TextInput
          style={{ flex: 1, fontSize: 16, color: '#F1F1F3', letterSpacing: 2, fontWeight: '700' }}
          placeholder="PENIEL-2024-XX"
          placeholderTextColor="#4A4A55"
          value={code}
          onChangeText={v => { setCode(v.toUpperCase()); setError(''); }}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>
      {!!error && <Text style={{ fontSize: 12, color: '#FF4D4D' }}>{error}</Text>}
      <TouchableOpacity
        style={{ backgroundColor: '#7C4DFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}
        onPress={handleActivate} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <>
          <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Ativar acesso de membro</Text>
        </>}
      </TouchableOpacity>
      <Text style={{ fontSize: 12, color: '#4A4A55', textAlign: 'center', marginTop: 4 }}>
        💬 Peça o código ao seu pastor ou líder.
      </Text>
    </View>
  );
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#0D0F1A',
  surface: '#161822',
  border: '#252730',
  primary: '#7C4DFF',
  accent: '#F5C842',
  text: '#F1F1F3',
  textMuted: '#8A8A96',
};

// ─── Placeholder screens ──────────────────────────────────────────────────────

const ph = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  sub: { fontSize: 14, color: C.textMuted },
});
const Tab = createBottomTabNavigator();

export default function AreaMembroScreen() {
  const { isLoggedIn, loading, user } = useAuth();
  const [role, setRole] = React.useState<string | null>(null);
  const [loadingRole, setLoadingRole] = React.useState(false);

  // Busca o role do usuário no Supabase
  React.useEffect(() => {
    if (!user) return;
    setLoadingRole(true);
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setRole(data?.role ?? 'visitante');
        setLoadingRole(false);
      });
  }, [user]);

  // Carregando
  if (loading || loadingRole) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D0F1A', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="flame" size={40} color="#F5C842" />
      </View>
    );
  }

  // Não logado → tela de login
  if (!isLoggedIn) return <AuthScreen />;

  // Logado mas visitante → tela de código de convite
  if (role === 'visitante' || role === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0D0F1A' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(124,77,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Ionicons name="lock-closed-outline" size={36} color="#7C4DFF" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#F1F1F3', marginBottom: 10, textAlign: 'center' }}>
            Acesso Restrito
          </Text>
          <Text style={{ fontSize: 14, color: '#8A8A96', textAlign: 'center', lineHeight: 22, marginBottom: 30 }}>
            Você está logado como visitante. Para acessar a Área do Membro, insira o código de convite enviado pelo seu líder.
          </Text>
          <InviteCodeInput userId={user!.id} onSuccess={() => setRole('membro')} />
        </View>
      </SafeAreaView>
    );
  }

  // Membro, líder ou admin → área do membro
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.surface,
            borderTopColor: C.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: C.primary,
          tabBarInactiveTintColor: C.textMuted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="Grupos"
          component={GruposScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Banda"
          component={BandaScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="musical-notes-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Membros"
          component={MembrosScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Jovens"
          component={JovensScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="flame-outline" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}



