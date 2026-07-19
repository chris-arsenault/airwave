package io.ahara.airwave.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import io.ahara.airwave.R

class AirwaveWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        widgetIds.forEach { updateWidget(context, manager, it, "Loading…") }
        refreshAsync(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_CYCLE_DEVICE,
            ACTION_PLAY_PAUSE,
            ACTION_NEXT,
            ACTION_VOLUME_UP,
            ACTION_VOLUME_DOWN -> {
                val result = goAsync()
                Thread {
                    try {
                        handleAction(context, intent.action.orEmpty())
                    } catch (e: Exception) {
                        updateAll(context, "Error: ${e.message ?: "unknown"}")
                    } finally {
                        result.finish()
                    }
                }.start()
            }
        }
    }

    companion object {
        const val ACTION_CYCLE_DEVICE = "io.ahara.airwave.action.CYCLE_DEVICE"
        const val ACTION_PLAY_PAUSE = "io.ahara.airwave.action.PLAY_PAUSE"
        const val ACTION_NEXT = "io.ahara.airwave.action.NEXT"
        const val ACTION_VOLUME_UP = "io.ahara.airwave.action.VOLUME_UP"
        const val ACTION_VOLUME_DOWN = "io.ahara.airwave.action.VOLUME_DOWN"
        private const val VOLUME_STEP = 0.05

        fun refreshAsync(context: Context) {
            Thread {
                try {
                    refresh(context)
                } catch (e: Exception) {
                    updateAll(context, "Error: ${e.message ?: "unknown"}")
                }
            }.start()
        }

        fun updateAll(context: Context, status: String? = null) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, AirwaveWidgetProvider::class.java))
            ids.forEach { updateWidget(context, manager, it, status) }
        }

        private fun handleAction(context: Context, action: String) {
            val api = apiOrThrow(context)
            when (action) {
                ACTION_CYCLE_DEVICE -> cycleDevice(context, api)
                ACTION_PLAY_PAUSE -> {
                    val device = selectedDevice(context, api)
                    val state = api.playback(device.id)
                    if (state.playing) api.pause(device.id) else api.resume(device.id)
                    AirwavePrefs.setPlaying(context, !state.playing)
                    updateAll(context, if (state.playing) "Paused" else "Playing")
                }
                ACTION_NEXT -> {
                    val device = selectedDevice(context, api)
                    api.next(device.id)
                    updateAll(context, "Next track")
                }
                ACTION_VOLUME_UP -> adjustVolume(context, api, VOLUME_STEP)
                ACTION_VOLUME_DOWN -> adjustVolume(context, api, -VOLUME_STEP)
            }
            refresh(context)
        }

        private fun refresh(context: Context) {
            val api = apiOrThrow(context)
            val devices = api.devices()
            val selected = resolveSelectedDevice(context, devices)
            val status = if (selected != null) {
                val state = runCatching { api.playback(selected.id) }.getOrNull()
                AirwavePrefs.setPlaying(context, state?.playing == true)
                val stateText = if (state?.playing == true) "Playing" else "Paused"
                "$stateText • vol ${Math.round(selected.volume * 100)}"
            } else {
                "No enabled devices"
            }
            updateAll(context, status)
        }

        private fun cycleDevice(context: Context, api: AirwaveApi) {
            val devices = api.devices()
            if (devices.isEmpty()) {
                AirwavePrefs.setDevice(context, null, null)
                updateAll(context, "No enabled devices")
                return
            }
            val currentId = AirwavePrefs.deviceId(context)
            val currentIndex = devices.indexOfFirst { it.id == currentId }
            val next = devices[(currentIndex + 1).floorMod(devices.size)]
            AirwavePrefs.setDevice(context, next.id, next.name)
            updateAll(context, "Selected ${next.name}")
        }

        private fun adjustVolume(context: Context, api: AirwaveApi, delta: Double) {
            val device = selectedDevice(context, api)
            api.setVolume(device.id, device.volume + delta)
            val direction = if (delta > 0) "up" else "down"
            updateAll(context, "Volume $direction")
        }

        private fun selectedDevice(context: Context, api: AirwaveApi): AirwaveDevice =
            resolveSelectedDevice(context, api.devices())
                ?: throw IllegalStateException("No enabled devices")

        private fun resolveSelectedDevice(
            context: Context,
            devices: List<AirwaveDevice>,
        ): AirwaveDevice? {
            if (devices.isEmpty()) return null
            val currentId = AirwavePrefs.deviceId(context)
            val selected = devices.firstOrNull { it.id == currentId } ?: devices.first()
            if (selected.id != currentId || AirwavePrefs.deviceName(context) != selected.name) {
                AirwavePrefs.setDevice(context, selected.id, selected.name)
            }
            return selected
        }

        private fun apiOrThrow(context: Context): AirwaveApi {
            val serverUrl = AirwavePrefs.serverUrl(context)
            if (serverUrl.isBlank()) {
                throw IllegalStateException("Open app to set server URL")
            }
            return AirwaveApi(serverUrl)
        }

        private fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            widgetId: Int,
            status: String?,
        ) {
            val views = RemoteViews(context.packageName, R.layout.airwave_widget)
            views.setTextViewText(R.id.status_text, status ?: "Ready")
            setDeviceText(context, views)
            views.setImageViewResource(
                R.id.play_pause,
                if (AirwavePrefs.playing(context)) R.drawable.ic_pause else R.drawable.ic_play,
            )
            views.setOnClickPendingIntent(R.id.device_name, pendingIntent(context, ACTION_CYCLE_DEVICE))
            views.setOnClickPendingIntent(R.id.status_text, pendingIntent(context, ACTION_CYCLE_DEVICE))
            views.setOnClickPendingIntent(R.id.volume_down, pendingIntent(context, ACTION_VOLUME_DOWN))
            views.setOnClickPendingIntent(R.id.play_pause, pendingIntent(context, ACTION_PLAY_PAUSE))
            views.setOnClickPendingIntent(R.id.next, pendingIntent(context, ACTION_NEXT))
            views.setOnClickPendingIntent(R.id.volume_up, pendingIntent(context, ACTION_VOLUME_UP))
            manager.updateAppWidget(widgetId, views)
        }

        private fun setDeviceText(context: Context, views: RemoteViews) {
            val serverUrl = AirwavePrefs.serverUrl(context)
            if (serverUrl.isBlank()) {
                views.setTextViewText(R.id.device_name, "Set server URL")
                return
            }
            val deviceName = AirwavePrefs.deviceName(context)
            views.setTextViewText(R.id.device_name, deviceName ?: "Tap to choose device")
        }

        private fun pendingIntent(context: Context, action: String): PendingIntent {
            val intent = Intent(context, AirwaveWidgetProvider::class.java).setAction(action)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getBroadcast(context, action.hashCode(), intent, flags)
        }

        private fun Int.floorMod(modulus: Int): Int = ((this % modulus) + modulus) % modulus
    }
}
