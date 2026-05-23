import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Class, Profile, Subject } from '../../types';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  Loader2,
  School,
  BookOpen,
  User,
  Square,
  CheckSquare
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function Classes() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;

  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isAssignTeachersModalOpen, setIsAssignTeachersModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);

  const [editingClass, setEditingClass] = useState<Class | null>(null);

  const [formData, setFormData] = useState({
    class_name: '',
    teacher_id: '',
    category: 'Junior' as 'Junior' | 'Senior'
  });

  const [assignData, setAssignData] = useState({
    subject_ids: [] as number[],
    teacher_ids: [] as string[],
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [classesRes, teachersRes, subjectsRes] = await Promise.all([
        supabase.from('classes').select('*, teacher:profiles!teacher_id(*)').order('class_name'),
        supabase.from('profiles').select('*').eq('role', 'teacher').order('name'),
        supabase.from('subjects').select('*').order('subject_name'),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (teachersRes.error) throw teachersRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setClasses(classesRes.data || []);
      setTeachers(teachersRes.data || []);
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
      toast.error('Only administrators and exam officers can manage classes');
      return;
    }
    setIsSubmitting(true);

    try {
      if (editingClass) {
        const { error } = await supabase
          .from('classes')
          .update({
            class_name: formData.class_name,
            teacher_id: formData.teacher_id || null,
            category: formData.category
          })
          .eq('id', editingClass.id);
        if (error) throw error;
        toast.success('Class updated successfully');
      } else {
        const { error } = await supabase.from('classes').insert([{
          class_name: formData.class_name,
          teacher_id: formData.teacher_id || null,
          category: formData.category
        }]);
        if (error) throw error;
        toast.success('Class created successfully');
      }

      setIsModalOpen(false);
      setEditingClass(null);
      setFormData({ class_name: '', teacher_id: '', category: 'Junior' });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkDelete() {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete classes');
      return;
    }
    if (selectedClassIds.length === 0) return;
    if (!confirm(`This action will permanently delete ${selectedClassIds.length} classes and all associated student assignments. This cannot be undone. Are you absolutely sure you want to proceed?`)) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('classes').delete().in('id', selectedClassIds);
      if (error) throw error;
      toast.success(`${selectedClassIds.length} classes deleted`);
      setSelectedClassIds([]);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const toggleSelectAll = () => {
    if (selectedClassIds.length === classes.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(classes.map(c => c.id));
    }
  };

  const toggleSelectClass = (id: number) => {
    if (selectedClassIds.includes(id)) {
      setSelectedClassIds(selectedClassIds.filter(cid => cid !== id));
    } else {
      setSelectedClassIds([...selectedClassIds, id]);
    }
  };

  async function handleAssignSubjects(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) {
      toast.error('Only administrators and exam officers can assign subjects to classes');
      return;
    }
    if (!selectedClass) return;
    setIsSubmitting(true);

    try {
      // 1. Delete existing assignments
      await supabase.from('class_subjects').delete().eq('class_id', selectedClass.id);

      // 2. Insert new assignments
      const assignments = assignData.subject_ids.map(sid => ({
        class_id: selectedClass.id,
        subject_id: sid
      }));

      if (assignments.length > 0) {
        const { error } = await supabase.from('class_subjects').insert(assignments);
        if (error) throw error;
      }

      toast.success('Subjects assigned successfully');
      setIsAssignModalOpen(false);
      setSelectedClass(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<number | null>(null);

  async function deleteClass(id: number) {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete classes');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Class deleted successfully');
      if (editingClass?.id === id) {
        setIsModalOpen(false);
        setEditingClass(null);
      }
      setIsDeleteModalOpen(false);
      setClassToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEdit = (cls: Class) => {
    setEditingClass(cls);
    setFormData({
      class_name: cls.class_name,
      teacher_id: cls.teacher_id || '',
      category: cls.category || 'Junior',
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingClass(null);
    setFormData({ class_name: '', teacher_id: '', category: 'Junior' });
    setIsModalOpen(true);
  };

  async function openAssignModal(cls: Class) {
    setSelectedClass(cls);
    const { data } = await supabase.from('class_subjects').select('subject_id').eq('class_id', cls.id);
    setAssignData({
      ...assignData,
      subject_ids: data?.map(d => d.subject_id) || []
    });
    setIsAssignModalOpen(true);
  }

  async function openAssignTeachersModal(cls: Class) {
    setSelectedClass(cls);
    const { data } = await supabase.from('teacher_classes').select('teacher_id').eq('class_id', cls.id);
    setAssignData({
      ...assignData,
      teacher_ids: data?.map(d => d.teacher_id) || []
    });
    setIsAssignTeachersModalOpen(true);
  }

  async function handleAssignTeachers(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) {
      toast.error('Only administrators and exam officers can assign teachers to classes');
      return;
    }
    if (!selectedClass) return;
    setIsSubmitting(true);

    try {
      // 1. Delete existing assignments
      await supabase.from('teacher_classes').delete().eq('class_id', selectedClass.id);

      // 2. Insert new assignments
      const assignments = assignData.teacher_ids.map(tid => ({
        class_id: selectedClass.id,
        teacher_id: tid
      }));

      if (assignments.length > 0) {
        const { error } = await supabase.from('teacher_classes').insert(assignments);
        if (error) throw error;
      }

      toast.success('Teachers assigned successfully');
      setIsAssignTeachersModalOpen(false);
      setSelectedClass(null);
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
          <h1 className="text-2xl font-bold text-slate-900">Classes Management</h1>
          <p className="text-slate-500">Organize grade levels and assign teachers.</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && selectedClassIds.length > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedClassIds.length})
            </button>
          )}
          {canManage && classes.length > 0 && (
            <button 
              onClick={toggleSelectAll}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
            >
              {selectedClassIds.length === classes.length ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
              {selectedClassIds.length === classes.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          {canManage && (
            <button 
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Class
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-48 bg-white rounded-2xl animate-pulse border border-slate-100"></div>)
        ) : classes.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-100">No classes found.</div>
        ) : (
          classes.map((cls) => (
            <div 
              key={cls.id} 
              onClick={() => canManage && toggleSelectClass(cls.id)}
              className={`bg-white p-6 rounded-2xl shadow-sm border ${selectedClassIds.includes(cls.id) ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10' : 'border-slate-100'} hover:shadow-md transition-all group relative cursor-pointer`}
            >
              {canManage && (
                <div className="absolute top-4 left-4 z-10">
                  {selectedClassIds.includes(cls.id) ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                  )}
                </div>
              )}
              <div className="flex items-start justify-between mb-4 pl-8">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <School className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {canManage && (
                    <>
                      <button 
                        onClick={() => handleEdit(cls)}
                        className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Edit Class"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setClassToDelete(cls.id);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete Class"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">{cls.class_name}</h3>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  cls.category === 'Senior' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {cls.category || 'Junior'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
                <User className="w-4 h-4" />
                <span>Teacher: {cls.teacher?.name || 'Not assigned'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => openAssignModal(cls)}
                  className="py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  Subjects
                </button>
                <button 
                  onClick={() => openAssignTeachersModal(cls)}
                  className="py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <User className="w-4 h-4" />
                  Teachers
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Class Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingClass ? `Edit Class: ${editingClass.class_name}` : 'Add New Class'}
              </h2>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingClass(null);
                }} 
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Class Name</label>
                <input
                  required
                  type="text"
                  value={formData.class_name}
                  onChange={(e) => setFormData({...formData, class_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. JSS1A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Class Teacher</label>
                <select
                  value={formData.teacher_id}
                  onChange={(e) => setFormData({...formData, teacher_id: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select Teacher</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Junior', 'Senior'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData({...formData, category: cat as any})}
                      className={`py-2 px-4 rounded-xl border text-sm font-bold transition-all ${
                        formData.category === cat 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center mt-6">
                {editingClass && (
                  <button
                    type="button"
                    onClick={() => {
                      setClassToDelete(editingClass.id);
                      setIsDeleteModalOpen(true);
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2 text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Class
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingClass(null);
                    }} 
                    className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2 font-bold">
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingClass ? 'Update Class' : 'Save Class'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Subjects Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">Assign Subjects to {selectedClass?.class_name}</h2>
              <button onClick={() => setIsAssignModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleAssignSubjects} className="p-6 space-y-4">
              <div className="max-h-64 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
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
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update Assignments
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Assign Teachers Modal */}
      {isAssignTeachersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">Assign Teachers to {selectedClass?.class_name}</h2>
              <button onClick={() => setIsAssignTeachersModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleAssignTeachers} className="p-6 space-y-4">
              <div className="max-h-64 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                {teachers.map(teacher => (
                  <label key={teacher.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={assignData.teacher_ids.includes(teacher.id)}
                      onChange={(e) => {
                        const ids = e.target.checked 
                          ? [...assignData.teacher_ids, teacher.id]
                          : assignData.teacher_ids.filter(id => id !== teacher.id);
                        setAssignData({ ...assignData, teacher_ids: ids });
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{teacher.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAssignTeachersModalOpen(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2 font-bold">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update Teachers
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Class?</h3>
              <p className="text-slate-500 mb-6">
                This action will permanently delete this class and all associated student assignments. This cannot be undone. Are you absolutely sure you want to proceed?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setClassToDelete(null);
                  }}
                  className="flex-1 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => classToDelete && deleteClass(classToDelete)}
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
