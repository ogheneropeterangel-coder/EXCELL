import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Student, Class, Subject, Settings } from '../../types';
import { 
  Search, 
  Printer, 
  Loader2,
  GraduationCap,
  Trophy,
  User,
  Calendar,
  BookOpen,
  TrendingUp,
  FileText,
  BadgeCheck,
  CheckCircle2
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function Transcript() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [classSubjects, setClassSubjects] = useState<Subject[]>([]);
  const [cumulativeResults, setCumulativeResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingResults, setFetchingResults] = useState(false);
  
  // Transfer-specific states
  const [reasonForLeaving, setReasonForLeaving] = useState('Transfer to another institution');
  const [conductRecord, setConductRecord] = useState('Satisfactory');
  const [principalComment, setPrincipalComment] = useState('He/She was an disciplined and hardworking student. Recommended for admission.');
  
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    if (profile) {
      fetchInitialData();
    }
  }, [profile]);

  async function fetchInitialData() {
    try {
      const [classesRes, settingsRes] = await Promise.all([
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('settings').select('*').single()
      ]);
      setClasses(classesRes.data || []);
      setSettings(settingsRes.data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents(classId: string) {
    setSelectedClass(classId);
    setSelectedStudent(null);
    setCumulativeResults([]);
    
    if (!classId) return;

    try {
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('last_name');
      
      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      const { data: classSubjectsData, error: classSubjectsError } = await supabase
        .from('class_subjects')
        .select('subject_id, subjects(*)')
        .eq('class_id', classId);
      
      if (classSubjectsError) throw classSubjectsError;

      const subjectsForClass = (classSubjectsData || []).map(d => {
        const sub = Array.isArray(d.subjects) ? d.subjects[0] : d.subjects;
        return sub as unknown as Subject;
      }).filter(Boolean) || [];

      setClassSubjects(subjectsForClass);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function fetchTranscriptData(student: Student) {
    setSelectedStudent(student);
    setFetchingResults(true);
    try {
      const { data: allResults, error } = await supabase
        .from('results')
        .select('*, subjects(subject_name)')
        .eq('student_id', student.id)
        .eq('session', settings?.current_session);

      if (error) throw error;

      const cumulative = classSubjects.map(subject => {
        const firstTerm = allResults?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('1st'));
        const secondTerm = allResults?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('2nd'));
        const thirdTerm = allResults?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('3rd'));

        const firstTermScore = firstTerm ? (firstTerm.ca1_score + firstTerm.ca2_score + firstTerm.exam_score) : 0;
        const secondTermScore = secondTerm ? (secondTerm.ca1_score + secondTerm.ca2_score + secondTerm.exam_score) : 0;
        const thirdTermScore = thirdTerm ? (thirdTerm.ca1_score + thirdTerm.ca2_score + thirdTerm.exam_score) : 0;

        // Weighted calculation: 30% First, 30% Second, 40% Third
        const cumulativeTotal = (firstTermScore * 0.3) + (secondTermScore * 0.3) + (thirdTermScore * 0.4);

        return {
          subject_id: subject.id,
          subject_name: subject.subject_name,
          first_term: firstTermScore,
          second_term: secondTermScore,
          third_term: thirdTermScore,
          cumulative: cumulativeTotal,
          has_result: firstTermScore > 0 || secondTermScore > 0 || thirdTermScore > 0
        };
      }).filter(r => r.has_result);

      setCumulativeResults(cumulative);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFetchingResults(false);
    }
  }

  const calculateCumulativeTotal = () => cumulativeResults.reduce((acc, curr) => acc + curr.cumulative, 0);
  const calculateCumulativeAverage = () => {
    if (cumulativeResults.length === 0) return '0.00';
    return (calculateCumulativeTotal() / cumulativeResults.length).toFixed(2);
  };

  const getRemark = (score: number) => {
    if (score >= 75) return 'Excellent';
    if (score >= 70) return 'Very Good';
    if (score >= 65) return 'Good';
    if (score >= 60) return 'Credit';
    if (score >= 55) return 'Merit';
    if (score >= 50) return 'Pass';
    if (score >= 45) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Fail';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Transfer & Transcript</h1>
          <p className="text-slate-500">Official academic record and character reference for transferring students.</p>
        </div>
        {selectedStudent && (
          <button 
            onClick={() => handlePrint()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all font-bold"
          >
            <Printer className="w-5 h-5" />
            Print Transcript
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Select Class</label>
              <select
                value={selectedClass}
                onChange={(e) => fetchStudents(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Choose Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>

            {selectedClass && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Select Student</label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {students.map(student => (
                    <button
                      key={student.id}
                      onClick={() => fetchTranscriptData(student)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                        selectedStudent?.id === student.id 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">{student.first_name} {student.last_name}</div>
                      <div className={`text-[10px] ${selectedStudent?.id === student.id ? 'text-blue-100' : 'text-slate-400'}`}>
                        {student.admission_number}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedStudent && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-widest">
                  <FileText className="w-4 h-4" /> Transfer Details
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Leaving</label>
                  <input
                    type="text"
                    value={reasonForLeaving}
                    onChange={(e) => setReasonForLeaving(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="e.g. Relocation"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Conduct / Character</label>
                  <select
                    value={conductRecord}
                    onChange={(e) => setConductRecord(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Exemplary">Exemplary</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Satisfactory">Satisfactory</option>
                    <option value="Fair">Fair</option>
                    <option value="Needs Improvement">Needs Improvement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Principal's Recommendation</label>
                  <textarea
                    rows={3}
                    value={principalComment}
                    onChange={(e) => setPrincipalComment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Brief evaluation for the new school..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-3">
          {fetchingResults ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[600px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : selectedStudent ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 overflow-x-auto">
                <div ref={reportRef} id="printable-transcript" className="min-w-[800px] bg-white p-10 relative print:p-0 print:shadow-none print:m-0 border-8 border-slate-100">
                  {/* Watermark */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                    {settings?.school_logo_url ? (
                      <img 
                        src={settings.school_logo_url} 
                        alt="Watermark" 
                        className="w-[500px] h-[500px] object-contain opacity-[0.03]" 
                      />
                    ) : (
                      <GraduationCap className="w-[500px] h-[500px] rotate-[-30deg] opacity-[0.02]" />
                    )}
                  </div>

                  <div className="border-4 border-double border-slate-300 p-8 relative z-10">
                    {/* Header */}
                    <div className="text-center mb-8">
                      {settings?.school_logo_url && (
                        <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain mx-auto mb-4" />
                      )}
                      <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-1">{settings?.school_name}</h1>
                      <p className="text-blue-600 font-bold italic mb-4">{settings?.school_motto}</p>
                      <div className="inline-block px-8 py-2 bg-slate-900 text-white rounded-full text-sm font-black uppercase tracking-widest">
                        Academic Transcript & Transfer Record
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8">
                      <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Name</span>
                          <span className="text-sm font-bold text-slate-900">{[selectedStudent.first_name, selectedStudent.middle_name, selectedStudent.last_name].filter(Boolean).join(' ')}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admission No</span>
                          <span className="text-sm font-bold text-slate-900">{selectedStudent.admission_number}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gender</span>
                          <span className="text-sm font-bold text-slate-900 capitalize">{selectedStudent.gender}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Class</span>
                          <span className="text-sm font-bold text-slate-900">{classes.find(c => c.id === parseInt(selectedClass))?.class_name}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Academic Session</span>
                          <span className="text-sm font-bold text-slate-900">{settings?.current_session}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Issued</span>
                          <span className="text-sm font-bold text-slate-900">{new Date().toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <table className="w-full border-collapse border border-slate-300 mb-8 shadow-sm">
                      <thead>
                        <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest">
                          <th className="px-4 py-4 text-left border border-slate-800">S/N</th>
                          <th className="px-4 py-4 text-left border border-slate-800">Subject</th>
                          <th className="px-4 py-4 text-center border border-slate-800">1st Term (30%)</th>
                          <th className="px-4 py-4 text-center border border-slate-800">2nd Term (30%)</th>
                          <th className="px-4 py-4 text-center border border-slate-800">3rd Term (40%)</th>
                          <th className="px-4 py-4 text-center border border-slate-800">Session Total</th>
                          <th className="px-4 py-4 text-center border border-slate-800">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {cumulativeResults.map((r, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-4 py-3 border border-slate-200 text-slate-400 font-bold">{idx + 1}</td>
                            <td className="px-4 py-3 border border-slate-200 font-black text-slate-900 uppercase tracking-tight">{r.subject_name}</td>
                            <td className="px-4 py-3 border border-slate-200 text-center font-bold text-slate-600">{r.first_term || '-'}</td>
                            <td className="px-4 py-3 border border-slate-200 text-center font-bold text-slate-600">{r.second_term || '-'}</td>
                            <td className="px-4 py-3 border border-slate-200 text-center font-bold text-slate-600">{r.third_term || '-'}</td>
                            <td className="px-4 py-3 border border-slate-200 text-center font-black text-blue-600 text-base">{r.cumulative.toFixed(1)}</td>
                            <td className="px-4 py-3 border border-slate-200 text-center">
                              <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                r.cumulative >= 45 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                              }`}>
                                {getRemark(r.cumulative)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900 text-white">
                          <td colSpan={2} className="px-4 py-4 font-black uppercase text-xs tracking-widest border border-slate-800 text-right">Summary</td>
                          <td colSpan={3} className="border border-slate-800"></td>
                          <td className="px-4 py-4 text-center font-black text-lg border border-slate-800">{calculateCumulativeAverage()}%</td>
                          <td className="border border-slate-800"></td>
                        </tr>
                      </tfoot>
                    </table>

                    {/* Conduct and Transfer info */}
                    <div className="grid grid-cols-2 gap-8 mb-8">
                      <div className="p-6 border-2 border-slate-200 rounded-3xl bg-slate-50/50">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <User className="w-3 h-3" /> Student Evaluation
                        </h3>
                        <div className="space-y-4">
                          <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-xs font-bold text-slate-500">General Conduct:</span>
                            <span className="text-xs font-black text-slate-900 uppercase">{conductRecord}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-xs font-bold text-slate-500">Reason for Leaving:</span>
                            <span className="text-xs font-black text-slate-900">{reasonForLeaving}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-6 border-2 border-slate-200 rounded-3xl bg-blue-50/30">
                        <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Trophy className="w-3 h-3" /> Principal's Remark
                        </h3>
                        <p className="text-xs font-bold text-slate-900 italic leading-relaxed">
                          "{principalComment}"
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-12 mt-12 pb-12">
                      <div className="space-y-6">
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                             <TrendingUp className="w-3 h-3" /> Promotion Status
                          </div>
                          <div className="flex items-center gap-3">
                             {parseFloat(calculateCumulativeAverage()) >= 45 ? (
                               <>
                                 <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                 <span className="text-xl font-black text-emerald-900 uppercase">Promoted to Next Grade</span>
                               </>
                             ) : (
                               <>
                                 <FileText className="w-6 h-6 text-amber-600" />
                                 <span className="text-xl font-black text-amber-900 uppercase">To Be Decided</span>
                               </>
                             )}
                          </div>
                        </div>

                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                          <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                             <BadgeCheck className="w-3 h-3" /> Transfer Release Certification
                          </div>
                          <p className="text-[11px] text-blue-900 leading-relaxed font-medium italic">
                            This is to certify that {[selectedStudent.first_name, selectedStudent.middle_name, selectedStudent.last_name].filter(Boolean).join(' ')} has been a student of this institution. All academic requirements for the session have been met. This transcript is issued to facilitate a smooth transfer to another institution and is valid only with the official school seal and principal's signature.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col justify-end space-y-12">
                        <div className="text-center">
                          <div className="w-full border-b-2 border-slate-900 mb-2 min-h-[60px] flex items-end justify-center">
                            {/* Placeholder for Principal Signature */}
                            <span className="text-slate-100 text-[8px]">DIGITAL SIGNATURE AREA</span>
                          </div>
                          <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Principal / Head of School</div>
                          <div className="text-[10px] font-bold text-slate-400">Signature & Date</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="w-40 h-40 border-2 border-dashed border-slate-200 rounded-full mx-auto flex items-center justify-center text-slate-200 text-[10px] font-black uppercase tracking-widest">
                            Official School Stamp
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-slate-100 pt-4 flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                      <span>Generated by {settings?.school_name} Management System</span>
                      <span>Page 1 of 1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[600px] flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Select a student</h3>
              <p className="max-w-xs">Select a class and student from the left panel to generate their academic transcript.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
