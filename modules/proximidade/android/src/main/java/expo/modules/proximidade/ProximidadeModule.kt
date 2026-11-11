package expo.modules.proximidade

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Sensor de proximidade (Android). O wake lock PROXIMITY_SCREEN_OFF faz o
// proprio sistema apagar a tela enquanto o celular esta encostado no rosto;
// o listener avisa o JS para trocar o som para o ouvido.
class ProximidadeModule : Module() {
  private var ouvinte: SensorEventListener? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("Proximidade")
    Events("onMudou")

    AsyncFunction("ativar") { ligar: Boolean ->
      if (ligar) ligarSensor() else { desligarSensor(); false }
    }

    OnDestroy { desligarSensor() }
  }

  private fun ligarSensor(): Boolean {
    if (ouvinte != null) return true
    val ctx = appContext.reactContext ?: return false
    val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return false
    val sensor = sm.getDefaultSensor(Sensor.TYPE_PROXIMITY) ?: return false

    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (pm != null && pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
      wakeLock = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "peniel:proximidade").apply {
        setReferenceCounted(false)
        acquire(30 * 60 * 1000L)
      }
    }

    val l = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        val limite = minOf(e.sensor.maximumRange, 5f)
        sendEvent("onMudou", mapOf("perto" to (e.values[0] < limite)))
      }
      override fun onAccuracyChanged(s: Sensor?, precisao: Int) {}
    }
    sm.registerListener(l, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    ouvinte = l
    return true
  }

  private fun desligarSensor() {
    val ctx = appContext.reactContext
    ouvinte?.let { l ->
      (ctx?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.unregisterListener(l)
    }
    ouvinte = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }
}
