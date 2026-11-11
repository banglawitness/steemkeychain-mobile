package expo.modules.navigationmode

import android.content.Context
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

class NavigationModeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NavigationMode")

    Function("getNavigationMode") {
      val context = appContext.reactContext ?: return@Function -1
      Settings.Secure.getInt(context.contentResolver, "navigation_mode", -1)
    }

    Function("getNavigationBarHeight") {
      val context = appContext.reactContext ?: return@Function 0
      navigationBarHeightDp(context)
    }
  }
}

private fun navigationBarHeightDp(context: Context): Int {
  val id = context.resources.getIdentifier("navigation_bar_height", "dimen", "android")
  if (id == 0) return 48
  val pixels = context.resources.getDimensionPixelSize(id)
  val density = context.resources.displayMetrics.density
  if (density <= 0f || pixels <= 0) return 48
  return (pixels / density).roundToInt().coerceAtLeast(1)
}
