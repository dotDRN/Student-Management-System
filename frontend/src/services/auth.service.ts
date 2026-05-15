import api from './api';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  centerIds: string[];
};

export type LoginResponse = {
  token?: string;
  accessToken?: string;
  user: AuthUser;
};

export const login = (email: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data);

export const getMe = () =>
  api.get<{ user: AuthUser }>('/auth/me').then((r) => r.data.user);
