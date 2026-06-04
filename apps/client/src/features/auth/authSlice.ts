import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "./types";

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isAuthReady: boolean;
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthReady: false
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
    },
    clearCredentials: (state) => {
      state.user = null;
      state.accessToken = null;
    },
    setAuthReady: (state, action: PayloadAction<boolean>) => {
      state.isAuthReady = action.payload;
    }
  }
});

export const { setCredentials, clearCredentials, setAuthReady } = authSlice.actions;

export default authSlice.reducer;