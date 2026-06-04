import { useEffect } from "react";
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

    if (!isAuthReady) {
      initializeAuth();
    }
  }, [dispatch, refresh, isAuthReady]);

  return children;
}