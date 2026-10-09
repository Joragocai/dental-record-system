import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { readBrowserAuthenticationConfig } from "../auth/authConfig.js";
import { activateBackendStaffAccount, verifyBackendSession } from "../auth/authApi.js";
import { createSupabaseBrowserAuthProvider } from "../auth/supabaseAuthProvider.js";
import type {
  BrowserAuthEvent,
  BrowserAuthProvider,
  BrowserAuthSession,
  VerifiedBackendIdentity
} from "../auth/authTypes.js";

interface AuthContextValue {
  loading: boolean;
  configured: boolean;
  configurationMessage: string | null;
  authenticated: boolean;
  recoveringPassword: boolean;
  providerSession: BrowserAuthSession | null;
  verifiedIdentity: VerifiedBackendIdentity | null;
  apiBaseUrl: string | null;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  requestPasswordRecovery(email: string): Promise<void>;
  updateRecoveredPassword(password: string): Promise<void>;
  completeInvitedAccount(password: string): Promise<void>;
  clearError(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function verifySession(
  session: BrowserAuthSession,
  apiBaseUrl: string
): Promise<VerifiedBackendIdentity> {
  return verifyBackendSession({ accessToken: session.accessToken, apiBaseUrl });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configResult = useMemo(() => readBrowserAuthenticationConfig(), []);
  const providerRef = useRef<BrowserAuthProvider | null>(null);
  const [loading, setLoading] = useState(configResult.configured);
  const [providerSession, setProviderSession] = useState<BrowserAuthSession | null>(null);
  const [verifiedIdentity, setVerifiedIdentity] = useState<VerifiedBackendIdentity | null>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProvider = useCallback(() => {
    if (!configResult.config) throw new Error(configResult.reason ?? "Authentication is not configured.");
    if (!providerRef.current) {
      providerRef.current = createSupabaseBrowserAuthProvider(configResult.config);
    }
    return providerRef.current;
  }, [configResult]);

  const acceptVerifiedSession = useCallback(
    async (session: BrowserAuthSession | null) => {
      if (!session || !configResult.config) {
        setProviderSession(null);
        setVerifiedIdentity(null);
        return;
      }
      const identity = await verifySession(session, configResult.config.apiBaseUrl);
      setProviderSession(session);
      setVerifiedIdentity(identity);
    },
    [configResult.config]
  );

  useEffect(() => {
    if (!configResult.configured || !configResult.config) {
      setLoading(false);
      return;
    }

    const provider = getProvider();
    let active = true;

    provider
      .getSession()
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          setProviderSession(null);
          setVerifiedIdentity(null);
          return;
        }
        try {
          await acceptVerifiedSession(session);
        } catch {
          if (active) {
            setProviderSession(null);
            setVerifiedIdentity(null);
            setError("Your existing session could not be verified. Please sign in again.");
            void provider.signOut().catch(() => undefined);
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = provider.onAuthStateChange((event: BrowserAuthEvent, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
      if (event === "SIGNED_OUT") {
        setProviderSession(null);
        setVerifiedIdentity(null);
        setRecoveringPassword(false);
        return;
      }
      if (!session) return;
      void acceptVerifiedSession(session).catch(() => {
        if (!active) return;
        setProviderSession(null);
        setVerifiedIdentity(null);
        setError("The secure session could not be verified.");
        void provider.signOut().catch(() => undefined);
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [acceptVerifiedSession, configResult, getProvider]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const session = await getProvider().signIn(email.trim(), password);
        await acceptVerifiedSession(session);
      } catch (loginError) {
        const message = loginError instanceof Error ? loginError.message : "Unable to sign in.";
        setProviderSession(null);
        setVerifiedIdentity(null);
        setError(message);
        void getProvider().signOut().catch(() => undefined);
        throw loginError;
      } finally {
        setLoading(false);
      }
    },
    [acceptVerifiedSession, getProvider]
  );

  const logout = useCallback(async () => {
    setError(null);
    try {
      await getProvider().signOut();
    } finally {
      setProviderSession(null);
      setVerifiedIdentity(null);
      setRecoveringPassword(false);
    }
  }, [getProvider]);

  const requestPasswordRecovery = useCallback(
    async (email: string) => {
      setError(null);
      if (!configResult.config) throw new Error(configResult.reason ?? "Authentication is not configured.");
      const redirectTo = `${window.location.origin}/reset-password`;
      await getProvider().requestPasswordRecovery(email.trim(), redirectTo);
    },
    [configResult, getProvider]
  );

  const completeInvitedAccount = useCallback(
    async (password: string) => {
      setError(null);
      if (!configResult.config) throw new Error(configResult.reason ?? "Authentication is not configured.");
      const provider = getProvider();
      const currentSession = await provider.getSession();
      if (!currentSession) throw new Error("Open the staff invitation link before activating this account.");

      await provider.updatePassword(password);
      const updatedSession = await provider.getSession();
      if (!updatedSession) throw new Error("The invitation session ended before activation could finish.");

      await activateBackendStaffAccount({
        accessToken: updatedSession.accessToken,
        apiBaseUrl: configResult.config.apiBaseUrl
      });

      await provider.signOut();
      setProviderSession(null);
      setVerifiedIdentity(null);
      setRecoveringPassword(false);
    },
    [configResult, getProvider]
  );

  const updateRecoveredPassword = useCallback(
    async (password: string) => {
      setError(null);
      if (!recoveringPassword) throw new Error("A valid password recovery session is required.");
      await getProvider().updatePassword(password);
      setRecoveringPassword(false);
      await getProvider().signOut();
      setProviderSession(null);
      setVerifiedIdentity(null);
    },
    [getProvider, recoveringPassword]
  );

  const value: AuthContextValue = {
    loading,
    configured: configResult.configured,
    configurationMessage: configResult.reason,
    authenticated: Boolean(verifiedIdentity),
    recoveringPassword,
    providerSession,
    verifiedIdentity,
    apiBaseUrl: configResult.config?.apiBaseUrl ?? null,
    error,
    login,
    logout,
    requestPasswordRecovery,
    updateRecoveredPassword,
    completeInvitedAccount,
    clearError: () => setError(null)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
