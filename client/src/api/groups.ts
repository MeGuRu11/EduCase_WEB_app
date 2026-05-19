import api from './client';
import type {
  GroupCreate,
  GroupMemberAdd,
  GroupOut,
  GroupTeacherAssign,
  GroupUpdate,
} from '@/types/group';

export const groupsApi = {
  async list() {
    const response = await api.get<GroupOut[]>('/groups/');
    return response.data;
  },

  async create(payload: GroupCreate) {
    const response = await api.post<GroupOut>('/groups/', payload);
    return response.data;
  },

  async update(groupId: number, payload: GroupUpdate) {
    const response = await api.patch<GroupOut>(`/groups/${groupId}`, payload);
    return response.data;
  },

  async remove(groupId: number) {
    await api.delete(`/groups/${groupId}`);
  },

  async addMember(groupId: number, payload: GroupMemberAdd) {
    const response = await api.post<{ status: string }>(`/groups/${groupId}/members`, payload);
    return response.data;
  },

  async removeMember(groupId: number, userId: number) {
    const response = await api.delete<{ status: string }>(`/groups/${groupId}/members/${userId}`);
    return response.data;
  },

  async assignTeacher(groupId: number, payload: GroupTeacherAssign) {
    const response = await api.post<{ status: string }>(`/groups/${groupId}/assign-teacher`, payload);
    return response.data;
  },

  async removeTeacher(groupId: number, teacherId: number) {
    const response = await api.delete<{ status: string }>(`/groups/${groupId}/teachers/${teacherId}`);
    return response.data;
  },
};