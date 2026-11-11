// Ponte JS do modulo nativo. `requireOptionalNativeModule` devolve null num
// binario antigo (antes da 1.5.3): o JS que chega por OTA nao quebra la.
import { requireOptionalNativeModule } from 'expo-modules-core';

type Assinatura = { remove(): void };
type ModuloProximidade = {
  ativar(ligar: boolean): Promise<boolean>;
  addListener(evento: 'onMudou', f: (e: { perto: boolean }) => void): Assinatura;
};

export default requireOptionalNativeModule<ModuloProximidade>('Proximidade');
