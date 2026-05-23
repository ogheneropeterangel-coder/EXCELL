import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { 
  Users, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Save, 
  Loader2,
  Calendar,
  Filter,
  Check
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Class, Student, Attendance } from '../../types';

export default function TeacherAttendance() {
  const { profile, settings } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState<Record<number, { status: 'Present' | 'Absent', remark: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, [profile]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudentsAndAttendance();
    }
  }, [selectedClass, attendanceDate]);

  async function fetchInitialData() {
    if (!profile) return;
    try {
      // Get classes assigned to this teacher
      const { data: directClasses } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', profile.id);

      const { data: pivotClasses } = await supabase
        .from('teacher_classes')
        .select('class_id, classes(*)')
        .eq('teacher_id', profile.id);

      const allClasses = [
        ...(directClasses || []),
        ...(pivotClasses?.map(p => p.classes).filter(Boolean) || [])
      ] as Class[];

      // Unique by ID
      const uniqueClasses = Array.from(new Map(allClasses.map(c => [c.id, c])).values());
      setClasses(uniqueClasses);
      
      if (uniqueClasses.length > 0) {
        setSelectedClass(uniqueClasses[0].id.toString());
      }
    } catch (error: any) {
      toast.error('Error fetching classes: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudentsAndAttendance() {
    if (!selectedClass || !attendanceDate || !settings) return;
    setLoading(true);
    try {
      // Fetch students in class
      const { data: studentsData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', selectedClass)
        .order('last_name');

      if (studentError) throw studentError;
      setStudents(studentsData || []);

      // Fetch existing attendance for this date
      const { data: attendanceRecords, error: attendError } = await supabase
        .from('attendance')
        .select('*')
        .eq('class_id', selectedClass)
        .eq('date', attendanceDate);

      if (attendError) throw attendError;

      const dataMap: Record<number, { status: 'Present' | 'Absent', remark: string }> = {};
      
      // Initialize with default Present
      (studentsData || []).forEach(s => {
        dataMap[s.id] = { status: 'Present', remark: '' };
      });

      // Override with actual records
      (attendanceRecords || []).forEach((rec: any) => {
        dataMap[rec.student_id] = { status: rec.status, remark: rec.remark || '' };
      });

      setAttendanceData(dataMap);
    } catch (error: any) {
      toast.error('Error fetching data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleStatusChange = (studentId: number, status: 'Present' | 'Absent') => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const handleRemarkChange = (studentId: number, remark: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], remark }
    }));
  };

  const markAll = (status: 'Present' | 'Absent') => {
    const newData = { ...attendanceData };
    filteredStudents.forEach(s => {
      newData[s.id] = { ...newData[s.id], status };
    });
    setAttendanceData(newData);
    toast.success(`All filtered students marked as ${status}`);
  };

  async function handleSave() {
    if (!selectedClass || !attendanceDate || !settings) return;
    setSaving(true);
    try {
      const records = Object.entries(attendanceData).map(([studentId, data]) => ({
        student_id: parseInt(studentId),
        class_id: parseInt(selectedClass),
        date: attendanceDate,
        status: data.status,
        remark: data.remark,
        term: settings.current_term,
        session: settings.current_session
      }));

      const { error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'student_id,date' });

      if (error) throw error;
      toast.success('Attendance saved successfully');
    } catch (error: any) {
      toast.error('Error saving attendance: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredStudents = students.filter(s => 
    `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && classes.length === 0) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Attendance</h1>
          <p className="text-slate-500">Record and track student attendance for your classes.</p>
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
            onClick={handleSave}
            disabled={saving || students.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 transition-all active:scale-95"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Attendance
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" /> Select Class
            </h3>
            <div className="space-y-2">
              {classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls.id.toString())}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    selectedClass === cls.id.toString()
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cls.class_name}
                </button>
              ))}
              {classes.length === 0 && <p className="text-xs text-slate-400 italic">No classes assigned</p>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => markAll('Present')}
                className="flex flex-col items-center gap-2 p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase">All Present</span>
              </button>
              <button
                onClick={() => markAll('Absent')}
                className="flex flex-col items-center gap-2 p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors"
              >
                <XCircle className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase">All Absent</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search students by name or admission number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all"
            />
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
                      <th className="text-left px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Reason for Absence / Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-bold">
                              {student.first_name[0]}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{student.first_name} {student.last_name}</p>
                              <p className="text-xs text-slate-400 font-mono">{student.admission_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleStatusChange(student.id, 'Present')}
                              className={`p-2 rounded-lg transition-all ${
                                attendanceData[student.id]?.status === 'Present'
                                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                              title="Mark Present"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(student.id, 'Absent')}
                              className={`p-2 rounded-lg transition-all ${
                                attendanceData[student.id]?.status === 'Absent'
                                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-200'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                              title="Mark Absent"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            placeholder={attendanceData[student.id]?.status === 'Absent' ? "Reason for absence..." : "Enter remarks..."}
                            value={attendanceData[student.id]?.remark || ''}
                            onChange={(e) => handleRemarkChange(student.id, e.target.value)}
                            className={`w-full px-4 py-2 text-sm border rounded-xl outline-none focus:ring-2 transition-all ${
                              attendanceData[student.id]?.status === 'Absent'
                                ? 'border-rose-100 bg-rose-50 focus:ring-rose-200'
                                : 'border-slate-100 bg-slate-50 focus:ring-blue-200'
                            }`}
                          />
                        </td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">
                          No students found in this class.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
