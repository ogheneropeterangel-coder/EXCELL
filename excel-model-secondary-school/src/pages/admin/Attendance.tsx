import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Calendar,
  Filter,
  Download,
  Loader2
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Class, Student, Attendance } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function AdminAttendance() {
  const { profile } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'exam_officer';

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  if (!canManage && profile) {
    return <Navigate to="/teacher" replace />;
  }

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [selectedClass, attendanceDate]);

  async function fetchInitialData() {
    try {
      const { data: classesData } = await supabase.from('classes').select('*').order('class_name');
      setClasses(classesData || []);
    } catch (error: any) {
      toast.error('Error fetching classes: ' + error.message);
    }
  }

  async function fetchAttendance() {
    setLoading(true);
    try {
      let query = supabase.from('attendance').select('*, student:students(first_name, last_name, admission_number)').eq('date', attendanceDate);
      
      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAttendanceRecords(data || []);
    } catch (error: any) {
      toast.error('Error fetching attendance: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredRecords = attendanceRecords.filter(r => {
    const student = (r as any).student;
    const name = `${student?.first_name} ${student?.last_name} ${student?.admission_number}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  const stats = {
    total: attendanceRecords.length,
    present: attendanceRecords.filter(r => r.status === 'Present').length,
    absent: attendanceRecords.filter(r => r.status === 'Absent').length
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Records</h1>
          <p className="text-slate-500">View and monitor student attendance across the school.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="text-sm font-medium outline-none bg-transparent"
            />
          </div>
          <button
            onClick={() => {
              // Export CSV logic could go here
              toast.success('Feature coming soon');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Total Logged</p>
            <p className="text-2xl font-black text-slate-900">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Present</p>
            <p className="text-2xl font-black text-slate-900">{stats.present}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="bg-rose-100 p-3 rounded-xl text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Absent</p>
            <p className="text-2xl font-black text-slate-900">{stats.absent}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-64">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          >
            <option value="all">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.class_name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                  <th className="text-center px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Remarks / Reason</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Logged At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRecords.map(record => {
                  const student = (record as any).student;
                  const date = new Date(record.created_at).toLocaleString();
                  
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-bold">
                            {student?.first_name?.[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{student?.first_name} {student?.last_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{student?.admission_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                          record.status === 'Present' 
                            ? 'bg-emerald-50 text-emerald-600' 
                            : 'bg-rose-50 text-rose-600'
                        }`}>
                          {record.status === 'Present' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {record.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 italic">
                          {record.remark || <span className="text-slate-300">No remarks</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                        {date}
                      </td>
                    </tr>
                  );
                })}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                      No attendance records found for this date/class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
