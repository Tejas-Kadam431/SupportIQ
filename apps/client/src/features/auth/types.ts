export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthData = {
  user: User;
  accessToken: string;
};

export type AuthResponse = {
  message: string;
  data: AuthData;
};

export type MeResponse = {
  data: {
    user: User;
  };
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};