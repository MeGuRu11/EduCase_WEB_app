export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserCreate {
  username: string;
  password: string;
  full_name: string;
  role_id: number;
  group_id?: number | null;
}

export interface UserUpdate {
  full_name?: string | null;
  group_id?: number | null;
  avatar_path?: string | null;
}

export interface UserStatusUpdate {
  is_active: boolean;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

export interface ResetPasswordRequest {
  new_password: string;
}

export interface UserOut {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  role_id: number;
  group_id: number | null;
  group_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface UserBulkCSVRow {
  username: string;
  password: string;
  full_name: string;
  role: UserRole;
  group_name?: string | null;
  email?: string | null;
}

export interface UserBulkError {
  row: number;
  detail: string;
}

export interface UserBulkResult {
  created: number;
  errors: UserBulkError[];
}
