import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Student, Class } from '../../types';
import { 
  Search, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  ArrowRight,
  TrendingUp,
  Filter
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Promotion() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionResults, setSessionResults] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [sourceClass, setSourceClass] = useState<string>('all');
  const [targetClass, setTargetClass] = useState<string>('');
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  useEffect(() => {
    if (profile && canManage) {
      fetchData();
    }
  }, [profile, canManage]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: settingsRes } = await supabase.from('settings').select('*').single();
      setSettings(settingsRes);

      const [studentsRes, classesRes, resultsRes] = await Promise.all([
        supabase.from('students').select('*, class:classes!class_id(*)').order('first_name', { ascending: true }),
        supabase.from('classes').select('*').order('class_name'),
        settingsRes ? supabase.from('results').select('*').eq('session', settingsRes.current_session) : Promise.resolve({ data: [] })
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (classesRes.error) throw classesRes.error;

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
      setSessionResults(resultsRes.data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleBulkPromotion = async () => {
    if (selectedStudents.length === 0) {
      toast.error('Please select at least one student to promote');
      return;
    }
    if (!targetClass) {
      toast.error('Please select a target class for promotion');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const executePromotion = async () => {
    const targetClassName = classes.find(c => c.id.toString() === targetClass)?.class_name;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ class_id: parseInt(targetClass) })
        .in('id', selectedStudents);

      if (error) throw error;

      toast.success(`${selectedStudents.length} students promoted successfully to ${targetClassName}`);
      setSelectedStudents([]);
      setTargetClass('');
      setIsConfirmModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCumulativeAverage = (studentId: number) => {
    const studentResults = sessionResults.filter(r => r.student_id === studentId);
    if (studentResults.length === 0) return 0;

    const subjects = Array.from(new Set(studentResults.map(r => r.subject_id)));
    let weightedTotal = 0;
    
    subjects.forEach(subId => {
      const term1 = studentResults.find(r => r.subject_id === subId && r.term.toLowerCase().includes('1st'));
      const term2 = studentResults.find(r => r.subject_id === subId && r.term.toLowerCase().includes('2nd'));
      const term3 = studentResults.find(r => r.subject_id === subId && r.term.toLowerCase().includes('3rd'));

      const t1 = term1 ? (term1.ca1_score + term1.ca2_score + term1.exam_score) : 0;
      const t2 = term2 ? (term2.ca1_score + term2.ca2_score + term2.exam_score) : 0;
      const t3 = term3 ? (term3.ca1_score + term3.ca2_score + term3.exam_score) : 0;

      weightedTotal += (t1 * 0.3) + (t2 * 0.3) + (t3 * 0.4);
    });

    return (weightedTotal / subjects.length).toFixed(2);
  };

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

  const filteredStudents = students.filter(s => {
    const matchesSearch = `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(search.toLowerCase());
    const matchesClass = sourceClass === 'all' || s.class_id?.toString() === sourceClass;
    return matchesSearch && matchesClass;
  });

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
          <p className="text-slate-500">Only administrators and exam officers can access the Promotion section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Student Promotion
          </h1>
          <p className="text-slate-500">Promote students from one class to another in bulk.</p>
        </div>
      </header>

      {/* Promotion Controls */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter by Current Class
          </label>
          <select
            value={sourceClass}
            onChange={(e) => {
              setSourceClass(e.target.value);
              setCurrentPage(1);
              setSelectedStudents([]);
            }}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id.toString()}>
                {c.class_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-center py-2 hidden md:flex">
          <ArrowRight className="w-8 h-8 text-slate-300" />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Promote Selected to Class
          </label>
          <div className="flex gap-3">
            <select
              value={targetClass}
              onChange={(e) => setTargetClass(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-blue-50 border border-blue-100 text-blue-900 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
            >
              <option value="">Select Target Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id.toString()}>
                  {c.class_name}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkPromotion}
              disabled={isSubmitting || selectedStudents.length === 0 || !targetClass}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all font-bold flex items-center gap-2 whitespace-nowrap"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Promote ({selectedStudents.length})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search students by name or admission number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold w-12">
                  <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-200 rounded transition-colors">
                    {selectedStudents.length === filteredStudents.length && filteredStudents.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 font-semibold">Admission No</th>
                <th className="px-6 py-4 font-semibold">Student Name</th>
                <th className="px-6 py-4 font-semibold text-center">Cumulative Avg</th>
                <th className="px-6 py-4 font-semibold">Current Class</th>
                <th className="px-6 py-4 font-semibold">Gender</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-4"><div className="h-6 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">No students found matching your criteria.</td>
                </tr>
              ) : (
                paginatedStudents.map((student) => (
                  <tr 
                    key={student.id} 
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedStudents.includes(student.id) ? 'bg-blue-50/50' : ''}`}
                    onClick={() => toggleSelectStudent(student.id)}
                  >
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelectStudent(student.id)} className="p-1 hover:bg-slate-200 rounded transition-colors">
                        {selectedStudents.includes(student.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-blue-600 font-bold">{student.admission_number}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{student.first_name} {student.last_name}</div>
                      <div className="text-xs text-slate-500">{student.middle_name}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${
                        parseFloat(getCumulativeAverage(student.id).toString()) >= 45 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-rose-100 text-rose-700'
                      }`}>
                        {getCumulativeAverage(student.id)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold border border-slate-200">
                        {student.class?.class_name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{student.gender}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-900">{filteredStudents.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredStudents.length)}</span> of <span className="font-bold text-slate-900">{filteredStudents.length}</span> students
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentPage(prev => prev - 1);
              }}
              className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage(i + 1);
                  }}
                  className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                    currentPage === i + 1 ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-white text-slate-600'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentPage(prev => prev + 1);
              }}
              className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Promotion?</h3>
              <p className="text-slate-500 mb-6">
                Are you sure you want to promote <span className="font-bold text-slate-900">{selectedStudents.length}</span> students to <span className="font-bold text-blue-600">{classes.find(c => c.id.toString() === targetClass)?.class_name}</span>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="flex-1 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={executePromotion}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center justify-center gap-2 font-bold"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
