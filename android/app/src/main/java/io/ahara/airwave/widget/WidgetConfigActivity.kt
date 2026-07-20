package io.ahara.airwave.widget

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import io.ahara.airwave.R

class WidgetConfigActivity : Activity() {
    private lateinit var serverUrl: EditText
    private lateinit var useAuth: CheckBox
    private lateinit var username: EditText
    private lateinit var password: EditText
    private lateinit var mfaCode: EditText
    private lateinit var saveButton: Button
    private lateinit var signOutButton: Button
    private lateinit var status: TextView
    private var pendingMfa: CognitoMfaChallenge? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.config_activity)

        serverUrl = findViewById(R.id.server_url)
        useAuth = findViewById(R.id.use_auth)
        username = findViewById(R.id.username)
        password = findViewById(R.id.password)
        mfaCode = findViewById(R.id.mfa_code)
        saveButton = findViewById(R.id.save_button)
        signOutButton = findViewById(R.id.sign_out_button)
        status = findViewById(R.id.config_status)

        serverUrl.setText(AirwavePrefs.serverUrl(this))
        useAuth.isChecked = AirwavePrefs.authRequired(this)
        SecureTokenStore.load(this)?.let {
            username.setText(it.username)
            status.text = getString(R.string.status_signed_in, it.username)
        }
        updateAuthFields()

        useAuth.setOnCheckedChangeListener { _, _ ->
            pendingMfa = null
            mfaCode.visibility = View.GONE
            updateAuthFields()
        }
        saveButton.setOnClickListener { saveOrSignIn() }
        signOutButton.setOnClickListener {
            AirwaveAuthManager.signOut(this)
            pendingMfa = null
            password.text.clear()
            mfaCode.text.clear()
            status.setText(R.string.status_signed_out)
            updateAuthFields()
        }
    }

    private fun saveOrSignIn() {
        val url = serverUrl.text.toString().trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            status.setText(R.string.status_invalid_server_url)
            return
        }

        if (!useAuth.isChecked) {
            AirwaveAuthManager.signOut(this)
            saveConnection(url, false)
            status.setText(R.string.status_saved_refreshing)
            refreshWidget()
            return
        }

        pendingMfa?.let { challenge ->
            runAuth { AirwaveAuthManager.confirmMfa(challenge, mfaCode.text.toString()) }
            return
        }

        val existingSession = SecureTokenStore.load(this)
        val login = username.text.toString().trim()
        val secret = password.text.toString()
        if (existingSession != null && secret.isBlank()) {
            saveConnection(url, true)
            status.setText(R.string.status_saved_refreshing)
            refreshWidget()
            return
        }
        if (login.isBlank() || secret.isBlank()) {
            status.setText(R.string.status_credentials_required)
            return
        }
        runAuth { AirwaveAuthManager.signIn(login, secret) }
    }

    private fun runAuth(operation: () -> CognitoAuthResult) {
        setBusy(true)
        status.setText(R.string.status_signing_in)
        Thread {
            runCatching(operation).fold(
                onSuccess = { result -> runOnUiThread { handleAuthResult(result) } },
                onFailure = { error ->
                    runOnUiThread {
                        setBusy(false)
                        status.text = error.message ?: getString(R.string.status_auth_failed)
                    }
                },
            )
        }.start()
    }

    private fun handleAuthResult(result: CognitoAuthResult) {
        setBusy(false)
        when (result) {
            is CognitoAuthResult.Authenticated -> {
                SecureTokenStore.save(this, result.session)
                pendingMfa = null
                password.text.clear()
                mfaCode.text.clear()
                mfaCode.visibility = View.GONE
                saveConnection(serverUrl.text.toString().trim(), true)
                status.text = getString(R.string.status_signed_in_refreshing, result.session.username)
                refreshWidget()
            }
            is CognitoAuthResult.MfaRequired -> {
                pendingMfa = result.challenge
                mfaCode.visibility = View.VISIBLE
                mfaCode.requestFocus()
                saveButton.setText(R.string.action_verify_save)
                status.setText(R.string.status_mfa_required)
            }
            is CognitoAuthResult.SetupRequired -> status.text = result.message
        }
        updateAuthFields()
    }

    private fun saveConnection(url: String, authRequired: Boolean) {
        AirwavePrefs.setServerUrl(this, url)
        AirwavePrefs.setAuthRequired(this, authRequired)
    }

    private fun refreshWidget() {
        AirwaveWidgetProvider.refreshAsync(this)
        setResult(RESULT_OK)
        updateAuthFields()
    }

    private fun updateAuthFields() {
        val authVisible = useAuth.isChecked
        username.visibility = if (authVisible) View.VISIBLE else View.GONE
        password.visibility = if (authVisible) View.VISIBLE else View.GONE
        if (!authVisible) mfaCode.visibility = View.GONE
        val signedIn = SecureTokenStore.load(this) != null
        signOutButton.visibility = if (authVisible && signedIn) View.VISIBLE else View.GONE
        saveButton.text = when {
            pendingMfa != null -> getString(R.string.action_verify_save)
            authVisible && !signedIn -> getString(R.string.action_sign_in_save)
            else -> getString(R.string.action_save_refresh)
        }
    }

    private fun setBusy(busy: Boolean) {
        saveButton.isEnabled = !busy
        signOutButton.isEnabled = !busy
        useAuth.isEnabled = !busy
        serverUrl.isEnabled = !busy
        username.isEnabled = !busy
        password.isEnabled = !busy
        mfaCode.isEnabled = !busy
    }
}
