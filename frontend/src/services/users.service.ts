import { api } from './api';

export type UserRole = 'admin' | 'marketer';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدیر',
  marketer: 'بازاریاب',
};

export interface AppUser {
  _id: string;
  username: string;
  fullName: string;
  phoneNumber?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface UserInput {
  username?: string;
  password?: string;
  fullName?: string;
  phoneNumber?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const usersService = {
  async list(): Promise<AppUser[]> {
    return (await api.get('/auth/users')).data;
  },
  async create(input: UserInput & { username: string; password: string; fullName: string }): Promise<AppUser> {
    return (await api.post('/auth/register', input)).data;
  },
  async update(id: string, input: UserInput): Promise<AppUser> {
    return (await api.patch(`/auth/users/${id}`, input)).data;
  },
  async changeMyPassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return (await api.patch('/auth/password', { currentPassword, newPassword })).data;
  },
};
