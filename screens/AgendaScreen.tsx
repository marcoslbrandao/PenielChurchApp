import { View, Text, StyleSheet } from 'react-native';

export default function AgendaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Agenda</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1740',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 24,
    fontWeight: '500',
    color: '#ffffff',
  },
});