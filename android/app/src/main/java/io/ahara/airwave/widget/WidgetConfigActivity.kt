package io.ahara.airwave.widget

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import io.ahara.airwave.R

class WidgetConfigActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.config_activity)

        val serverUrl = findViewById<EditText>(R.id.server_url)
        val apiToken = findViewById<EditText>(R.id.api_token)
        val status = findViewById<TextView>(R.id.config_status)
        serverUrl.setText(AirwavePrefs.serverUrl(this))
        apiToken.setText(AirwavePrefs.apiToken(this))

        findViewById<Button>(R.id.save_button).setOnClickListener {
            val value = serverUrl.text.toString().trim()
            if (!value.startsWith("http://") && !value.startsWith("https://")) {
                status.text = "Server URL must start with http:// or https://"
                return@setOnClickListener
            }
            AirwavePrefs.setServerUrl(this, value)
            AirwavePrefs.setApiToken(this, apiToken.text.toString())
            status.text = "Saved. Refreshing devices…"
            AirwaveWidgetProvider.refreshAsync(this)
            setResult(RESULT_OK)
        }
    }
}
