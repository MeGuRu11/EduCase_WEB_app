import type { UserOut } from './user';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string | null;
  token_type: 'bearer';
  expires_in: number;
  user?: UserOut | null;
}

export interface LogoutResponse {
  status: string;
}
