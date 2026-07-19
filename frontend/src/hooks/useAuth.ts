import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  getSession,
  signIn,
  signOut,
  type MfaSetupRedirect,
  type SignInResult,
  type SoftwareTokenMfaChallenge,
} from "../auth";
import type { CognitoUserSession } from "amazon-cognito-identity-js";

export type AuthState = {
  status:
    | "loading"
    | "signedOut"
    | "signingIn"
    | "signedIn"
    | "softwareTokenMfaRequired"
    | "mfaSetupRequired"
    | "verifyingMfa";
  token: string;
  username: string;
  mfaChallenge?: SoftwareTokenMfaChallenge;
  mfaSetupRedirect?: MfaSetupRedirect;
};

const signedOutAuth: AuthState = { status: "signedOut", token: "", username: "" };

const getDisplayName = (session: CognitoUserSession, fallback: string) => {
  const payload = session.getIdToken().payload as Record<string, unknown>;
  return (
    (typeof payload.name === "string" && payload.name) ||
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload["cognito:username"] === "string" && payload["cognito:username"]) ||
    fallback
  );
};

const signedInAuth = (session: CognitoUserSession, fallbackUsername: string): AuthState => ({
  status: "signedIn",
  token: session.getIdToken().getJwtToken(),
  username: getDisplayName(session, fallbackUsername),
});

const challengeAuth = (challenge: SoftwareTokenMfaChallenge): AuthState => ({
  status: "softwareTokenMfaRequired",
  token: "",
  username: challenge.username,
  mfaChallenge: challenge,
});

const mfaSetupAuth = (redirect: MfaSetupRedirect): AuthState => ({
  status: "mfaSetupRequired",
  token: "",
  username: redirect.username,
  mfaSetupRedirect: redirect,
});

type AuthSetter = Dispatch<SetStateAction<AuthState>>;
const errorMessage = (error: unknown) => (error as Error).message;
const readFormValue = (form: HTMLFormElement, name: string) => {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
};

const applySignInResult = (setAuth: AuthSetter, result: SignInResult) => {
  if (result.status === "signedIn") {
    setAuth(signedInAuth(result.session, result.username));
    return;
  }
  if (result.status === "softwareTokenMfaRequired") {
    setAuth(challengeAuth(result.challenge));
    return;
  }
  setAuth(mfaSetupAuth(result.redirect));
};

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    status: "loading",
    token: "",
    username: "",
  });

  useEffect(() => {
    getSession()
      .then((session) => setAuth(session ? signedInAuth(session, "") : signedOutAuth))
      .catch(() => setAuth(signedOutAuth));
  }, []);

  const handleSignIn = (
    event: React.FormEvent<HTMLFormElement>,
    onError: (msg: string) => void
  ) => {
    event.preventDefault();
    const username = readFormValue(event.currentTarget, "username");
    const password = readFormValue(event.currentTarget, "password");
    onError("");
    setAuth({ status: "signingIn", token: "", username });
    signIn(username, password)
      .then((result) => applySignInResult(setAuth, result))
      .catch((error: unknown) => {
        setAuth(signedOutAuth);
        onError(errorMessage(error));
      });
  };

  const handleConfirmMfa = (
    event: React.FormEvent<HTMLFormElement>,
    onError: (msg: string) => void
  ) => {
    event.preventDefault();
    if (!auth.mfaChallenge) {
      setAuth(signedOutAuth);
      onError("Start sign in again.");
      return;
    }
    const challenge = auth.mfaChallenge;
    const code = readFormValue(event.currentTarget, "mfaCode");
    onError("");
    setAuth({ ...auth, status: "verifyingMfa" });
    challenge
      .submitCode(code)
      .then((session) => setAuth(signedInAuth(session, challenge.username)))
      .catch((error: unknown) => {
        setAuth(challengeAuth(challenge));
        onError(errorMessage(error));
      });
  };

  const handleSignOut = () => {
    signOut();
    setAuth(signedOutAuth);
  };

  return {
    auth,
    authActions: {
      signIn: handleSignIn,
      confirmMfa: handleConfirmMfa,
      signOut: handleSignOut,
    },
  };
}
