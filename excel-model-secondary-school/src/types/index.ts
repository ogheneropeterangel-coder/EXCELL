export type Role = 'admin' | 'teacher' | 'student' | 'cashier' | 'exam_officer';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  sender_id: string;
  target_role: 'all' | 'teacher' | 'student';
  target_class_id?: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface FeeStandard {
  id: number;
  class_id: number;
  term: string;
  session: string;
  amount: number;
  class?: Class;
}

export interface FeeRecord {
  id: number;
  student_id: number;
  term: string;
  session: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: 'Paid' | 'Partial' | 'Not Paid';
  results_locked: boolean;
  last_updated_by?: string;
  updated_at: string;
  student?: Student;
  transactions?: FeeTransaction[];
}

export interface FeeTransaction {
  id: number;
  fee_record_id: number;
  amount: number;
  payment_method: 'Cash' | 'Bank Transfer' | 'POS' | 'Online';
  cashier_id: string;
  transaction_date: string;
  receipt_number: string;
  cashier?: Profile;
}

export interface Class {
  id: number;
  class_name: string;
  teacher_id?: string;
  category?: 'Junior' | 'Senior';
  created_at: string;
  teacher?: Profile;
}

export interface Subject {
  id: number;
  subject_name: string;
  created_at: string;
}

export interface Student {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string;
  gender: 'Male' | 'Female' | 'Other';
  admission_number: string;
  class_id?: number;
  teacher_id?: string;
  parent_name?: string;
  parent_contact?: string;
  address?: string;
  created_at: string;
  class?: Class;
  teacher?: Profile;
}

export interface Result {
  id: number;
  student_id: number;
  subject_id: number;
  class_id: number;
  term: string;
  session: string;
  ca1_score: number;
  ca2_score: number;
  exam_score: number;
  total_score: number;
  created_at: string;
  student?: Student;
  subject?: Subject;
  class?: Class;
}

export interface Settings {
  id: number;
  school_name: string;
  school_logo_url?: string;
  school_motto?: string;
  current_term: string;
  current_session: string;
  next_term_begins?: string;
  principal_signature_url?: string;
  id_card_header_color?: string;
  id_card_accent_color?: string;
  id_card_font_style?: 'helvetica' | 'times' | 'courier';
  id_card_primary_text_color?: string;
}

export interface Attendance {
  id: number;
  student_id: number;
  class_id: number;
  date: string;
  status: 'Present' | 'Absent';
  remark?: string;
  term: string;
  session: string;
  created_at: string;
  student?: Student;
}
