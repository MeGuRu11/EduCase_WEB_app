import api from './client';
import type {
  GroupCreate,
  GroupMemberAdd,
  GroupOut,
  GroupTeacherAssign,
  GroupUpdate,
} from '@/types/group';

export const groupsApi = {
  list() {
    return api.get<GroupOut[]>('/groups/');
  },

  create(payload: GroupCreate) {
    return api.post<GroupOut>('/groups/', payload);
  },

  update(groupId: number, payload: GroupUpdate) {
    return api.patch<GroupOut>(`/groups/${groupId}`, payload);
  },

  addMember(groupId: number, payload: GroupMemberAdd) {
    return api.post<{ status: string }>(`/groups/${groupId}/members`, payload);
  },

  removeMember(groupId: number, userId: number) {
    return api.delete<{ status: string }>(`/groups/${groupId}/members/${userId}`);
  },

  assignTeacher(groupId: number, payload: GroupTeacherAssign) {
    return api.post<{ status: string }>(`/groups/${groupId}/assign-teacher`, payload);
  },

  removeTeacher(groupId: number, teacherId: number) {
    return api.delete<{ status: string }>(`/groups/${groupId}/teachers/${teacherId}`);
  },
};
