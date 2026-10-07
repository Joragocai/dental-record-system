import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import type { BrowserAuthenticationConfig } from "./authConfig.js";
import type {
  BrowserAuthEvent,
  BrowserAuthProvider,
  BrowserAuthSession
} from "./authTypes.js";

function mapSession(session: Session | null): BrowserAuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email ?? null
    }
  };
}

function mapAuthEvent(event: AuthChangeEvent): BrowserAuthEvent | null {
  switch (event) {
    case "SIGNED_IN":
    case "SIGNED_OUT":
    case "TOKEN_REFRESHED":
    case "PASSWORD_RECOVERY":
    case "USER_UPDATED":
      return event;
    default:
      return null;
  }
}

export function createSupabaseBrowserAuthProvider(config: BrowserAuthenticationConfig): BrowserAuthProvider {
  const client = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error("Unable to restore the authentication session.");
      return mapSession(data.session);
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error("Email or password is incorrect.");
      return mapSession(data.session) as BrowserAuthSession;
    },

    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new Error("Unable to sign out. Please try again.");
    },

    async requestPasswordRecovery(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error("Unable to complete the recovery request right now.");
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (!error) return;

      switch (error.code) {
        case "weak_password":
          throw new Error(
            "Supabase rejected this password as too weak. Use a new password with at least 12 characters and include uppercase, lowercase, a number, and a symbol."
          );
        case "same_password":
          throw new Error("Choose a password different from the one already used for this account.");
        case "reauthentication_needed":
          throw new Error("Supabase requires a fresh authentication step before this password can be changed.");
        case "session_expired":
        case "session_not_found":
        case "flow_state_expired":
        case "flow_state_not_found":
          throw new Error("This activation session has expired. Request a fresh activation email and try again.");
        default:
          throw new Error(
            `Supabase rejected the password update (code: ${error.code ?? "unknown"}). Please report this code so the activation flow can be corrected.`
          );
      }
    },

    onAuthStateChange(callback) {
      const { data } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        const mappedEvent = mapAuthEvent(event);
        if (!mappedEvent) return;
        callback(mappedEvent, mapSession(session));
      });
      return () => data.subscription.unsubscribe();
    }
  };
}
