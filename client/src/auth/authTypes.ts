export interface BrowserAuthUser {
  id: string;
  email: string | null;
}

export interface BrowserAuthSession {
  accessToken: string;
  expiresAt: number | null;
  user: BrowserAuthUser;
}

export type BrowserAuthEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "PASSWORD_RECOVERY"
  | "USER_UPDATED";

export interface BrowserAuthProvider {
  getSession(): Promise<BrowserAuthSession | null>;
  signIn(email: string, password: string): Promise<BrowserAuthSession>;
  signOut(): Promise<void>;
  requestPasswordRecovery(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  onAuthStateChange(
    callback: (event: BrowserAuthEvent, session: BrowserAuthSession | null) => void
  ): () => void;
}

export interface VerifiedBackendIdentity {
  id: string;
  email: string | null;
}
