import ExpoModulesCore
import UIKit

// Sensor de proximidade (iPhone). Com o monitoramento ligado o proprio iOS
// apaga a tela quando o celular encosta no rosto; aqui so avisamos o JS para
// trocar o som para o ouvido.
public class ProximidadeModule: Module {
  private var observador: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("Proximidade")
    Events("onMudou")

    AsyncFunction("ativar") { (ligar: Bool) -> Bool in
      let aparelho = UIDevice.current
      if ligar {
        aparelho.isProximityMonitoringEnabled = true
        if self.observador == nil {
          self.observador = NotificationCenter.default.addObserver(
            forName: UIDevice.proximityStateDidChangeNotification,
            object: nil,
            queue: .main
          ) { [weak self] _ in
            self?.sendEvent("onMudou", ["perto": UIDevice.current.proximityState])
          }
        }
        // Sem sensor (iPad, simulador) o iOS deixa em false.
        return aparelho.isProximityMonitoringEnabled
      }
      self.desligar()
      return false
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async { self.desligar() }
    }
  }

  private func desligar() {
    UIDevice.current.isProximityMonitoringEnabled = false
    if let o = observador {
      NotificationCenter.default.removeObserver(o)
      observador = nil
    }
  }
}
