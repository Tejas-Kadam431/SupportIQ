import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { setAuthReady, setCredentials, clearCredentials } from "./authSlice";
import { useRefreshMutation } from "./authApi";

type Props = {
  children: ReactNode;
};

export function AuthInitializer({ children }: Props) {
  const dispatch = useAppDispatch();
  const isAuthReady = useAppSelector((state) => state.auth.isAuthReady);
  const [refresh] = useRefreshMutation();
  // React StrictMode replays effects. One initializer must never rotate twice.
  const initializationStarted = useRef(false);

  useEffect(() => {
    async function initializeAuth() {
      try {
        const response = await refresh().unwrap();

        dispatch(
          setCredentials({
            user: response.data.user,
            accessToken: response.data.accessToken
          })
        );
      } catch {
        dispatch(clearCredentials());
      } finally {
        dispatch(setAuthReady(true));
      }
    }

    if (!isAuthReady && !initializationStarted.current) {
      initializationStarted.current = true;
      initializeAuth();
    }
  }, [dispatch, refresh, isAuthReady]);

  return children;
}
