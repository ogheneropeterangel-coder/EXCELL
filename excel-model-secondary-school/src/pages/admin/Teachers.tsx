import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { Profile, Class, Subject } from '../../types';
import { 
  Plus, 
  Search, 
  UserPlus, 
  Edit2, 
  Trash2, 
  X,
  Loader2,
  Mail,
  Lock,
  Shield,
  BookOpen,
  School,
  Square,
  CheckSquare
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Teachers() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;

  const [staff, setStaff] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Profile | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Profile | null>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'teacher' as 'teacher' | 'cashier' | 'exam_officer'
  });

  const [assignData, setAssignData] = useState({
    class_ids: [] as number[],
    subject_ids: [] as number[],
  });

  if (!canManage && profile) {
    return <Navigate to="/teacher" replace />;
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [staffRes, classesRes, subjectsRes] = await Promise.all([
        supabase.from('profiles').select('*').in('role', ['teacher', 'cashier', 'exam_officer']).order('name'),
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('subjects').select('*').order('subject_name'),
      ]);

      if (staffRes.error) throw staffRes.error;
      if (classesRes.error) throw classesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setStaff(staffRes.data || []);
      setClasses(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) {
      toast.error('Only administrators and exam officers can manage staff accounts');
      return;
    }

    if (!editingStaff && formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingStaff) {
        console.log('Attempting to update staff profile:', editingStaff.id);
        const { data: updateData, error: updateError } = await supabase
          .from('profiles')
          .update({
            name: formData.name,
            username: formData.username || null,
            email: formData.email,
            role: formData.role
          })
          .eq('id', editingStaff.id)
          .select();

        if (updateError) {
          console.error('Update profile error details:', updateError);
          if (updateError.message.includes('unique constraint') && updateError.message.includes('username')) {
            throw new Error('This username is already taken. Please choose another one.');
          }
          throw updateError;
        }
        console.log('Update profile success:', updateData);
        toast.success('Teacher updated successfully');
      } else {
        console.log('Attempting to create teacher account for:', formData.email);
        
        // 1. Check if email already exists in profiles
        const { data: existingEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', formData.email)
          .maybeSingle();
        
        if (existingEmail) {
          throw new Error('This email is already registered in the profiles table. Please use a different email.');
        }

        // 2. Check if username already exists in profiles
        if (formData.username) {
          const { data: existingUsername } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', formData.username)
            .maybeSingle();
          
          if (existingUsername) {
            throw new Error('This username is already taken. Please choose another one.');
          }
        }

        // Use a separate client for signUp to avoid session issues for the admin
        const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        const { data: authData, error: authError } = await tempSupabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              username: formData.username || null,
              role: formData.role
            }
          }
        });

        if (authError) {
          console.error('Auth signUp error details:', authError);
          
          if (authError.message.includes('Database error saving new user')) {
            throw new Error('A database error occurred in the account trigger. This usually means the "cashier" role is not yet active in your database enum. Please run the SQL migration mentioned in the chat.');
          }

          if (authError.message.includes('already registered')) {
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', formData.email)
              .maybeSingle();
            
            if (existingProfile) {
              throw new Error('This email is already registered to a staff member.');
            } else {
              // Attempt repair for orphan auth user
              const { data: userId } = await supabase.rpc('get_user_id_by_email', { 
                email_text: formData.email 
              });

              if (userId) {
                const { error: repairError } = await supabase.from('profiles').upsert([{
                  id: userId,
                  name: formData.name,
                  username: formData.username || null,
                  email: formData.email,
                  role: formData.role
                }], { onConflict: 'id' });

                if (!repairError) {
                  toast.success('Account found and linked successfully');
                  fetchData();
                  setIsModalOpen(false);
                  setFormData({ name: '', username: '', email: '', password: '', role: 'teacher' });
                  return;
                }
              }
              throw new Error('This email is already registered but has no profile. Please try another email.');
            }
          }
          throw authError;
        }

        if (!authData.user) throw new Error('Failed to create account.');
        
        console.log('Auth user created successfully:', authData.user.id);
        
        // Manual profile sync to be sure
        const { error: profileError } = await supabase.from('profiles').upsert([{
          id: authData.user.id,
          name: formData.name,
          username: formData.username || null,
          email: formData.email,
          role: formData.role
        }], { onConflict: 'id' });

        if (profileError) {
          console.error('Manual profile upsert error:', profileError);
          if (profileError.message.includes('username')) {
            throw new Error('This username is already taken.');
          }
        }
        
        toast.success(`${formData.role === 'teacher' ? 'Teacher' : 'Cashier'} account created`);
      }

    setIsModalOpen(false);
    setEditingStaff(null);
    setFormData({ name: '', username: '', email: '', password: '', role: 'teacher' });
    await fetchData();
    } catch (error: any) {
      console.error('Teacher management caught error:', error);
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkDelete() {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete staff');
      return;
    }
    if (selectedStaffIds.length === 0) return;
    if (!confirm(`This action will permanently delete ${selectedStaffIds.length} staff members. This cannot be undone. Are you absolutely sure you want to proceed?`)) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('profiles').delete().in('id', selectedStaffIds);
      if (error) throw error;
      toast.success(`${selectedStaffIds.length} staff members deleted`);
      setSelectedStaffIds([]);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const toggleSelectAll = () => {
    if (selectedStaffIds.length === staff.length) {
      setSelectedStaffIds([]);
    } else {
      setSelectedStaffIds(staff.map(s => s.id));
    }
  };

  const toggleSelectMember = (id: string) => {
    if (selectedStaffIds.includes(id)) {
      setSelectedStaffIds(selectedStaffIds.filter(sid => sid !== id));
    } else {
      setSelectedStaffIds([...selectedStaffIds, id]);
    }
  };

  async function openAssignModal(staffMember: Profile) {
    setSelectedStaff(staffMember);
    setLoading(true);
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        supabase.from('teacher_classes').select('class_id').eq('teacher_id', staffMember.id),
        supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', staffMember.id)
      ]);

      setAssignData({
        class_ids: classesRes.data?.map(d => d.class_id) || [],
        subject_ids: subjectsRes.data?.map(d => d.subject_id) || []
      });
      setIsAssignModalOpen(true);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignments(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) {
      toast.error('Only administrators and exam officers can manage assignments');
      return;
    }
    if (!selectedStaff) return;
    setIsSubmitting(true);

    try {
      // Update Classes
      await supabase.from('teacher_classes').delete().eq('teacher_id', selectedStaff.id);
      if (assignData.class_ids.length > 0) {
        const { error } = await supabase.from('teacher_classes').insert(
          assignData.class_ids.map(cid => ({ teacher_id: selectedStaff.id, class_id: cid }))
        );
        if (error) throw error;
      }

      // Update Subjects
      await supabase.from('teacher_subjects').delete().eq('teacher_id', selectedStaff.id);
      if (assignData.subject_ids.length > 0) {
        const { error } = await supabase.from('teacher_subjects').insert(
          assignData.subject_ids.map(sid => ({ teacher_id: selectedStaff.id, subject_id: sid }))
        );
        if (error) throw error;
      }

      toast.success('Assignments updated successfully');
      setIsAssignModalOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEdit = (staffMember: Profile) => {
    setEditingStaff(staffMember);
    setFormData({
      name: staffMember.name,
      username: staffMember.username || '',
      email: staffMember.email,
      password: '',
      role: staffMember.role as 'teacher' | 'cashier' | 'exam_officer'
    });
    setIsModalOpen(true);
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete staff');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      toast.success('Staff profile deleted');
      if (editingStaff?.id === id) {
        setIsModalOpen(false);
        setEditingStaff(null);
      }
      setIsDeleteModalOpen(false);
      setStaffToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Management</h1>
          <p className="text-slate-500">Manage teachers, cashiers and exam officers accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && selectedStaffIds.length > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedStaffIds.length})
            </button>
          )}
          {canManage && (
            <button 
              onClick={() => {
              setEditingStaff(null);
              setFormData({ name: '', username: '', email: '', password: '', role: 'teacher' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Staff
          </button>
        )}
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
              <tr>
                {canManage && (
                  <th className="px-6 py-4 font-semibold">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-200 rounded transition-colors">
                      {selectedStaffIds.length === staff.length && staff.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Username</th>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !isAssignModalOpen ? (
                [1,2,3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-4"><div className="h-6 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No staff members found.</td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} className={`hover:bg-slate-50 transition-colors ${selectedStaffIds.includes(member.id) ? 'bg-blue-50/50' : ''}`}>
                    {canManage && (
                      <td className="px-6 py-4">
                        <button onClick={() => toggleSelectMember(member.id)} className="p-1 hover:bg-slate-200 rounded transition-colors">
                          {selectedStaffIds.includes(member.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          member.role === 'cashier' ? 'bg-amber-100 text-amber-600' : 
                          member.role === 'exam_officer' ? 'bg-purple-100 text-purple-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {member.name[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900">{member.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                        member.role === 'cashier' 
                        ? 'bg-amber-50 text-amber-600 border-amber-100' 
                        : member.role === 'exam_officer'
                        ? 'bg-purple-50 text-purple-600 border-purple-100'
                        : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-sm">{member.username || 'N/A'}</td>
                    <td className="px-6 py-4 text-slate-600">{member.email}</td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(member.role === 'teacher' || member.role === 'exam_officer') && (
                            <button 
                              onClick={() => openAssignModal(member)}
                              title="Manage Assignments"
                              className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                            >
                              <BookOpen className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleEdit(member)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setStaffToDelete(member.id);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">{editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Role</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'teacher'})}
                    className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      formData.role === 'teacher' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Teacher
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'cashier'})}
                    className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      formData.role === 'cashier' ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Cashier
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'exam_officer'})}
                    className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      formData.role === 'exam_officer' ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Exam Officer
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="jdoe_teacher"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="teacher@school.com"
                  />
                </div>
              </div>
              {!editingStaff && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      required
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Provide this password to the staff member for their first login.</p>
                </div>
              )}

              <div className="flex justify-between items-center mt-6">
                {editingStaff && (
                  <button
                    type="button"
                    onClick={() => {
                      setStaffToDelete(editingStaff.id);
                      setIsDeleteModalOpen(true);
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2 text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Member
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2 font-bold"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingStaff ? 'Update Account' : 'Create Account'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">Manage Assignments: {selectedStaff?.name}</h2>
              <button onClick={() => setIsAssignModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleAssignments} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Classes */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 font-bold">
                    <School className="w-5 h-5" />
                    <h3>Assigned Classes</h3>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    {classes.map(cls => (
                      <label key={cls.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={assignData.class_ids.includes(cls.id)}
                          onChange={(e) => {
                            const ids = e.target.checked 
                              ? [...assignData.class_ids, cls.id]
                              : assignData.class_ids.filter(id => id !== cls.id);
                            setAssignData({ ...assignData, class_ids: ids });
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        />
                        <span className="text-sm font-medium text-slate-700">{cls.class_name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Subjects */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-blue-600 font-bold">
                    <BookOpen className="w-5 h-5" />
                    <h3>Assigned Subjects</h3>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    {subjects.map(subject => (
                      <label key={subject.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={assignData.subject_ids.includes(subject.id)}
                          onChange={(e) => {
                            const ids = e.target.checked 
                              ? [...assignData.subject_ids, subject.id]
                              : assignData.subject_ids.filter(id => id !== subject.id);
                            setAssignData({ ...assignData, subject_ids: ids });
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-700">{subject.subject_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2 font-bold">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Assignments'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Member?</h3>
              <p className="text-slate-500 mb-6">
                This action will permanently delete this staff member and all associated data. This cannot be undone. Are you absolutely sure?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setStaffToDelete(null);
                  }}
                  className="flex-1 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => staffToDelete && handleDelete(staffToDelete)}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 disabled:opacity-70 flex items-center justify-center gap-2 font-bold"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
