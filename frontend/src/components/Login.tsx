import { useState } from "react";
import type { useAuth } from "../hooks/useAuth";

type AuthApi = ReturnType<typeof useAuth>;

export function Login({ auth, authActions }: AuthApi) {
  const [error, setError] = useState("");

  const busy = auth.status === "signingIn" || auth.status === "verifyingMfa";

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Airwave</h1>
        <LoginBody auth={auth} authActions={authActions} busy={busy} onError={setError} />
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

function LoginBody({
  auth,
  authActions,
  busy,
  onError,
}: AuthApi & { busy: boolean; onError: (msg: string) => void }) {
  if (auth.status === "mfaSetupRequired") {
    return (
      <p className="login-error">
        Multi-factor setup is required. Enroll at{" "}
        <a href={auth.mfaSetupRedirect?.enrollmentUrl}>mail.ahara.io</a>, then sign in again.
      </p>
    );
  }
  if (auth.status === "softwareTokenMfaRequired" || auth.status === "verifyingMfa") {
    return (
      <form onSubmit={(e) => authActions.confirmMfa(e, onError)}>
        <label htmlFor="mfaCode">Authenticator code</label>
        <input id="mfaCode" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" />
        <button type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
    );
  }
  return (
    <form onSubmit={(e) => authActions.signIn(e, onError)}>
      <label htmlFor="username">Username</label>
      <input id="username" name="username" autoComplete="username" />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" />
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
