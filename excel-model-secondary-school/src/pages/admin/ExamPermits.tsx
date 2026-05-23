import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { 
  Printer, 
  Search, 
  Loader2, 
  School, 
  GraduationCap, 
  Calendar,
  User,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

export default function ExamPermits() {
  const { profile, settings } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'exam_officer';

  if (!canManage && profile) {
    return <Navigate to="/teacher" replace />;
  }

  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingStudents, setFetchingStudents] = useState(false);
  const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  async function fetchClasses() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('class_name');
      if (error) throw error;
      setClasses(data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents() {
    if (!selectedClass) {
      toast.error('Please select a class first');
      return;
    }
    setFetchingStudents(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*, class:classes(*)')
        .eq('class_id', selectedClass)
        .order('first_name');
      if (error) throw error;
      setStudents(data || []);
      if (data?.length === 0) {
        toast.info('No students found in this class');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFetchingStudents(false);
    }
  }

  const handlePrint = () => {
    setPrintingStudentId(null);
    setTimeout(() => window.print(), 100);
  };

  const handlePrintIndividual = (studentId: string) => {
    setPrintingStudentId(studentId);
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Exam Permits</h1>
          <p className="text-slate-500 mt-1">Generate and print examination permits for students.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 text-sm font-bold">
            {settings?.current_term} Term | {settings?.current_session} Session
          </div>
        </div>
      </header>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-end gap-4 no-print">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Select Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Select Class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
          </select>
        </div>
        <button 
          onClick={fetchStudents}
          disabled={fetchingStudents || !selectedClass}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {fetchingStudents ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Load Students
        </button>
        {students.length > 0 && (
          <button 
            onClick={handlePrint}
            className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print All Permits
          </button>
        )}
      </div>

      {/* Permits Container */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 print:block ${printingStudentId ? 'printing-single' : ''}`} ref={printRef}>
        {students.map((student, index) => (
          <div 
            key={student.id} 
            className={`bg-white border-2 border-slate-200 rounded-3xl overflow-hidden shadow-sm print:shadow-none print:border-slate-300 print:mb-8 print:break-inside-avoid relative group transition-all hover:border-blue-200 ${printingStudentId && printingStudentId !== student.id ? 'print:hidden' : ''}`}
            style={{ minHeight: '350px' }}
          >
            {/* Print Individual Button - Only visible in UI */}
            <div className="absolute top-4 right-4 z-20 no-print opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handlePrintIndividual(student.id)}
                className="bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-xl border border-slate-100 text-blue-600 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
              >
                <Printer className="w-4 h-4" />
                Print Individual
              </button>
            </div>

            {/* Watermark */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
              <GraduationCap className="w-64 h-64 rotate-[-15deg]" />
            </div>

            {/* Header */}
            <div className="bg-slate-900 text-white p-6 flex items-center gap-4">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center p-2 shadow-lg">
                {settings?.school_logo_url ? (
                  <img src={settings.school_logo_url} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <School className="w-10 h-10 text-blue-600" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-black uppercase tracking-tight leading-tight">{settings?.school_name}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{settings?.school_motto}</p>
              </div>
              <div className="text-right">
                <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                  Exam Permit
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-8 space-y-6 relative z-10">
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 bg-slate-100 rounded-2xl border-2 border-slate-200 flex items-center justify-center text-slate-300">
                  <User className="w-12 h-12" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Name</p>
                    <p className="text-xl font-black text-slate-900 uppercase">{student.first_name} {student.last_name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admission No</p>
                      <p className="text-sm font-bold text-slate-900 font-mono">{student.admission_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Class</p>
                      <p className="text-sm font-bold text-slate-900">{student.class?.class_name}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Session</p>
                    <p className="text-xs font-bold text-slate-700">{settings?.current_session}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Term</p>
                    <p className="text-xs font-bold text-slate-700">{settings?.current_term} Term</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex flex-col">
                <div className="w-24 h-8 border-b border-slate-300"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase mt-1">Principal's Signature</span>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold text-slate-400 uppercase">Generated On</p>
                <p className="text-[10px] font-mono text-slate-500">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {students.length === 0 && !fetchingStudents && (
        <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-4 no-print">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">No Students Selected</h3>
            <p className="text-slate-500 max-w-xs mx-auto">Select a class and click "Load Students" to generate examination permits.</p>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .max-w-7xl { max-width: none !important; }
          .print\\:block { display: block !important; }
          .print\\:mb-8 { margin-bottom: 2rem !important; }
          .print\\:break-inside-avoid { break-inside: avoid !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-slate-300 { border-color: #cbd5e1 !important; }
          .printing-single .print\\:hidden { display: none !important; }
        }
      `}} />
    </div>
  );
}
