import { api } from "../../app/api";
import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest
} from "./types";

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({
        url: "/auth/register",
        method: "POST",
        timeout: 75000,
        body
      })
    }),

    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        timeout: 75000,
        body
      })
    }),

    refresh: builder.mutation<AuthResponse, void>({
      query: () => ({
        url: "/auth/refresh",
        method: "POST",
        timeout: 10000,
        body: {}
      })
    }),

    logout: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
        timeout: 25000,
        body: {}
      })
    }),

    me: builder.query<MeResponse, void>({
      query: () => "/auth/me",
      providesTags: ["Auth"]
    })
  })
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useMeQuery
} = authApi;
