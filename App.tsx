import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from './screens/HomeScreen';
import BibleScreen from './screens/BibleScreen';
import AgendaScreen from './screens/AgendaScreen';
import OfertaScreen from './screens/OfertaScreen';
import PerfilScreen from './screens/PerfilScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1A1740',
            borderTopColor: 'rgba(255,255,255,0.08)',
          },
          tabBarActiveTintColor: '#F5C842',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.35)',
        }}
      >
        <Tab.Screen
          name="Início"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Bíblia"
          component={BibleScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Agenda"
          component={AgendaScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Oferta"
          component={OfertaScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="heart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Perfil"
          component={PerfilScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}