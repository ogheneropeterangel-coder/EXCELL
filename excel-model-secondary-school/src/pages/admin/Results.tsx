import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { Student, Class, Result, Subject, Settings } from '../../types';
import { 
  Search, 
  Printer, 
  Download, 
  Loader2,
  GraduationCap,
  Trophy,
  User,
  Calendar,
  BookOpen,
  Activity,
  Heart,
  MessageSquare,
  Filter,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function Results() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;
  const isTeacher = profile?.role === 'teacher';

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [psychomotor, setPsychomotor] = useState<any>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [classSubjects, setClassSubjects] = useState<Subject[]>([]);
  const [nextTermBegins, setNextTermBegins] = useState('');
  const [classResults, setClassResults] = useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<{ present: number, total: number }>({ present: 0, total: 0 });
  const [cumulativeResults, setCumulativeResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingResults, setFetchingResults] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeReport, setActiveReport] = useState<'terminal' | 'annual'>('terminal');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const filteredStudentsList = students.filter(s => 
    `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(studentSearchTerm.toLowerCase())
  );

  useEffect(() => {
    if (profile) {
      fetchInitialData();
    }
  }, [profile]);

  async function fetchInitialData() {
    try {
      let classesQuery = supabase.from('classes').select('*').order('class_name');
      
      if (!canManage && profile?.id) {
        // If teacher, only get classes assigned to them
        const { data: teacherClassesPivot } = await supabase
          .from('teacher_classes')
          .select('class_id')
          .eq('teacher_id', profile.id);
        
        const { data: teacherClassesDirect } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', profile.id);

        const { data: studentClasses } = await supabase
          .from('students')
          .select('class_id, classes!class_id(id, class_name)')
          .eq('teacher_id', profile.id);

        // Get classes from subjects assigned to this teacher
        const { data: teacherSubjects } = await supabase
          .from('teacher_subjects')
          .select('subject_id')
          .eq('teacher_id', profile.id);
        
        const teacherSubjectIds = teacherSubjects?.map(ts => ts.subject_id) || [];
        
        let subjectClasses: any[] = [];
        if (teacherSubjectIds.length > 0) {
          const { data: scData } = await supabase
            .from('class_subjects')
            .select('class_id, classes!class_id(id, class_name)')
            .in('subject_id', teacherSubjectIds);
          subjectClasses = scData?.map(cs => cs.class_id).filter(Boolean) || [];
        }
        
        const pivotIds = teacherClassesPivot?.map(c => c.class_id) || [];
        const directIds = teacherClassesDirect?.map(c => c.id) || [];
        const studentClassIds = studentClasses?.filter(s => s.class_id).map(s => s.class_id) || [];
        
        const classIds = Array.from(new Set([...pivotIds, ...directIds, ...studentClassIds, ...subjectClasses]));
        
        if (classIds.length > 0) {
          classesQuery = classesQuery.in('id', classIds);
        } else {
          setClasses([]);
          setLoading(false);
          return;
        }
      }

      const [classesRes, settingsRes] = await Promise.all([
        classesQuery,
        supabase.from('settings').select('*').single()
      ]);
      setClasses(classesRes.data || []);
      setSettings(settingsRes.data);
      setNextTermBegins(settingsRes.data?.next_term_begins || '');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents(classId: string) {
    setSelectedClass(classId);
    setSelectedStudent(null);
    setResults([]);
    setPsychomotor(null);
    
    // If no classId is provided, we still want to show students if they search? 
    // Actually let's allow fetching all students if classId is 'all'
    
    try {
      let query = supabase
        .from('students')
        .select('*');

      if (classId && classId !== 'all') {
        query = query.eq('class_id', classId);
      }

      query = query.order('last_name');

      if (!canManage && profile?.id) {
        // Teacher logic: only show students they are allowed to see
        // Keep existing teacher filtering logic but adapted for 'all'
        
        if (classId && classId !== 'all') {
          // Check if teacher is assigned to this class
          const { data: isAssignedToClass } = await supabase
            .from('teacher_classes')
            .select('id')
            .eq('teacher_id', profile.id)
            .eq('class_id', classId)
            .maybeSingle();
          
          const { data: isDirectTeacher } = await supabase
            .from('classes')
            .select('id')
            .eq('id', classId)
            .eq('teacher_id', profile.id)
            .maybeSingle();

          // Check if teacher is assigned to any subject in this class
          const { data: teacherSubjects } = await supabase
            .from('teacher_subjects')
            .select('subject_id')
            .eq('teacher_id', profile.id);
          
          const teacherSubjectIds = teacherSubjects?.map(ts => ts.subject_id) || [];
          
          const { data: isSubjectTeacher } = await supabase
            .from('class_subjects')
            .select('id')
            .eq('class_id', classId)
            .in('subject_id', teacherSubjectIds)
            .maybeSingle();

          if (!isAssignedToClass && !isDirectTeacher && !isSubjectTeacher) {
            query = query.eq('teacher_id', profile.id);
          }
        } else {
          // Global search for teacher - might be restricted
          // For now, let's just use their assigned students
          query = query.eq('teacher_id', profile.id);
        }
      }

      const { data: studentsData, error: studentsError } = await query;
      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      if (classId && classId !== 'all') {
        // Fetch subjects assigned to this class
        let subjectsForClass: Subject[] = [];
        const { data: classSubjectsData, error: classSubjectsError } = await supabase
          .from('class_subjects')
          .select('subject_id, subjects(*)')
          .eq('class_id', classId);
        
        if (classSubjectsError) throw classSubjectsError;

        subjectsForClass = (classSubjectsData || []).map(d => {
          const sub = Array.isArray(d.subjects) ? d.subjects[0] : d.subjects;
          return sub as unknown as Subject;
        }).filter(Boolean) || [];

        if (!canManage && profile?.role === 'teacher') {
          if (subjectsForClass.length === 0) {
            const { data: teacherSubjectsData } = await supabase
              .from('teacher_subjects')
              .select('subject_id, subjects(*)')
              .eq('teacher_id', profile.id);
            
            subjectsForClass = (teacherSubjectsData || []).map(d => {
              const sub = Array.isArray(d.subjects) ? d.subjects[0] : d.subjects;
              return sub as unknown as Subject;
            }).filter(Boolean) || [];
          }

          if (subjectsForClass.length === 0) {
            const { data: allSubjectsData } = await supabase.from('subjects').select('*').order('subject_name');
            subjectsForClass = allSubjectsData || [];
          }
        }
        setClassSubjects(subjectsForClass);
      } else {
        // If all classes, use all subjects? 
        const { data: allSubs } = await supabase.from('subjects').select('*').order('subject_name');
        setClassSubjects(allSubs || []);
      }

      // Fetch all results for position context
      if (classId && classId !== 'all') {
        const { data: resultsData, error: resultsError } = await supabase
          .from('results')
          .select('*')
          .eq('class_id', classId)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session);
        if (resultsError) throw resultsError;
        setClassResults(resultsData || []);
      } else {
        const { data: resultsData } = await supabase
          .from('results')
          .select('*')
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session);
        setClassResults(resultsData || []);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function fetchStudentResults(student: Student) {
    setSelectedStudent(student);
    setFetchingResults(true);
    try {
      const isThirdTerm = settings?.current_term?.toLowerCase().includes('3rd');
      
      const [resultsRes, psychoRes, attendanceRes, allTermsRes] = await Promise.all([
        supabase
          .from('results')
          .select('*, subjects(subject_name)')
          .eq('student_id', student.id)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session),
        supabase
          .from('psychomotor_skills')
          .select('*')
          .eq('student_id', student.id)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session)
          .maybeSingle(),
        supabase
          .from('attendance')
          .select('status')
          .eq('student_id', student.id)
          .eq('term', settings?.current_term || '1st')
          .eq('session', settings?.current_session || '2025/2026'),
        isThirdTerm ? supabase
          .from('results')
          .select('*, subjects(subject_name)')
          .eq('student_id', student.id)
          .eq('session', settings?.current_session) : Promise.resolve({ data: [] })
      ]);

      if (attendanceRes.data) {
        setAttendanceStats({
          present: attendanceRes.data.filter(a => a.status === 'Present').length,
          total: attendanceRes.data.length
        });
      }

      // Merge class subjects with results and filter out those with no scores or zero total score
      const mergedResults = classSubjects.map(subject => {
        const result = resultsRes.data?.find(r => r.subject_id === subject.id);
        const total_score = (result?.ca1_score || 0) + (result?.ca2_score || 0) + (result?.exam_score || 0);
        return {
          subject_id: subject.id,
          subject_name: subject.subject_name,
          ca1_score: result?.ca1_score || 0,
          ca2_score: result?.ca2_score || 0,
          exam_score: result?.exam_score || 0,
          total_score: total_score,
          has_result: !!result && total_score > 0
        };
      }).filter(r => r.has_result);

      if (isThirdTerm && allTermsRes.data) {
        const cumulative = classSubjects.map(subject => {
          const firstTerm = allTermsRes.data?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('1st'));
          const secondTerm = allTermsRes.data?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('2nd'));
          const thirdTerm = allTermsRes.data?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('3rd'));

          const firstTermScore = firstTerm ? (firstTerm.ca1_score + firstTerm.ca2_score + firstTerm.exam_score) : 0;
          const secondTermScore = secondTerm ? (secondTerm.ca1_score + secondTerm.ca2_score + secondTerm.exam_score) : 0;
          const thirdTermScore = thirdTerm ? (thirdTerm.ca1_score + thirdTerm.ca2_score + thirdTerm.exam_score) : 0;

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
      } else {
        setCumulativeResults([]);
      }

      setResults(mergedResults);
      setPsychomotor(psychoRes.data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFetchingResults(false);
    }
  }

  const calculateTotal = () => results.reduce((acc, curr) => acc + (curr.total_score || 0), 0);
  const calculateAverage = () => {
    const subjectsWithResults = results.filter(r => r.has_result);
    if (subjectsWithResults.length === 0) return '0.00';
    return (calculateTotal() / subjectsWithResults.length).toFixed(2);
  };

  const calculateCumulativeTotal = () => cumulativeResults.reduce((acc, curr) => acc + curr.cumulative, 0);
  const calculateCumulativeAverage = () => {
    if (cumulativeResults.length === 0) return '0.00';
    return (calculateCumulativeTotal() / cumulativeResults.length).toFixed(2);
  };

  const calculatePosition = () => {
    if (!selectedStudent || classResults.length === 0) return { rank: '-', total: students.length };
    
    // Calculate averages for all students in class, excluding subjects with zero total score
    const averages = students.map(s => {
      const studentResults = classResults.filter(r => r.student_id === s.id && (r.ca1_score + r.ca2_score + r.exam_score) > 0);
      if (studentResults.length === 0) return { id: s.id, avg: 0 };
      const total = studentResults.reduce((acc, r) => acc + (r.ca1_score + r.ca2_score + r.exam_score), 0);
      return { id: s.id, avg: total / studentResults.length };
    });

    // Sort by average descending
    const sorted = [...averages].sort((a, b) => b.avg - a.avg);
    const rank = sorted.findIndex(s => s.id === selectedStudent.id) + 1;
    
    if (rank === 0) return { rank: '-', total: students.length };
    
    // Add suffix
    const j = rank % 10, k = rank % 100;
    let rankStr = rank.toString();
    if (j === 1 && k !== 11) rankStr = rank + "st";
    else if (j === 2 && k !== 12) rankStr = rank + "nd";
    else if (j === 3 && k !== 13) rankStr = rank + "rd";
    else rankStr = rank + "th";

    return { rank: rankStr, total: students.length };
  };

  const calculateSubjectPosition = (subjectId: number, score: number) => {
    if (classResults.length === 0) return '-';
    
    // Get all scores for this subject in this class/term/session
    const subjectScores = classResults
      .filter(r => r.subject_id === subjectId && (r.ca1_score + r.ca2_score + r.exam_score) > 0)
      .map(r => r.ca1_score + r.ca2_score + r.exam_score);
    
    if (subjectScores.length === 0) return '-';

    // Sort scores descending
    const sortedScores = [...subjectScores].sort((a, b) => b - a);
    const rank = sortedScores.indexOf(score) + 1;

    if (rank === 0) return '-';

    // Add suffix
    const j = rank % 10, k = rank % 100;
    if (j === 1 && k !== 11) return rank + "st";
    if (j === 2 && k !== 12) return rank + "nd";
    if (j === 3 && k !== 13) return rank + "rd";
    return rank + "th";
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

  const handleBulkExport = async () => {
    if (!selectedClass || selectedClass === 'all') {
      toast.error('Please select a specific class to export');
      return;
    }

    setExporting(true);
    try {
      const cls = classes.find(c => c.id.toString() === selectedClass);
      const className = cls?.class_name || 'Class';

      // 1. Get all students in this class
      const { data: studentsInClass } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', selectedClass)
        .order('last_name');

      if (!studentsInClass || studentsInClass.length === 0) {
        toast.error('No students found in this class');
        return;
      }

      // 2. Get all class subjects
      const { data: classSubs } = await supabase
        .from('class_subjects')
        .select('subject_id, subjects(id, subject_name)')
        .eq('class_id', selectedClass);

      const subjects = (classSubs || []).map(cs => Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects).filter(Boolean) as Subject[];

      // 3. Get all results for this class/term/session
      const { data: allResults } = await supabase
        .from('results')
        .select('*')
        .eq('class_id', selectedClass)
        .eq('term', settings?.current_term)
        .eq('session', settings?.current_session);

      // Prepare data for Excel matrix
      const excelData = studentsInClass.map(student => {
        const row: any = {
          'Student Name': [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' '),
          'Admission Number': student.admission_number,
        };

        const studentResults = allResults?.filter(r => r.student_id === student.id) || [];
        let grandTotal = 0;
        let subjectsWithResults = 0;

        subjects.forEach(sub => {
          const res = studentResults.find(r => r.subject_id === sub.id);
          
          const hasCA1 = res?.ca1_score !== undefined && res?.ca1_score !== null;
          const hasCA2 = res?.ca2_score !== undefined && res?.ca2_score !== null;
          const hasExam = res?.exam_score !== undefined && res?.exam_score !== null;

          const total = (res?.ca1_score || 0) + (res?.ca2_score || 0) + (res?.exam_score || 0);

          row[`${sub.subject_name} CA1`] = hasCA1 ? res?.ca1_score : '';
          row[`${sub.subject_name} CA2`] = hasCA2 ? res?.ca2_score : '';
          row[`${sub.subject_name} Exam`] = hasExam ? res?.exam_score : '';
          row[`${sub.subject_name} Total`] = (hasCA1 || hasCA2 || hasExam) ? total : '';

          if (hasCA1 || hasCA2 || hasExam) {
            grandTotal += total;
            subjectsWithResults++;
          }
        });

        row['Grand Total'] = grandTotal;
        row['Average'] = subjectsWithResults > 0 ? (grandTotal / subjectsWithResults).toFixed(2) : '';
        return row;
      });

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, className);

      // Save file
      const fileName = `${className}_Scores_Export_${settings?.current_term}_${settings?.current_session.replace('/', '-')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast.success('Scores exported successfully');
    } catch (error: any) {
      toast.error('Export failed: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const updateNextTermBegins = async (val: string) => {
    setNextTermBegins(val);
    try {
      const { error } = await supabase.from('settings').update({ next_term_begins: val }).eq('id', 1);
      if (error) {
        if (error.message.includes("next_term_begins") || error.code === "42703") {
          console.warn('Next Term Begins could not be updated because the column is missing in the database.');
          toast.warning('Note: "Next Term Begins" could not be saved because the column is missing in your database.');
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Failed to update next term begins', error);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Report Cards</h1>
          <p className="text-slate-500">Generate and print terminal and annual academic summaries.</p>
        </div>
        {selectedStudent && (
          <div className="flex gap-2">
             {settings?.current_term?.toLowerCase().includes('3rd') && (
               <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
                 <button
                   onClick={() => setActiveReport('terminal')}
                   className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                     activeReport === 'terminal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   Terminal Report
                 </button>
                 <button
                   onClick={() => setActiveReport('annual')}
                   className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                     activeReport === 'annual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   Annual Summary
                 </button>
               </div>
             )}
            <button 
              onClick={() => handlePrint()}
              className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl shadow-lg transition-all font-bold ${
                activeReport === 'annual' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              }`}
            >
              <Printer className="w-5 h-5" />
              Print {activeReport === 'terminal' ? 'Report Card' : 'Annual Summary'}
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Selection Panel */}
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
                <option value="all">All Classes (Global)</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>

            {selectedClass && (
              <div className="space-y-4">
                {selectedClass !== 'all' && (
                  <button
                    onClick={handleBulkExport}
                    disabled={exporting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition-all disabled:opacity-50"
                  >
                    {exporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4" />
                    )}
                    Export Class Scores
                  </button>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name or ID..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {filteredStudentsList.length > 0 ? (
                    filteredStudentsList.map(student => (
                      <button
                        key={student.id}
                        onClick={() => fetchStudentResults(student)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                          selectedStudent?.id === student.id 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="font-bold">
                          {[student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')}
                        </div>
                        <div className={`text-[10px] ${selectedStudent?.id === student.id ? 'text-blue-100' : 'text-slate-400'}`}>
                          {student.admission_number}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs text-slate-400 font-medium">No students found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Report Card Preview */}
        <div className="md:col-span-3">
          {fetchingResults ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[600px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : selectedStudent ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    {activeReport === 'terminal' ? 'Terminal Report Card' : 'Annual Summary Report'}
                  </span>
                  {activeReport === 'annual' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase">3rd Term Exclusive</span>}
                </div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
              </div>
              
              <div className="p-8 overflow-x-auto">
                {/* Printable Area */}
                <div ref={reportRef} id="printable-report" className="min-w-[800px] bg-white p-10 relative print:p-0 print:shadow-none print:m-0">
                  {activeReport === 'terminal' ? (
                    <>
                      {/* Watermark */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                        {settings?.school_logo_url ? (
                          <img 
                            src={settings.school_logo_url} 
                            alt="Watermark" 
                            className="w-[450px] h-[450px] object-contain opacity-[0.05]" 
                          />
                        ) : (
                          <GraduationCap className="w-[500px] h-[500px] rotate-[-30deg] opacity-[0.03]" />
                        )}
                      </div>

                      {/* Modern Background Accents */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl opacity-50 -z-0" />
                      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-30 -z-0" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-10 pointer-events-none" />

                      {/* Header */}
                      <div className="flex items-center justify-between border-b-2 border-slate-100 pb-6 mb-6 relative z-10">
                        <div className="flex items-center gap-6">
                          {settings?.school_logo_url ? (
                            <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain" />
                          ) : (
                            <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-lg">
                              <GraduationCap className="w-12 h-12 text-white" />
                            </div>
                          )}
                          <div className="space-y-1">
                            <h1 className="text-3xl font-extrabold text-[#112255] uppercase tracking-tight leading-none">
                              {settings?.school_name || "PRINCE AND PRINCESS INTERNATIONAL SCHOOL"}
                            </h1>
                            <p className="text-blue-500 font-bold tracking-widest text-[11px] uppercase">
                              {settings?.school_motto || "CHARACTER, SKILL AND CAREER"}
                            </p>
                            <div className="pt-2">
                              <span className="bg-blue-900 text-white text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                                Official Record
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center">
                          <h2 className="text-lg font-black text-blue-950 tracking-tight uppercase">Academic Performance</h2>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-0.5">Report Card</p>
                          <div className="mt-3 bg-blue-950 text-white text-[9px] font-black tracking-widest uppercase px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-md shadow-blue-900/10">
                            <span>Term: {settings?.current_term || '2nd'}</span>
                            <span className="text-blue-400">✦</span>
                            <span>Session: {settings?.current_session || '2025/2026'}</span>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex items-center gap-3 shadow-inner">
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                              <Trophy className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="text-left font-sans">
                              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Digital Verification</div>
                              <div className="text-[9px] font-mono font-bold text-slate-600 tracking-tighter mt-1 select-all">REF: RC/{selectedStudent.admission_number}/{settings?.current_session?.replace('/', '')}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Student Info Bar */}
                      {(() => {
                        const selectedCls = classes.find(c => c.id === parseInt(selectedClass));
                        const classCategory = selectedCls?.category || 'Junior';
                        const isSenior = classCategory === 'Senior';
                        return (
                          <div className="bg-[#8cc63f] rounded-2xl p-4 text-white shadow-sm grid grid-cols-12 gap-4 items-center mb-8 relative z-10 print:bg-[#8cc63f] print:text-white">
                            <div className="col-span-5 px-2">
                              <div className="text-[9px] font-semibold text-white/80 uppercase tracking-wider mb-1 leading-none">Student Name</div>
                              <div className="text-sm font-black uppercase tracking-tight leading-tight break-words">
                                {[selectedStudent.last_name, [selectedStudent.first_name, selectedStudent.middle_name].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                              </div>
                            </div>
                            <div className="col-span-2 px-2 border-l border-white/20">
                              <div className="text-[9px] font-semibold text-white/80 uppercase tracking-wider mb-1 leading-none">Class & Category</div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-black uppercase tracking-tight">{selectedCls?.class_name}</span>
                                <span className="bg-white/25 text-[8px] font-black px-1.5 py-0.5 rounded uppercase font-sans">
                                  {classCategory}
                                </span>
                              </div>
                            </div>
                            <div className="col-span-2 px-2 border-l border-white/20">
                              <div className="text-[9px] font-semibold text-white/80 uppercase tracking-wider mb-1 leading-none">
                                {isSenior ? 'Academic Category' : 'Class Rank'}
                              </div>
                              <div className="text-sm font-black tracking-tight">
                                {isSenior ? (
                                  <span className="uppercase text-xs font-black">Senior Report</span>
                                ) : (
                                  <span>{calculatePosition().rank} <span className="text-xs font-bold text-white/80">/ {calculatePosition().total}</span></span>
                                )}
                              </div>
                            </div>
                            <div className="col-span-3 px-2 border-l border-white/20">
                              <div className="text-[9px] font-semibold text-white/80 uppercase tracking-wider mb-1 leading-none">Admission Number</div>
                              <div className="text-sm font-mono font-black uppercase tracking-wider">
                                {selectedStudent.admission_number}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex gap-8 relative z-10">
                        {/* Left Side: Psychomotor & Affective */}
                        <div className="w-1/3 space-y-6">
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="bg-slate-900 text-white px-4 py-2 text-xs font-bold flex items-center gap-2">
                              <Activity className="w-3 h-3" /> Psychomotor Skills
                            </div>
                            <div className="p-4 space-y-2">
                              {[
                                { key: 'handwriting', label: 'Handwriting' },
                                { key: 'fluency', label: 'Fluency' },
                                { key: 'games', label: 'Games' },
                                { key: 'sports', label: 'Sports' },
                                { key: 'gymnastics', label: 'Gymnastics' },
                                { key: 'handling_tools', label: 'Handling Tools' },
                                { key: 'drawing_painting', label: 'Drawing & Painting' },
                                { key: 'crafts', label: 'Crafts' },
                                { key: 'musical_skills', label: 'Musical Skills' },
                              ].map(skill => (
                                <div key={skill.key} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600">{skill.label}</span>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(v => (
                                      <div key={v} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold ${
                                        (psychomotor?.[skill.key] || 0) >= v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'
                                      }`}>
                                        {v}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="bg-slate-900 text-white px-4 py-2 text-xs font-bold flex items-center gap-2">
                              <Heart className="w-3 h-3" /> Affective Domain
                            </div>
                            <div className="p-4 space-y-2">
                              {[
                                { key: 'punctuality', label: 'Punctuality' },
                                { key: 'neatness', label: 'Neatness' },
                                { key: 'politeness', label: 'Politeness' },
                                { key: 'honesty', label: 'Honesty' },
                                { key: 'relationship_with_others', label: 'Relationship' },
                                { key: 'leadership', label: 'Leadership' },
                                { key: 'emotional_stability', label: 'Emotional Stability' },
                                { key: 'health', label: 'Health' },
                                { key: 'self_control', label: 'Self Control' },
                                { key: 'attentiveness', label: 'Attentiveness' },
                                { key: 'perseverance', label: 'Perseverance' },
                              ].map(skill => (
                                <div key={skill.key} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600">{skill.label}</span>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(v => (
                                      <div key={v} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold ${
                                        (psychomotor?.[skill.key] || 0) >= v ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-300'
                                      }`}>
                                        {v}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Academic Results */}
                        <div className="flex-1">
                  {(() => {
                    const selectedCls = classes.find(c => c.id.toString() === selectedClass);
                    const isSenior = selectedCls?.category === 'Senior';
                    return (
                      <table className="w-full border-collapse border border-slate-200 rounded-2xl overflow-hidden">
                        <thead>
                          <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest">
                            <th className="px-4 py-3 text-left border border-slate-800">Subject</th>
                            <th className="px-2 py-3 text-center border border-slate-800">CA1 ({isSenior ? 15 : 20})</th>
                            <th className="px-2 py-3 text-center border border-slate-800">CA2 ({isSenior ? 15 : 20})</th>
                            <th className="px-2 py-3 text-center border border-slate-800">Exam ({isSenior ? 70 : 60})</th>
                            <th className="px-2 py-3 text-center border border-slate-800">Total (100)</th>
                            {!isSenior && <th className="px-2 py-3 text-center border border-slate-800">Pos</th>}
                            <th className="px-4 py-3 text-center border border-slate-800">Grade</th>
                            <th className="px-4 py-3 text-center border border-slate-800">Remark</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {results.map((r, idx) => {
                            const total = r.total_score;
                            let grade = '-';
                            let color = 'text-slate-400';
                            let pos = '-';
                            let remark = '-';
                            
                            if (r.has_result) {
                              if (total >= 70) { grade = 'A'; color = 'text-emerald-600'; }
                              else if (total >= 60) { grade = 'B'; color = 'text-blue-600'; }
                              else if (total >= 50) { grade = 'C'; color = 'text-amber-600'; }
                              else if (total >= 45) { grade = 'D'; color = 'text-orange-600'; }
                              else if (total >= 40) { grade = 'E'; color = 'text-orange-400'; }
                              else { grade = 'F'; color = 'text-red-600'; }
                              
                              pos = calculateSubjectPosition(r.subject_id, total);
                              remark = getRemark(total);
                            }

                            return (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="px-4 py-3 border border-slate-200 font-bold text-slate-900">
                                  {r.subject_name}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                  {r.has_result ? r.ca1_score : '-'}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                  {r.has_result ? r.ca2_score : '-'}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                  {r.has_result ? r.exam_score : '-'}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-black">
                                  {r.has_result ? total : '-'}
                                </td>
                                {!isSenior && (
                                  <td className="px-2 py-3 border border-slate-200 text-center font-bold text-blue-600 text-xs">
                                    {pos}
                                  </td>
                                )}
                                <td className={`px-4 py-3 border border-slate-200 text-center font-black ${color}`}>{grade}</td>
                                <td className="px-4 py-3 border border-slate-200 text-center text-[10px] font-bold text-slate-500">
                                  {remark}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-[#1e3a8a] text-white text-[10.5px] uppercase font-black tracking-wider">
                            <td className="px-4 py-2 text-left border border-blue-900">Terminal Metrics</td>
                            <td colSpan={isSenior ? 6 : 7} className="px-4 py-2 border border-blue-900">
                              <div className="flex justify-between items-center w-full">
                                <div>Grand Total: <span className="text-amber-300 font-black text-[13px] select-all">{calculateTotal()}</span></div>
                                <div className="border-l border-white/20 pl-4">Average: <span className="text-amber-300 font-black text-[13px]">{calculateAverage()}%</span></div>
                                {!isSenior && (
                                  <div className="border-l border-white/20 pl-4">
                                    Class Rank: <span className="text-amber-300 font-black text-[13px]">{calculatePosition().rank} / {calculatePosition().total}</span>
                                  </div>
                                )}
                                <div className="border-l border-white/20 pl-4">
                                  Verdict: <span className="text-amber-300 font-black text-[13px]">
                                    {(() => {
                                      const avg = parseFloat(calculateAverage());
                                      if (avg >= 75) return 'DISTINCTION';
                                      if (avg >= 60) return 'CREDIT';
                                      if (avg >= 45) return 'PASS';
                                      return 'FAIL/RE-SIT';
                                    })()}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    );
                  })()}

                          {/* Appraisals Side-by-Side */}
                          <div className="mt-6 grid grid-cols-2 gap-4 relative z-10">
                            <div className="p-4 border-2 border-[#1e1e1e]/10 bg-slate-50/20 rounded-2xl flex flex-col justify-between">
                              <div>
                                <div className="text-[9px] font-black text-blue-900 uppercase tracking-widest mb-1.5 border-b border-slate-100 pb-1">
                                  Class Teacher's Appraisal
                                </div>
                                <p className="text-xs text-slate-700 italic leading-relaxed min-h-[50px] font-serif pt-1">
                                  "{psychomotor?.teacher_remark || 'Good effort! You are making steady progress.'}"
                                </p>
                              </div>
                              <div className="text-right text-[8px] font-bold text-slate-400 italic mt-3">
                                Teacher's Digital Signature
                              </div>
                            </div>

                            <div className="p-4 border-2 border-[#1e1e1e]/10 bg-slate-50/20 rounded-2xl flex flex-col justify-between">
                              <div>
                                <div className="text-[9px] font-black text-blue-900 uppercase tracking-widest mb-1.5 border-b border-slate-100 pb-1">
                                  Principal's Final Assessment
                                </div>
                                <p className="text-xs text-slate-700 italic leading-relaxed min-h-[50px] font-serif pt-1">
                                  "{psychomotor?.principal_remark || 'Impressive academic results. Keep striving for greater heights.'}"
                                </p>
                              </div>
                              <div className="text-right text-[8px] font-extrabold text-emerald-600 uppercase tracking-wider mt-3">
                                Authorised Principal's Seal
                              </div>
                            </div>
                          </div>

                          {/* Grading System & Attendance */}
                          <div className="mt-4 grid grid-cols-3 gap-4 items-stretch relative z-10">
                            {/* Grading Card */}
                            <div className="col-span-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Standard Grading System</div>
                              <div className="grid grid-cols-6 gap-1 text-center font-sans">
                                {[
                                  { g: 'A', r: '70-100', d: 'Excellent' },
                                  { g: 'B', r: '60-69', d: 'Very Good' },
                                  { g: 'C', r: '50-59', d: 'Good' },
                                  { g: 'D', r: '45-49', d: 'Pass' },
                                  { g: 'E', r: '40-44', d: 'Fair' },
                                  { g: 'F', r: '0-39', d: 'Fail' }
                                ].map(item => (
                                  <div key={item.g} className="bg-white p-1 rounded-lg border border-slate-100">
                                    <div className="text-xs font-black text-slate-800 leading-none">{item.g}</div>
                                    <div className="text-[7.5px] text-slate-400 font-mono tracking-tighter mt-1">{item.r}</div>
                                    <div className="text-[7.5px] font-black text-slate-500 uppercase mt-0.5 leading-none">{item.d}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Attendance Card */}
                            <div className="p-3 bg-[#112255] text-white rounded-2xl shadow-md shadow-blue-900/10 flex flex-col justify-between">
                              <div className="text-[8px] font-black text-blue-300 uppercase tracking-widest mb-1.5">Attendance Record</div>
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] border-b border-white/10 pb-1">
                                  <span className="text-blue-200">Days Present:</span>
                                  <span className="font-mono font-black text-amber-300">{attendanceStats.present}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-blue-200">Total Days:</span>
                                  <span className="font-mono font-black text-slate-300">{attendanceStats.total}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Signatures Panel */}
                          <div className="mt-8 flex justify-between items-end px-4 relative z-10">
                            <div className="text-center">
                              <div className="text-[9px] font-black text-slate-300 italic mb-1 uppercase tracking-widest">Authenticated</div>
                              <div className="w-36 border-b border-dashed border-slate-900 mb-2"></div>
                              <div className="text-[8px] font-black text-[#112255] uppercase tracking-wider">Class Teacher</div>
                            </div>

                            <div className="text-center flex flex-col items-center">
                              <div className="mb-2">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Next Term Resumption</div>
                                <input 
                                  type="text"
                                  value={nextTermBegins}
                                  onChange={(e) => updateNextTermBegins(e.target.value)}
                                  className="w-36 px-2 py-1 text-xs border border-slate-200 bg-white shadow-sm rounded-lg text-center font-bold tracking-tight text-slate-800 print:border-none print:shadow-none print:bg-transparent"
                                  placeholder="e.g. 4th May, 2026"
                                />
                              </div>
                              <div className="h-8 flex items-center justify-center mb-1">
                                {settings?.principal_signature_url ? (
                                  <img src={settings.principal_signature_url} alt="Signature" className="h-8 object-contain" />
                                ) : (
                                  <div className="text-[8px] font-mono text-emerald-600/40 select-none tracking-widest uppercase">OFFICIAL SEAL</div>
                                )}
                              </div>
                              <div className="w-40 border-b border-dashed border-slate-900 mb-2"></div>
                              <div className="text-[8px] font-black text-[#112255] uppercase tracking-wider">Principal's Seal & Signature</div>
                            </div>

                            <div className="text-center">
                              <div className="font-mono text-[10px] text-slate-800 font-extrabold mb-1 bg-slate-50 border border-slate-100 rounded px-2.5 py-0.5 shadow-sm">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                              <div className="w-36 border-b border-dashed border-slate-900 mb-2"></div>
                              <div className="text-[8px] font-black text-[#112255] uppercase tracking-wider mt-1">Registrar</div>
                            </div>
                          </div>

                          {/* Brand Ribbon Footer */}
                          <div className="mt-8 -mx-10 -mb-10 bg-[#112255] text-white/90 text-[8px] px-8 py-2.5 flex justify-between items-center rounded-b-3xl border-t border-slate-850 font-black tracking-widest uppercase relative z-10">
                            <div>{settings?.school_name || "PRINCE AND PRINCESS INTERNATIONAL SCHOOL"} MANAGEMENT SYSTEM</div>
                            <div>REF: RC/{selectedStudent.admission_number}/{settings?.current_term?.replace(' ', '').toUpperCase()}/{settings?.current_session?.replace('/', '')}</div>
                            <div>Page 1 of 1</div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="relative z-10">
                      {/* Watermark for Cumulative */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden -z-10">
                        {settings?.school_logo_url ? (
                          <img 
                            src={settings.school_logo_url} 
                            alt="Watermark" 
                            className="w-[450px] h-[450px] object-contain opacity-[0.04]" 
                          />
                        ) : (
                          <TrendingUp className="w-[500px] h-[500px] rotate-[-30deg] opacity-[0.02]" />
                        )}
                      </div>

                      {/* Header for Cumulative */}
                      <div className="flex items-center justify-between border-b-4 border-emerald-600 pb-6 mb-8">
                        <div className="flex items-center gap-6">
                          {settings?.school_logo_url ? (
                            <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain" />
                          ) : (
                            <div className="w-24 h-24 bg-emerald-600 rounded-2xl flex items-center justify-center">
                              <TrendingUp className="w-14 h-14 text-white" />
                            </div>
                          )}
                          <div>
                            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{settings?.school_name}</h1>
                            <p className="text-emerald-600 font-bold italic">{settings?.school_motto}</p>
                            <div className="mt-2 flex gap-4 text-sm text-slate-600 font-bold">
                              <span className="bg-slate-100 px-3 py-1 rounded-full">Annual Session Summary (Cumulative)</span>
                              <span className="bg-slate-100 px-3 py-1 rounded-full">{settings?.current_session} Session</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-black text-slate-200 uppercase tracking-tighter leading-none">Annual<br/>Summary</div>
                          <div className="text-slate-400 font-mono text-sm mt-2">ADMISSION NO: {selectedStudent.admission_number}</div>
                        </div>
                      </div>

                      {/* Student Info Summary */}
                      <div className="grid grid-cols-12 gap-4 mb-8">
                        <div className="col-span-5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Student Name</div>
                            <div className="font-bold text-slate-900 break-words text-sm">
                              {[selectedStudent.first_name, selectedStudent.middle_name, selectedStudent.last_name].filter(Boolean).join(' ')}
                            </div>
                        </div>
                        <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Class</div>
                            <div className="font-bold text-slate-900 text-sm overflow-hidden text-ellipsis whitespace-nowrap">{classes.find(c => c.id === parseInt(selectedClass || '0'))?.class_name}</div>
                        </div>
                        <div className="col-span-2 bg-emerald-600 p-4 rounded-2xl shadow-lg shadow-emerald-100 text-white">
                            <div className="text-[10px] font-black text-emerald-200 uppercase mb-1">Cumulative Avg</div>
                            <div className="text-xl font-black">{calculateCumulativeAverage()}%</div>
                        </div>
                        <div className="col-span-3 bg-slate-900 p-4 rounded-2xl shadow-lg shadow-slate-200">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Final Status</div>
                            <div className="text-base font-black text-white uppercase tracking-tighter truncate">
                              {parseFloat(calculateCumulativeAverage()) >= 45 ? 'Promoted' : 'Decision Pending'}
                            </div>
                        </div>
                      </div>

                      {/* Cumulative Table */}
                      <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-sm mb-8">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest text-center">
                              <th className="px-6 py-4 text-left border border-slate-800">Academic Subject</th>
                              <th className="px-2 py-4 border border-slate-800">1st (30%)</th>
                              <th className="px-2 py-4 border border-slate-800">2nd (30%)</th>
                              <th className="px-2 py-4 border border-slate-800">3rd (40%)</th>
                              <th className="px-4 py-4 border border-slate-800 bg-emerald-700">Cumulative / 100</th>
                              <th className="px-4 py-4 border border-slate-800">Remark</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {cumulativeResults.map((r, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-6 py-4 border border-slate-200 font-bold text-slate-900 uppercase tracking-tight">{r.subject_name}</td>
                                <td className="px-2 py-4 border border-slate-200 text-center font-medium text-slate-600">{r.first_term || '-'}</td>
                                <td className="px-2 py-4 border border-slate-200 text-center font-medium text-slate-600">{r.second_term || '-'}</td>
                                <td className="px-2 py-4 border border-slate-200 text-center font-medium text-slate-600">{r.third_term || '-'}</td>
                                <td className="px-4 py-4 border border-slate-200 text-center font-black text-emerald-600 text-base">{r.cumulative.toFixed(1)}</td>
                                <td className="px-4 py-4 border border-slate-200 text-center">
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
                              <td className="px-6 py-4 font-black uppercase text-xs tracking-widest border border-slate-800">Annual Average Score</td>
                              <td colSpan={3} className="border border-slate-800"></td>
                              <td className="px-4 py-4 text-center font-black text-xl border border-slate-800 text-emerald-400">{calculateCumulativeAverage()}%</td>
                              <td className="border border-slate-800"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Footer for Cumulative */}
                      <div className="grid grid-cols-2 gap-12 mt-12 px-4 shadow-inner pt-8">
                        <div className="space-y-6">
                          <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl">
                            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Annual Certification</div>
                            <p className="text-[11px] text-emerald-900 leading-relaxed font-bold italic">
                              This cumulative performance record summarizes the student's academic standing for the entire {settings?.current_session} session. It serves as an official confirmation of eligibility for promotion.
                            </p>
                          </div>
                          <div className="w-40 h-40 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center text-slate-200 text-[10px] font-black uppercase tracking-widest">
                            Official School Seal
                          </div>
                        </div>
                        <div className="flex flex-col justify-end space-y-12">
                          <div className="text-center">
                            <div className="h-12 flex items-center justify-center mb-1">
                              {settings?.principal_signature_url && (
                                <img src={settings.principal_signature_url} alt="Signature" className="h-12 object-contain" />
                              )}
                            </div>
                            <div className="w-full border-b-2 border-slate-900 mb-2"></div>
                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Principal / Head of School</div>
                            <div className="text-[10px] font-bold text-slate-400">Signature & Date</div>
                          </div>
                          <div className="text-right text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                            Annual Summary Generated on {new Date().toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
                </div>
              ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[600px] flex flex-col items-center justify-center text-slate-400 space-y-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                  <BookOpen className="w-10 h-10" />
                </div>
                <p className="font-medium">Select a student to view their report card</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
