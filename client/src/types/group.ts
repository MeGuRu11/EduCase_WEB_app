export interface TeacherShort {
  id: number;
  full_name: string;
}

export interface GroupCreate {
  name: string;
  description?: string | null;
}

export interface GroupUpdate {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

export interface GroupOut {
  id: number;
  name: string;
  description: string | null;
  teachers: TeacherShort[];
  student_count: number;
  is_active: boolean;
  created_at: string;
}

export interface GroupMemberAdd {
  user_id: number;
}

export interface GroupTeacherAssign {
  teacher_id: number;
}
