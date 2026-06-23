import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../../lib/supabase.js';
import { accountKeys } from '../../lib/query-keys/account.js';
import { getMyProfile, getMySettings } from '../../features/profile/api/profileApi.js';
import { signOutSession } from '../../features/auth/api/authApi.js';
import { clearAttachmentUrlCache } from '../../features/messaging/queries/attachmentUrlCache.js';
import { clearAiImageUrlCache } from '../../features/ai/queries/aiImageUrlCache.js';
import { useUiStore } from '../../stores/uiStore.js';
import { clearAiDocumentUrlCache } from '../../features/ai/queries/aiDocumentUrlCache.js';
import { AuthContext } from './AuthContext.js';
import { clearNotificationState } from '../../features/messaging/notifications/browserNotifications.js';

const RECOVERY_KEY = 'council.password-recovery';

function shouldRetryAccountQuery(failureCount, error) {
  if (['PROFILE_NOT_READY', 'SETTINGS_NOT_READY'].includes(error?.code)) {
    return failureCount < 4;
  }

  return failureCount < 1;
}

export function AuthProvider({ children, client = getSupabaseClient() }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [isSessionHydrating, setIsSessionHydrating] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => sessionStorage.getItem(RECOVERY_KEY) === 'true',
  );

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;

      setSession(nextSession);
      setSessionError(null);
      setIsSessionHydrating(false);

      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(RECOVERY_KEY, 'true');
        setIsPasswordRecovery(true);
      }

      if (event === 'SIGNED_OUT') {
        // Drop every cached query so no private data (messages, previews,
        // receipts, contacts) survives a session change.
        queryClient.clear();
        clearAttachmentUrlCache();
        clearAiImageUrlCache();
        clearAiDocumentUrlCache();
        useUiStore.getState().clearPendingAiForward();
        clearNotificationState();
      }
    });

    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(error ? null : data.session);
        setSessionError(error);
        setIsSessionHydrating(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        const error = new Error('Session hydration failed.');
        error.code = 'AUTH_SESSION_ERROR';
        setSessionError(error);
        setIsSessionHydrating(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client, queryClient]);

  const user = session?.user ?? null;
  const profileQuery = useQuery({
    queryKey: accountKeys.profile(user?.id),
    queryFn: () => getMyProfile(user.id, client),
    enabled: Boolean(user),
    retry: shouldRetryAccountQuery,
    retryDelay: (attempt) => Math.min(150 * 2 ** attempt, 1200),
  });
  const settingsQuery = useQuery({
    queryKey: accountKeys.settings(user?.id),
    queryFn: () => getMySettings(user.id, client),
    enabled: Boolean(user),
    retry: shouldRetryAccountQuery,
    retryDelay: (attempt) => Math.min(150 * 2 ** attempt, 1200),
  });

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKeys.profile(user.id) }),
      queryClient.invalidateQueries({ queryKey: accountKeys.settings(user.id) }),
    ]);
  }, [queryClient, user]);

  const signOut = useCallback(
    async (scope = 'local') => {
      await signOutSession(scope, client);
      // Clear all cached queries on explicit sign-out so private message
      // content and previews never persist across sessions.
      queryClient.clear();
      clearAttachmentUrlCache();
      clearAiImageUrlCache();
      clearAiDocumentUrlCache();
      useUiStore.getState().clearPendingAiForward();
      clearNotificationState();
    },
    [client, queryClient],
  );

  const completePasswordRecovery = useCallback(() => {
    sessionStorage.removeItem(RECOVERY_KEY);
    setIsPasswordRecovery(false);
  }, []);

  const isAuthenticated = Boolean(user);
  const isAccountHydrating = isAuthenticated && (profileQuery.isPending || settingsQuery.isPending);
  const accountError = sessionError ?? profileQuery.error ?? settingsQuery.error ?? null;

  const value = useMemo(
    () => ({
      session,
      user,
      profile: profileQuery.data ?? null,
      settings: settingsQuery.data ?? null,
      isHydrating: isSessionHydrating || isAccountHydrating,
      isAuthenticated,
      isOnboarded: Boolean(profileQuery.data?.username),
      accountError,
      isPasswordRecovery,
      refreshProfile,
      signOut,
      completePasswordRecovery,
      client,
    }),
    [
      accountError,
      client,
      completePasswordRecovery,
      isAccountHydrating,
      isAuthenticated,
      isPasswordRecovery,
      isSessionHydrating,
      profileQuery.data,
      refreshProfile,
      session,
      settingsQuery.data,
      signOut,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
