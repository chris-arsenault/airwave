package io.ahara.airwave.widget

import android.content.Context
import io.ahara.airwave.BuildConfig
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

sealed interface CognitoAuthResult {
    data class Authenticated(val session: CognitoSession) : CognitoAuthResult
    data class MfaRequired(val challenge: CognitoMfaChallenge) : CognitoAuthResult
    data class SetupRequired(val message: String) : CognitoAuthResult
}

data class CognitoMfaChallenge(
    val session: String,
    val username: String,
)

class CognitoAuthException(message: String) : IllegalStateException(message)

class CognitoAuthClient(
    private val userPoolId: String,
    private val clientId: String,
) {
    private val endpoint = "https://cognito-idp.${userPoolId.substringBefore('_')}.amazonaws.com/"

    fun signIn(username: String, password: String): CognitoAuthResult {
        val response = call(
            "InitiateAuth",
            JSONObject()
                .put("AuthFlow", "USER_PASSWORD_AUTH")
                .put("ClientId", clientId)
                .put(
                    "AuthParameters",
                    JSONObject().put("USERNAME", username).put("PASSWORD", password),
                ),
        )
        return parseResponse(response, username)
    }

    fun confirmMfa(challenge: CognitoMfaChallenge, rawCode: String): CognitoAuthResult {
        val code = rawCode.replace("\\s".toRegex(), "")
        if (!code.matches("\\d{6}".toRegex())) {
            throw CognitoAuthException("Enter the 6-digit authenticator code.")
        }
        val response = respondToChallenge(
            "SOFTWARE_TOKEN_MFA",
            challenge.session,
            JSONObject()
                .put("USERNAME", challenge.username)
                .put("SOFTWARE_TOKEN_MFA_CODE", code),
        )
        return parseResponse(response, challenge.username)
    }

    fun refresh(session: CognitoSession): CognitoSession {
        val response = call(
            "InitiateAuth",
            JSONObject()
                .put("AuthFlow", "REFRESH_TOKEN_AUTH")
                .put("ClientId", clientId)
                .put("AuthParameters", JSONObject().put("REFRESH_TOKEN", session.refreshToken)),
        )
        val auth = response.optJSONObject("AuthenticationResult")
            ?: throw CognitoAuthException("Cognito did not return a refreshed session.")
        return readSession(auth, session.username, session.refreshToken)
    }

    private fun parseResponse(response: JSONObject, fallbackUsername: String): CognitoAuthResult {
        response.optJSONObject("AuthenticationResult")?.let {
            return CognitoAuthResult.Authenticated(readSession(it, fallbackUsername))
        }
        val challengeName = response.optString("ChallengeName")
        val session = response.optString("Session")
        val parameters = response.optJSONObject("ChallengeParameters")
        val username = parameters?.optString("USERNAME")
            ?.ifBlank { parameters.optString("USER_ID_FOR_SRP") }
            ?.ifBlank { fallbackUsername }
            ?: fallbackUsername
        return when (challengeName) {
            "SOFTWARE_TOKEN_MFA" ->
                CognitoAuthResult.MfaRequired(CognitoMfaChallenge(session, username))
            "SELECT_MFA_TYPE" -> parseResponse(
                respondToChallenge(
                    challengeName,
                    session,
                    JSONObject().put("USERNAME", username).put("ANSWER", "SOFTWARE_TOKEN_MFA"),
                ),
                username,
            )
            "MFA_SETUP" -> CognitoAuthResult.SetupRequired(
                "Authenticator enrollment is required. Enroll through the web UI, then sign in again."
            )
            "NEW_PASSWORD_REQUIRED" -> CognitoAuthResult.SetupRequired(
                "A password reset is required. Complete it through the web UI, then sign in again."
            )
            else -> throw CognitoAuthException("Unsupported Cognito challenge: $challengeName")
        }
    }

    private fun respondToChallenge(
        challengeName: String,
        session: String,
        responses: JSONObject,
    ): JSONObject = call(
        "RespondToAuthChallenge",
        JSONObject()
            .put("ChallengeName", challengeName)
            .put("ClientId", clientId)
            .put("Session", session)
            .put("ChallengeResponses", responses),
    )

    private fun readSession(
        auth: JSONObject,
        username: String,
        fallbackRefreshToken: String = "",
    ): CognitoSession {
        val expiresInSeconds = auth.optLong("ExpiresIn", 3600)
        return CognitoSession(
            idToken = auth.getString("IdToken"),
            refreshToken = auth.optString("RefreshToken").ifBlank { fallbackRefreshToken },
            expiresAtMillis = System.currentTimeMillis() + expiresInSeconds * 1000,
            username = username,
        )
    }

    private fun call(operation: String, body: JSONObject): JSONObject {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Content-Type", "application/x-amz-json-1.1")
            setRequestProperty("X-Amz-Target", "AWSCognitoIdentityProviderService.$operation")
        }
        OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (status !in 200..299) {
            val error = runCatching { JSONObject(text) }.getOrNull()
            val message = error?.optString("message")
                ?.ifBlank { error.optString("Message") }
                ?.ifBlank { null }
                ?: "Cognito HTTP $status"
            throw CognitoAuthException(message)
        }
        return JSONObject(text)
    }
}

object AirwaveAuthManager {
    private const val REFRESH_SKEW_MILLIS = 60_000L
    private val client = CognitoAuthClient(
        BuildConfig.COGNITO_USER_POOL_ID,
        BuildConfig.COGNITO_CLIENT_ID,
    )

    fun signIn(username: String, password: String): CognitoAuthResult =
        client.signIn(username.trim(), password)

    fun confirmMfa(challenge: CognitoMfaChallenge, code: String): CognitoAuthResult =
        client.confirmMfa(challenge, code)

    @Synchronized
    fun idToken(context: Context): String {
        val session = SecureTokenStore.load(context)
            ?: throw IllegalStateException("Open the app and sign in")
        if (session.expiresAtMillis > System.currentTimeMillis() + REFRESH_SKEW_MILLIS) {
            return session.idToken
        }
        val refreshed = client.refresh(session)
        SecureTokenStore.save(context, refreshed)
        return refreshed.idToken
    }

    fun signOut(context: Context) = SecureTokenStore.clear(context)
}
