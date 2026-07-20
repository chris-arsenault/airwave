package io.ahara.airwave.widget

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class CognitoSession(
    val idToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val username: String,
)

object SecureTokenStore {
    private const val KEY_ALIAS = "airwave-cognito-session"
    private const val PREFS = "airwave-control-secure"
    private const val KEY_SESSION = "cognito_session"
    private const val ANDROID_KEY_STORE = "AndroidKeyStore"

    fun save(context: Context, session: CognitoSession) {
        val plaintext = JSONObject()
            .put("idToken", session.idToken)
            .put("refreshToken", session.refreshToken)
            .put("expiresAtMillis", session.expiresAtMillis)
            .put("username", session.username)
            .toString()
            .toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val payload = JSONObject()
            .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP))
            .toString()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SESSION, payload)
            .apply()
    }

    fun load(context: Context): CognitoSession? {
        val payload = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SESSION, null) ?: return null
        return runCatching {
            val envelope = JSONObject(payload)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, iv))
            val plaintext = cipher.doFinal(
                Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP)
            )
            val json = JSONObject(String(plaintext, Charsets.UTF_8))
            CognitoSession(
                idToken = json.getString("idToken"),
                refreshToken = json.getString("refreshToken"),
                expiresAtMillis = json.getLong("expiresAtMillis"),
                username = json.getString("username"),
            )
        }.getOrElse {
            clear(context)
            null
        }
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SESSION)
            .apply()
    }

    private fun encryptionKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            generateKey()
        }
    }
}
