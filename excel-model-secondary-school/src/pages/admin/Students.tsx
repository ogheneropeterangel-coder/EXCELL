import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Student, Class, Profile } from '../../types';
import { 
  Plus, 
  Search, 
  Upload, 
  Download, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  X,
  Loader2,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  User,
  UserRound,
  BookOpen,
  School,
  ClipboardList
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { generateAdmissionNumber } from '../../lib/utils';
import Papa from 'papaparse';
import { useAuth } from '../../context/AuthContext';

export default function Students() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    gender: 'Male' as const,
    class_id: '',
    admission_number: '',
    parent_name: '',
    parent_contact: '',
    address: '',
  });

  useEffect(() => {
    if (profile) {
      fetchData();
    }
  }, [profile]);

  async function fetchData() {
    try {
      let studentsQuery = supabase.from('students').select('*, class:classes!class_id(*)').order('first_name', { ascending: true }).order('last_name', { ascending: true });
      let classesQuery = supabase.from('classes').select('*').order('class_name');
      let teachersQuery = supabase.from('profiles').select('*').eq('role', 'teacher').order('name');

      if (profile?.role === 'teacher') {
        // Fetch teacher's assigned classes
        // 1. Direct Form Teacher assignment
        const { data: directClasses } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', profile.id);

        // 2. Assignment via teacher_classes pivot table
        const { data: assignedClasses } = await supabase
          .from('teacher_classes')
          .select('class_id')
          .eq('teacher_id', profile.id);

        // 3. Assignment via subjects taught in classes
        const { data: teacherSubjects } = await supabase
          .from('teacher_subjects')
          .select('subject_id')
          .eq('teacher_id', profile.id);
        
        const teacherSubjectIds = teacherSubjects?.map(ts => ts.subject_id) || [];
        
        let subjectClassIds: number[] = [];
        if (teacherSubjectIds.length > 0) {
          const { data: scData } = await supabase
            .from('class_subjects')
            .select('class_id')
            .in('subject_id', teacherSubjectIds);
          subjectClassIds = scData?.map(cs => cs.class_id) || [];
        }

        const classIds = Array.from(new Set([
          ...(directClasses?.map(c => c.id) || []),
          ...(assignedClasses?.map(c => c.class_id) || []),
          ...subjectClassIds
        ]));

        if (classIds.length > 0) {
          studentsQuery = studentsQuery.in('class_id', classIds);
          classesQuery = classesQuery.in('id', classIds);
        } else {
          // If no classes assigned, return empty list
          setStudents([]);
          setClasses([]);
          setTeachers([]);
          setLoading(false);
          return;
        }
      }

      const [studentsRes, classesRes, teachersRes] = await Promise.all([
        studentsQuery,
        classesQuery,
        teachersQuery
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (classesRes.error) throw classesRes.error;
      if (teachersRes.error) throw teachersRes.error;

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
      setTeachers(teachersRes.data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingStudent) {
        const { error } = await supabase
          .from('students')
          .update({
            ...formData,
            class_id: formData.class_id ? parseInt(formData.class_id) : null,
          })
          .eq('id', editingStudent.id);

        if (error) throw error;
        toast.success('Student updated successfully');
      } else {
        const { error } = await supabase.from('students').insert([{
          ...formData,
          class_id: formData.class_id ? parseInt(formData.class_id) : null,
        }]);

        if (error) throw error;
        toast.success('Student added successfully');
      }

      setIsModalOpen(false);
      setEditingStudent(null);
      setFormData({
        first_name: '',
        last_name: '',
        middle_name: '',
        gender: 'Male',
        class_id: '',
        admission_number: '',
        parent_name: '',
        parent_contact: '',
        address: '',
      });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      first_name: student.first_name,
      last_name: student.last_name,
      middle_name: student.middle_name || '',
      gender: student.gender as any,
      class_id: student.class_id?.toString() || '',
      admission_number: student.admission_number || '',
      parent_name: student.parent_name || '',
      parent_contact: student.parent_contact || '',
      address: student.address || '',
    });
    setIsModalOpen(true);
  };

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];
        setIsSubmitting(true);

        const normalizeGender = (g: any): 'Male' | 'Female' | 'Other' => {
          if (!g) return 'Male';
          const clean = g.toString().trim().toLowerCase();
          if (clean === 'm' || clean === 'male') return 'Male';
          if (clean === 'f' || clean === 'female') return 'Female';
          if (clean === 'o' || clean === 'other') return 'Other';
          
          const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
          if (cap === 'Male' || cap === 'Female' || cap === 'Other') {
            return cap as 'Male' | 'Female' | 'Other';
          }
          return 'Male';
        };

        const getRowValue = (row: any, keys: string[]): string => {
          const foundKey = Object.keys(row).find(k => {
            const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            return keys.some(targetKey => {
              const cleanTarget = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
              return cleanKey === cleanTarget || cleanKey.includes(cleanTarget);
            });
          });
          return foundKey ? row[foundKey]?.toString().trim() || '' : '';
        };

        try {
          const studentsToInsert = data
            .map(row => {
              const fName = getRowValue(row, ['firstname', 'first', 'fname']);
              const lName = getRowValue(row, ['lastname', 'last', 'lname', 'surname']);
              const mName = getRowValue(row, ['middlename', 'middle', 'mname']);
              const genderRaw = getRowValue(row, ['gender', 'sex']);
              const admNum = getRowValue(row, ['admissionnumber', 'admissionno', 'admission', 'admno', 'adm']);
              const pName = getRowValue(row, ['parentname', 'parent', 'guardian']);
              const pContact = getRowValue(row, ['parentcontact', 'parentphone', 'parentno', 'guardianphone']);
              const addr = getRowValue(row, ['address']);

              return {
                first_name: fName,
                last_name: lName,
                middle_name: mName || '',
                gender: normalizeGender(genderRaw),
                admission_number: admNum || generateAdmissionNumber(),
                parent_name: pName || '',
                parent_contact: pContact || '',
                address: addr || '',
              };
            })
            .filter(student => student.first_name && student.last_name);

          if (studentsToInsert.length === 0) {
            throw new Error('No valid student records found in the CSV (make sure columns for first name and last name are present and filled)');
          }

          const { error } = await supabase.from('students').insert(studentsToInsert);
          if (error) throw error;

          toast.success(`${studentsToInsert.length} students uploaded successfully`);
          setIsBulkModalOpen(false);
          fetchData();
        } catch (error: any) {
          toast.error(error.message);
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  const downloadTemplate = () => {
    const headers = ['admission_number', 'first_name', 'last_name', 'middle_name', 'gender', 'parent_name', 'parent_contact', 'address'];
    const csv = headers.join(',') + '\nADM/2024/001,John,Doe,Smith,Male,Jane Doe,08012345678,123 School Road';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'student_template.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExport = () => {
    const dataToExport = filteredStudents.map(s => ({
      'Admission Number': s.admission_number,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      'Middle Name': s.middle_name || '',
      'Gender': s.gender,
      'Class': s.class?.class_name || 'Unassigned',
      'Parent Name': s.parent_name || '',
      'Parent Contact': s.parent_contact || '',
      'Address': s.address || ''
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = selectedClass === 'all' ? 'all_students.csv' : `students_${classes.find(c => c.id.toString() === selectedClass)?.class_name || 'class'}.csv`;
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<number | null>(null);

  async function deleteStudent(id: number) {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete students');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      toast.success('Student deleted');
      if (editingStudent?.id === id) {
        setIsModalOpen(false);
        setEditingStudent(null);
      }
      setIsDeleteModalOpen(false);
      setStudentToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkDelete() {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete students');
      return;
    }
    if (selectedStudents.length === 0) return;
    if (!confirm(`This action will permanently delete ${selectedStudents.length} students. This cannot be undone. Are you absolutely sure you want to proceed?`)) return;

    try {
      const { error } = await supabase.from('students').delete().in('id', selectedStudents);
      if (error) throw error;
      toast.success(`${selectedStudents.length} students deleted`);
      setSelectedStudents([]);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(s => s.id));
    }
  };

  const toggleSelectStudent = (id: number) => {
    if (selectedStudents.includes(id)) {
      setSelectedStudents(selectedStudents.filter(sid => sid !== id));
    } else {
      setSelectedStudents([...selectedStudents, id]);
    }
  };

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const handleViewDetail = async (student: Student) => {
    setSelectedStudentForDetail(student);
    setIsDetailModalOpen(true);
    setLoadingResults(true);
    try {
      const { data, error } = await supabase
        .from('results')
        .select('*, subject:subjects(*)')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setStudentResults(data || []);
    } catch (error: any) {
      toast.error('Failed to fetch student results');
    } finally {
      setLoadingResults(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(search.toLowerCase());
    const matchesClass = selectedClass === 'all' || s.class_id?.toString() === selectedClass;
    return matchesSearch && matchesClass;
  });

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Students Management</h1>
          <p className="text-slate-500">Manage student records and admissions.</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && selectedStudents.length > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedStudents.length})
            </button>
          )}
          {canManage && (
            <>
              <button 
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Bulk Upload
              </button>
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Bulk Export
              </button>
              <button 
                onClick={() => {
                  setEditingStudent(null);
                  setFormData({
                    first_name: '',
                    last_name: '',
                    middle_name: '',
                    gender: 'Male',
                    class_id: '',
                    admission_number: '',
                    parent_name: '',
                    parent_contact: '',
                    address: '',
                  });
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors font-bold"
              >
                <Plus className="w-4 h-4" />
                Add Student
              </button>
            </>
          )}
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or admission number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div className="w-full md:w-48">
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id.toString()}>
                  {c.class_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
              <tr>
                {canManage && (
                  <th className="px-6 py-4 font-semibold">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-200 rounded transition-colors">
                      {selectedStudents.length === filteredStudents.length && filteredStudents.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-6 py-4 font-semibold">Admission No</th>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Class</th>
                <th className="px-6 py-4 font-semibold">Gender</th>
                <th className="px-6 py-4 font-semibold">Parent Contact</th>
                {canManage && <th className="px-6 py-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-4"><div className="h-6 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">No students found.</td>
                </tr>
              ) : (
                paginatedStudents.map((student) => (
                  <tr key={student.id} className={`hover:bg-slate-50 transition-colors ${selectedStudents.includes(student.id) ? 'bg-blue-50/50' : ''}`}>
                    {canManage && (
                      <td className="px-6 py-4">
                        <button onClick={() => toggleSelectStudent(student.id)} className="p-1 hover:bg-slate-200 rounded transition-colors">
                          {selectedStudents.includes(student.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4 font-mono text-sm text-blue-600 font-semibold">{student.admission_number}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleViewDetail(student)}
                        className="text-left group"
                      >
                        <div className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">{student.first_name} {student.last_name}</div>
                        <div className="text-xs text-slate-500">{student.middle_name}</div>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                        {student.class?.class_name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{student.gender}</td>
                    <td className="px-6 py-4 text-slate-600">{student.parent_contact}</td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleEdit(student)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setStudentToDelete(student.id);
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

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredStudents.length)}</span> of <span className="font-bold text-slate-900">{filteredStudents.length}</span> students
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                    currentPage === i + 1 ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-white text-slate-600'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Student Detail Modal */}
      {isDetailModalOpen && selectedStudentForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">Student Profile</h2>
              <button onClick={() => setIsDetailModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Personal Info */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Personal Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Full Name</p>
                          <p className="text-slate-900 font-bold">{selectedStudentForDetail.first_name} {selectedStudentForDetail.middle_name} {selectedStudentForDetail.last_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
                          <CheckSquare className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Admission Number</p>
                          <p className="text-slate-900 font-mono font-bold">{selectedStudentForDetail.admission_number}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                          <School className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Class</p>
                          <p className="text-slate-900 font-bold">{selectedStudentForDetail.class?.class_name || 'Unassigned'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center text-pink-600 shrink-0">
                          <Square className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Gender</p>
                          <p className="text-slate-900 font-bold">{selectedStudentForDetail.gender}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Contact Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shrink-0">
                          <UserRound className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Parent/Guardian Name</p>
                          <p className="text-slate-900 font-bold">{selectedStudentForDetail.parent_name || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                          <ClipboardList className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Parent Contact</p>
                          <p className="text-slate-900 font-bold">{selectedStudentForDetail.parent_contact || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 shrink-0">
                          <Edit2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Address</p>
                          <p className="text-slate-900 font-bold text-sm">{selectedStudentForDetail.address || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Academic Results */}
                <div className="flex flex-col">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Academic Performance</h3>
                  <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 p-4 overflow-y-auto max-h-[400px]">
                    {loadingResults ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <p className="text-xs font-medium">Loading results...</p>
                      </div>
                    ) : studentResults.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 italic py-12">
                        <BookOpen className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">No results recorded yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {studentResults.map((result) => (
                          <div key={result.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-sm font-bold text-slate-900">{result.subject?.subject_name}</p>
                                <p className="text-[10px] text-slate-400 font-black uppercase">{result.term} Term - {result.session}</p>
                              </div>
                              <div className={`px-2 py-1 rounded-lg text-xs font-black ${
                                result.total_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                                result.total_score >= 50 ? 'bg-blue-100 text-blue-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                {result.total_score}%
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-slate-500">
                              <div className="bg-slate-50 p-1 rounded text-center">CA1: {result.ca1_score}</div>
                              <div className="bg-slate-50 p-1 rounded text-center">CA2: {result.ca2_score}</div>
                              <div className="bg-slate-50 p-1 rounded text-center">EXAM: {result.exam_score}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">{editingStudent ? 'Edit Student' : 'Add New Student'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Admission Number</label>
                <input
                  required
                  type="text"
                  value={formData.admission_number}
                  onChange={(e) => setFormData({...formData, admission_number: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. ADM/2024/001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                <input
                  required
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                <input
                  required
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Middle Name</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => setFormData({...formData, middle_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
                <select
                  value={formData.class_id}
                  onChange={(e) => setFormData({...formData, class_id: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select Class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Parent Name</label>
                <input
                  type="text"
                  value={formData.parent_name}
                  onChange={(e) => setFormData({...formData, parent_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Parent Contact</label>
                <input
                  type="text"
                  value={formData.parent_contact}
                  onChange={(e) => setFormData({...formData, parent_contact: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                ></textarea>
              </div>
              <div className="md:col-span-2 flex justify-between items-center mt-4">
                {editingStudent && canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentToDelete(editingStudent.id);
                      setIsDeleteModalOpen(true);
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2 text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Student
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
                    {editingStudent ? 'Update Student' : 'Save Student'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">Bulk Upload Students</h2>
              <button onClick={() => setIsBulkModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Upload CSV File</h3>
              <p className="text-sm text-slate-500 mb-6">
                Your CSV should have headers: first_name, last_name, middle_name, gender, parent_name, parent_contact, address.
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center justify-center gap-2 text-sm text-blue-600 font-bold hover:underline mb-2"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
                
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleBulkUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  Select CSV File
                </button>
              </div>
              
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="mt-4 text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
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
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Student?</h3>
              <p className="text-slate-500 mb-6">
                This action will permanently delete this student. This cannot be undone. Are you absolutely sure you want to proceed?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setStudentToDelete(null);
                  }}
                  className="flex-1 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => studentToDelete && deleteStudent(studentToDelete)}
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
