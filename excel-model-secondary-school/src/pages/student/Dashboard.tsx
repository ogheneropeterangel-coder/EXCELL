import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, School, TrendingUp, ClipboardList, Sparkles, GraduationCap, Printer, Filter, X, User, Trophy, Calendar, Activity, Heart, MessageSquare, Loader2, CheckCircle2, Lock, Wallet, Megaphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AIHomeworkHelper from '../../components/AIHomeworkHelper';
import { Announcement } from '../../types';

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [studentData, setStudentData] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [psychomotor, setPsychomotor] = useState<any>(null);
  const [attendanceStats, setAttendanceStats] = useState<{ present: number, total: number }>({ present: 0, total: 0 });
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'report'>('table');
  const [selectedTerm, setSelectedTerm] = useState('First Term');
  const [selectedSession, setSelectedSession] = useState(new Date().getFullYear() + '/' + (new Date().getFullYear() + 1));
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [classResults, setClassResults] = useState<any[]>([]);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [feeRecord, setFeeRecord] = useState<any>(null);
  const [feeStandard, setFeeStandard] = useState<number>(0);
  const [isRestricted, setIsRestricted] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    // Determine total amount from record or standard
    const totalRequired = feeRecord?.total_amount ? Number(feeRecord.total_amount) : feeStandard;
    
    if (feeRecord) {
      // UNPAID (Not Paid) means full portal restriction until payment begins
      if (feeRecord.status === 'Not Paid') {
        setIsRestricted(true);
      } else {
        setIsRestricted(false);
      }
    } else if (totalRequired > 0) {
      // If no record exists but there's a fee standard, it's unpaid
      setIsRestricted(true);
    } else {
      setIsRestricted(false);
    }
  }, [feeRecord, feeStandard]);

  const filteredResults = results.filter(r => 
    r.term === selectedTerm && 
    r.session === selectedSession
  );

  const calculateTotal = () => filteredResults.reduce((acc, curr) => acc + (curr.ca1_score + curr.ca2_score + curr.exam_score || 0), 0);
  const calculateAverage = () => {
    if (filteredResults.length === 0) return '0.00';
    return (calculateTotal() / filteredResults.length).toFixed(2);
  };

  const calculatePosition = () => {
    if (!studentData || classResults.length === 0) return { rank: '-', total: classStudents.length };
    
    // Calculate averages for all students in class, excluding subjects with zero total score
    const averages = classStudents.map(s => {
      const studentResults = classResults.filter(r => r.student_id === s.id && (r.ca1_score + r.ca2_score + r.exam_score) > 0);
      if (studentResults.length === 0) return { id: s.id, avg: 0 };
      const total = studentResults.reduce((acc, r) => acc + (r.ca1_score + r.ca2_score + r.exam_score), 0);
      return { id: s.id, avg: total / studentResults.length };
    });

    // Sort by average descending
    const sorted = [...averages].sort((a, b) => b.avg - a.avg);
    const rank = sorted.findIndex(s => s.id === studentData.id) + 1;
    
    if (rank === 0) return { rank: '-', total: classStudents.length };
    
    // Add suffix
    const j = rank % 10, k = rank % 100;
    let rankStr = rank.toString();
    if (j === 1 && k !== 11) rankStr = rank + "st";
    else if (j === 2 && k !== 12) rankStr = rank + "nd";
    else if (j === 3 && k !== 13) rankStr = rank + "rd";
    else rankStr = rank + "th";

    return { rank: rankStr, total: classStudents.length };
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

  const sessions = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return `${year}/${year + 1}`;
  });

  const terms = ['First Term', 'Second Term', 'Third Term'];

  useEffect(() => {
    async function fetchStudentData() {
      if (!profile || !profile.username) return;

      try {
        // Fetch settings first
        const { data: settingsData } = await supabase.from('settings').select('*').single();
        setSettings(settingsData);
        if (settingsData?.current_term) setSelectedTerm(settingsData.current_term);
        if (settingsData?.current_session) setSelectedSession(settingsData.current_session);

        // Find the student record associated with this user's username (admission number)
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('*, class:classes(*)')
          .eq('admission_number', profile.username)
          .maybeSingle();

        if (studentError) throw studentError;

        if (student) {
          setStudentData(student);
          
          // Fetch results for this student and filter out those with zero total score
          const { data: resultsData } = await supabase
            .from('results')
            .select('*, subject:subjects(*)')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false });
          
          const filteredResults = (resultsData || []).filter((r: any) => (r.ca1_score + r.ca2_score + r.exam_score) > 0);
          setResults(filteredResults);

          // Fetch psychomotor skills
          const { data: psychoData } = await supabase
            .from('psychomotor_skills')
            .select('*')
            .eq('student_id', student.id)
            .eq('term', selectedTerm)
            .eq('session', selectedSession)
            .maybeSingle();
          setPsychomotor(psychoData);

          // Fetch all results for this class to calculate position
          const { data: classResultsData } = await supabase
            .from('results')
            .select('student_id, subject_id, ca1_score, ca2_score, exam_score')
            .eq('class_id', student.class_id)
            .eq('term', selectedTerm)
            .eq('session', selectedSession);
          setClassResults(classResultsData || []);

          // Fetch all students in this class to ensure accurate ranking
          const { data: classStudentsData } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', student.class_id);
          setClassStudents(classStudentsData || []);

          // Fetch attendance summary
          const { data: attData } = await supabase
            .from('attendance')
            .select('status')
            .eq('student_id', student.id)
            .eq('term', selectedTerm)
            .eq('session', selectedSession);
          
          if (attData) {
            setAttendanceStats({
              present: attData.filter(a => a.status === 'Present').length,
              total: attData.length
            });
          }

          // Fetch fee status
          const { data: feeData } = await supabase
            .from('fee_records')
            .select('*')
            .eq('student_id', student.id)
            .eq('term', selectedTerm)
            .eq('session', selectedSession)
            .maybeSingle();
          setFeeRecord(feeData);

          // Fetch fee standard for this student's class
          const { data: standardData } = await supabase
            .from('fee_standards')
            .select('amount')
            .eq('class_id', student.class_id)
            .eq('term', selectedTerm)
            .eq('session', selectedSession)
            .maybeSingle();
          setFeeStandard(Number(standardData?.amount || 0));

          // Fetch announcements
          const { data: annData } = await supabase
            .from('announcements')
            .select('*')
            .or(`target_role.eq.all,target_role.eq.student`)
            .or(`target_class_id.is.null,target_class_id.eq.${student.class_id}`)
            .order('created_at', { ascending: false })
            .limit(5);
          
          // Filter out class-specific announcements that aren't for THIS student's class (manual filter due to complex OR)
          const finalAnnouncements = (annData || []).filter(a => 
            !a.target_class_id || a.target_class_id === student.class_id
          );

          setAnnouncements(finalAnnouncements);
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStudentData();
  }, [profile, selectedTerm, selectedSession]);

  if (loading) return (
    <div className="animate-pulse space-y-8 p-8">
      <div className="h-10 bg-slate-200 rounded w-1/3"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>)}
      </div>
      <div className="h-64 bg-slate-200 rounded-3xl"></div>
    </div>
  );

  if (isRestricted && studentData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full bg-white rounded-[3rem] p-12 shadow-2xl border border-slate-100 text-center space-y-8"
        >
          <div className="w-24 h-24 bg-rose-50 rounded-[2rem] flex items-center justify-center mx-auto border-4 border-white shadow-xl shadow-rose-100">
            <Lock className="w-12 h-12 text-rose-500" />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-slate-900 leading-tight">Portal Restricted</h1>
            <p className="text-slate-500 font-medium text-lg">
              Access to the student portal for <span className="text-slate-900 font-bold">{settings?.current_term} {settings?.current_session}</span> is temporarily restricted due to unpaid school fees.
            </p>
          </div>

          <div className="p-6 bg-slate-50 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Total Fees Required</span>
              <span className="text-lg font-black text-slate-900">₦{(feeRecord?.total_amount ? Number(feeRecord.total_amount) : feeStandard).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-widest text-rose-600">Amount Outstanding</span>
              <span className="text-lg font-black text-rose-600">₦{((feeRecord?.total_amount ? Number(feeRecord.total_amount) : feeStandard) - Number(feeRecord?.amount_paid || 0)).toLocaleString()}</span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 w-0 transition-all duration-1000" />
            </div>
            <p className="text-xs text-slate-400 font-bold uppercase">Payment of at least 10% is required to unlock basic features.</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-left">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-black text-emerald-900 uppercase">Step 1: Make Payment</p>
                <p className="text-[11px] text-emerald-700 font-medium">Pay school fees at the bursar's office or via online bank transfer.</p>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3 text-left">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-black text-blue-900 uppercase">Step 2: Verification</p>
                <p className="text-[11px] text-blue-700 font-medium">The cashier will verify your payment and update your portal status.</p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest leading-loose">
              If you have already paid, please contact the <br />
              <span className="text-slate-900">ACCOUNTS DEPARTMENT</span> for verification.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">
            Welcome, <span className="text-purple-600">{studentData ? [studentData.first_name, studentData.middle_name, studentData.last_name].filter(Boolean).join(' ') : profile?.name}</span>!
          </h1>
          <p className="text-slate-600 mt-2 font-medium text-lg">
            We're glad to have you back in your student portal.
          </p>
        </div>
        {studentData && (
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admission No</p>
              <p className="text-sm font-bold text-slate-900 font-mono">{studentData.admission_number}</p>
            </div>
          </div>
        )}
      </header>

      {/* Welcome Note Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-[2rem] p-8 text-white shadow-xl shadow-purple-200 relative overflow-hidden"
      >
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            Welcome Note
          </h2>
          <p className="text-purple-50 max-w-2xl text-lg leading-relaxed">
            Hello {studentData?.first_name || profile?.name}, we are excited to have you here! This portal is your personal space to track your academic journey, check your results, and use AI tools to help with your studies. Keep pushing for excellence!
          </p>
        </div>
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-purple-900/20 rounded-full blur-2xl" />
      </motion.div>

      {/* Announcements Feed */}
      {announcements.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-purple-600 font-black text-[10px] uppercase tracking-widest px-2">
            <Megaphone className="w-3 h-3" /> Latest Announcements
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scroll-hide">
            {announcements.map((ann) => (
              <motion.div 
                key={ann.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0 w-[350px] bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Megaphone className="w-16 h-16 -rotate-12 text-slate-900" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                   <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                   <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                     {new Date(ann.created_at).toLocaleDateString()}
                   </span>
                </div>
                <h3 className="font-bold text-slate-900 mb-2 line-clamp-1">{ann.title}</h3>
                <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">
                  {ann.content}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-purple-500 p-4 rounded-xl text-white shadow-lg shadow-purple-100">
            <School className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">My Class</p>
            <p className="text-xl font-bold text-slate-900">{studentData?.class?.class_name || 'Not Assigned'}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-emerald-500 p-4 rounded-xl text-white shadow-lg shadow-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Attendance</p>
            <p className="text-xl font-bold text-slate-900">{attendanceStats.present}/{attendanceStats.total} Days</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-blue-500 p-4 rounded-xl text-white shadow-lg shadow-blue-100">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Subjects</p>
            <p className="text-xl font-bold text-slate-900">{results.length > 0 ? new Set(results.map(r => r.subject_id)).size : 0}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-orange-500 p-4 rounded-xl text-white shadow-lg shadow-orange-100">
            <Wallet className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500">Fees Balance</p>
            <div className="flex items-center justify-between">
              <p className="text-xl font-bold text-slate-900">
                ₦{((feeRecord?.total_amount ? Number(feeRecord.total_amount) : feeStandard) - Number(feeRecord?.amount_paid || 0)).toLocaleString()}
              </p>
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                feeRecord?.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : 
                feeRecord?.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
              }`}>
                {feeRecord?.status || 'Not Paid'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <AIHomeworkHelper />
          
          {/* Results Filter & Table */}
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Academic Results</h2>
                <p className="text-slate-500 text-sm">Filter and view your performance by term.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Table View
                  </button>
                  <button
                    onClick={() => setViewMode('report')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'report' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Report Card
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  <select 
                    value={selectedSession}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer px-3 py-1"
                  >
                    {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="w-[1px] h-4 bg-slate-200" />
                  <select 
                    value={selectedTerm}
                    onChange={(e) => setSelectedTerm(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer px-3 py-1"
                  >
                    {terms.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button 
                  onClick={() => setIsPrintModalOpen(true)}
                  disabled={filteredResults.length === 0 || feeRecord?.results_locked !== false}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm shadow-lg shadow-slate-200"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </button>
              </div>
            </div>

            {feeRecord?.results_locked !== false ? (
              <div className="py-20 text-center space-y-6">
                <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto border-4 border-white shadow-xl shadow-rose-100">
                  <Lock className="w-12 h-12 text-rose-500" />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-2xl font-black text-slate-900 mb-2">Results Restricted</h3>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    Access to your academic results for {selectedTerm} {selectedSession} is restricted due to outstanding school fees.
                  </p>
                  <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <p className="text-xs text-blue-700 font-bold uppercase tracking-widest mb-1">How to unlock?</p>
                    <p className="text-sm text-blue-900 leading-normal">
                      Please visit the bursar's office or make a payment to clear your balance. Your results will be available as soon as your payment is confirmed by the cashier.
                    </p>
                  </div>
                </div>
              </div>
            ) : viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-slate-100">
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">Subject</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">CA1</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">CA2</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Exam</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Total</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Pos</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Grade</th>
                      <th className="pb-4 font-black text-[10px] text-slate-400 uppercase tracking-widest text-center">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredResults.length > 0 ? (
                      filteredResults.map((result) => {
                        const total = result.ca1_score + result.ca2_score + result.exam_score;
                        const getGrade = (score: number) => {
                          if (score >= 75) return { label: 'A1', color: 'text-emerald-600 bg-emerald-50' };
                          if (score >= 70) return { label: 'B2', color: 'text-emerald-500 bg-emerald-50' };
                          if (score >= 65) return { label: 'B3', color: 'text-blue-600 bg-blue-50' };
                          if (score >= 60) return { label: 'C4', color: 'text-blue-500 bg-blue-50' };
                          if (score >= 55) return { label: 'C5', color: 'text-indigo-600 bg-indigo-50' };
                          if (score >= 50) return { label: 'C6', color: 'text-indigo-500 bg-indigo-50' };
                          if (score >= 45) return { label: 'D7', color: 'text-orange-600 bg-orange-50' };
                          if (score >= 40) return { label: 'E8', color: 'text-orange-500 bg-orange-50' };
                          return { label: 'F9', color: 'text-rose-600 bg-rose-50' };
                        };
                        const grade = getGrade(total);
                        const pos = calculateSubjectPosition(result.subject_id, total);
                        const remark = getRemark(total);
                        
                        return (
                          <tr key={result.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4">
                              <p className="font-bold text-slate-900">{result.subject?.subject_name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{result.subject?.subject_code}</p>
                            </td>
                            <td className="py-4 text-center font-medium text-slate-600">{result.ca1_score}</td>
                            <td className="py-4 text-center font-medium text-slate-600">{result.ca2_score}</td>
                            <td className="py-4 text-center font-medium text-slate-600">{result.exam_score}</td>
                            <td className="py-4 text-center">
                              <span className="font-black text-slate-900">{total}</span>
                            </td>
                            <td className="py-4 text-center font-bold text-blue-600 text-xs">{pos}</td>
                            <td className="py-4 text-center">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${grade.color}`}>
                                {grade.label}
                              </span>
                            </td>
                            <td className="py-4 text-center">
                              <span className="text-[10px] font-bold text-slate-500">{remark}</span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 italic text-sm">
                          No results found for {selectedTerm}, {selectedSession}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white border-2 border-slate-100 rounded-3xl p-10 relative overflow-hidden">
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
                      <h1 className="text-3xl font-extrabold text-[#112255] uppercase tracking-tight leading-none text-left">
                        {settings?.school_name || "PRINCE AND PRINCESS INTERNATIONAL SCHOOL"}
                      </h1>
                      <p className="text-blue-500 font-bold tracking-widest text-[11px] uppercase text-left">
                        {settings?.school_motto || "CHARACTER, SKILL AND CAREER"}
                      </p>
                      <div className="pt-2 text-left">
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
                      <span>Term: {selectedTerm}</span>
                      <span className="text-blue-400">✦</span>
                      <span>Session: {selectedSession}</span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex items-center gap-3 shadow-inner">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <Trophy className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-left font-sans">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Digital Verification</div>
                        <div className="text-[9px] font-mono font-bold text-slate-600 tracking-tighter mt-1 select-all">REF: RC/{studentData?.admission_number}/{selectedSession?.replace('/', '')}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Student Info Bar */}
                {(() => {
                  const classCategory = studentData?.class?.category || 'Junior';
                  const isSenior = classCategory === 'Senior';
                  return (
                    <div className="bg-[#8cc63f] rounded-2xl p-4 text-white shadow-sm grid grid-cols-12 gap-4 items-center mb-8 relative z-10 text-left">
                      <div className="col-span-5 px-2">
                        <div className="text-[9px] font-semibold text-white/80 uppercase tracking-wider mb-1 leading-none">Student Name</div>
                        <div className="text-sm font-black uppercase tracking-tight leading-tight break-words">
                          {[studentData?.last_name, [studentData?.first_name, studentData?.middle_name].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                        </div>
                      </div>
                      <div className="col-span-2 px-2 border-l border-white/20">
                        <div className="text-[9px] font-semibold text-white/80 uppercase tracking-wider mb-1 leading-none">Class & Category</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black uppercase tracking-tight">{studentData?.class?.class_name}</span>
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
                          {studentData?.admission_number}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-col lg:flex-row gap-8 relative z-10">
                  {/* Left Side: Psychomotor & Affective */}
                  <div className="lg:w-1/3 space-y-6">
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
                    <table className="w-full border-collapse border border-slate-200 rounded-2xl overflow-hidden">
                      <thead>
                        <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest">
                          <th className="px-4 py-3 text-left border border-slate-800">Subject</th>
                          <th className="px-2 py-3 text-center border border-slate-800">CA1 (20)</th>
                          <th className="px-2 py-3 text-center border border-slate-800">CA2 (20)</th>
                          <th className="px-2 py-3 text-center border border-slate-800">Exam (60)</th>
                          <th className="px-2 py-3 text-center border border-slate-800">Total (100)</th>
                          <th className="px-2 py-3 text-center border border-slate-800">Pos</th>
                          <th className="px-4 py-3 text-center border border-slate-800">Grade</th>
                          <th className="px-4 py-3 text-center border border-slate-800">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {filteredResults.map((r, idx) => {
                          const total = r.ca1_score + r.ca2_score + r.exam_score;
                          const getGrade = (score: number) => {
                            if (score >= 70) return { label: 'A', color: 'text-emerald-600' };
                            if (score >= 60) return { label: 'B', color: 'text-blue-600' };
                            if (score >= 50) return { label: 'C', color: 'text-amber-600' };
                            if (score >= 45) return { label: 'D', color: 'text-orange-600' };
                            if (score >= 40) return { label: 'E', color: 'text-orange-400' };
                            return { label: 'F', color: 'text-red-600' };
                          };
                          const grade = getGrade(total);
                          const pos = calculateSubjectPosition(r.subject_id, total);
                          const remark = getRemark(total);

                          return (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="px-4 py-3 border border-slate-200 font-bold text-slate-900">
                                {r.subject?.subject_name}
                              </td>
                              <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                {r.ca1_score}
                              </td>
                              <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                {r.ca2_score}
                              </td>
                              <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                {r.exam_score}
                              </td>
                              <td className="px-2 py-3 border border-slate-200 text-center font-black">
                                {total}
                              </td>
                              <td className="px-2 py-3 border border-slate-200 text-center font-bold text-blue-600 text-xs">
                                {pos}
                              </td>
                              <td className={`px-4 py-3 border border-slate-200 text-center font-black ${grade.color}`}>{grade.label}</td>
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
                          <td colSpan={7} className="px-4 py-2 border border-blue-900">
                            <div className="flex justify-between items-center w-full">
                              <div>Grand Total: <span className="text-amber-300 font-black text-[13px] select-all">{calculateTotal()}</span></div>
                              <div className="border-l border-white/20 pl-4 font-black">Average: <span className="text-amber-300 font-black text-[13px]">{calculateAverage()}%</span></div>
                              {studentData?.class?.category !== 'Senior' && (
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

                    {/* Appraisals Side-by-Side */}
                    <div className="mt-6 grid grid-cols-2 gap-4 relative z-10 text-left">
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
                    <div className="mt-4 grid grid-cols-3 gap-4 items-stretch relative z-10 text-left">
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
                        <div className="space-y-1 font-sans">
                          <div className="flex justify-between items-center text-[10px] border-b border-white/10 pb-1">
                            <span className="text-blue-200">Days Present:</span>
                            <span className="font-mono font-black text-amber-300">{psychomotor?.days_present || 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-blue-200">Total Days:</span>
                            <span className="font-mono font-black text-slate-300">{psychomotor?.total_days || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Signatures Panel */}
                    <div className="mt-8 flex justify-between items-end px-4 relative z-10 text-center">
                      <div>
                        <div className="text-[9px] font-black text-slate-300 italic mb-1 uppercase tracking-widest">Authenticated</div>
                        <div className="w-36 border-b border-dashed border-slate-900 mb-2"></div>
                        <div className="text-[8px] font-black text-[#112255] uppercase tracking-wider">Class Teacher</div>
                      </div>

                      <div className="flex flex-col items-center">
                        <div className="mb-2">
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Next Term Resumption</div>
                          <div className="w-36 px-2 py-1 text-xs border border-slate-200 bg-slate-50 rounded-lg text-center font-bold text-slate-800 tracking-tight">
                            {settings?.next_term_begins || '4th May, 2026'}
                          </div>
                        </div>
                        <div className="h-8 flex items-center justify-center mb-1">
                          {settings?.principal_signature_url && (
                            <img src={settings.principal_signature_url} alt="Signature" className="h-8 object-contain" />
                          )}
                        </div>
                        <div className="w-40 border-b border-dashed border-slate-900 mb-2"></div>
                        <div className="text-[8px] font-black text-[#112255] uppercase tracking-wider">Principal's Seal & Signature</div>
                      </div>

                      <div>
                        <div className="font-mono text-[10px] text-slate-800 font-extrabold mb-1 bg-slate-50 border border-slate-100 rounded px-2.5 py-0.5 shadow-sm">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                        <div className="w-36 border-b border-dashed border-slate-900 mb-2"></div>
                        <div className="text-[8px] font-black text-[#112255] uppercase tracking-wider mt-1">Registrar</div>
                      </div>
                    </div>

                    {/* Brand Ribbon Footer */}
                    <div className="mt-8 -mx-10 -mb-10 bg-[#112255] text-white/90 text-[8px] px-8 py-2.5 flex justify-between items-center rounded-b-2xl border-t border-slate-850 font-black tracking-widest uppercase relative z-10">
                      <div>{settings?.school_name || "PRINCE AND PRINCESS INTERNATIONAL SCHOOL"} MANAGEMENT SYSTEM</div>
                      <div>REF: RC/{studentData?.admission_number}/{selectedTerm?.replace(' ', '').toUpperCase()}/{selectedSession?.replace('/', '')}</div>
                      <div>Page 1 of 1</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Recent Results</h2>
              <ClipboardList className="w-5 h-5 text-slate-400" />
            </div>
            <div className="space-y-4">
              {results.length > 0 ? (
                results.slice(0, 5).map((result) => (
                  <div key={result.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{result.subject?.subject_name}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">{result.term} - {result.session}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-lg text-sm font-black ${
                      result.total_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                      result.total_score >= 50 ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {result.total_score}%
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 italic text-sm">
                  No results recorded yet.
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-32 h-32" />
            </div>
            <h3 className="text-lg font-bold mb-2">Study Tip</h3>
            <p className="text-blue-100 text-sm leading-relaxed">
              Did you know? Explaining a concept to someone else is one of the best ways to learn it yourself. Try using the AI Homework Helper to learn something new, then explain it to a friend!
            </p>
          </div>
        </div>
      </div>

      {/* Print Report Card Modal */}
      <AnimatePresence>
        {isPrintModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Report Card Preview</h2>
                    <p className="text-xs text-slate-500 font-medium">{selectedTerm} - {selectedSession}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 bg-white" id="printable-report">
                <div className="min-w-[800px] bg-white p-10 relative">
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

                  {/* Header */}
                  <div className="flex items-center justify-between border-b-4 border-blue-600 pb-6 mb-8 relative z-10">
                    <div className="flex items-center gap-6">
                      {settings?.school_logo_url ? (
                        <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain" />
                      ) : (
                        <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center">
                          <GraduationCap className="w-14 h-14 text-white" />
                        </div>
                      )}
                      <div>
                        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{settings?.school_name}</h1>
                        <p className="text-blue-600 font-bold italic">{settings?.school_motto}</p>
                        <div className="mt-2 flex gap-4 text-sm text-slate-600 font-bold">
                          <span className="bg-slate-100 px-3 py-1 rounded-full">{selectedTerm} Term</span>
                          <span className="bg-slate-100 px-3 py-1 rounded-full">{selectedSession} Session</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-black text-slate-200 uppercase tracking-tighter">Report Card</div>
                      <div className="text-slate-400 font-mono text-sm mt-1">ID: {studentData?.admission_number}</div>
                    </div>
                  </div>

                  {/* Student Info Grid */}
                  <div className="grid grid-cols-12 gap-4 mb-8 relative z-10">
                    <div className="col-span-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <User className="w-3 h-3" /> Name
                      </div>
                      <div className="font-bold text-slate-900 break-words text-sm">
                        {[studentData?.first_name, studentData?.middle_name, studentData?.last_name].filter(Boolean).join(' ')}
                      </div>
                    </div>
                    <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> Class
                      </div>
                      <div className="font-bold text-slate-900 text-sm overflow-hidden text-ellipsis whitespace-nowrap">{studentData?.class?.class_name}</div>
                    </div>
                    <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> Position
                      </div>
                      <div className="font-bold text-slate-900 text-sm">
                        {calculatePosition().rank} <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">/ {calculatePosition().total}</span>
                      </div>
                    </div>
                    <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Attendance
                      </div>
                      <div className="font-bold text-slate-900 text-sm whitespace-nowrap">
                        {attendanceStats.present}/{attendanceStats.total} Days
                      </div>
                    </div>
                    <div className="col-span-2 bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-200 text-white">
                      <div className="text-[10px] font-black text-blue-200 uppercase mb-1">Average</div>
                      <div className="text-xl font-black">{calculateAverage()}%</div>
                    </div>
                  </div>

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
                      <table className="w-full border-collapse border border-slate-200 rounded-2xl overflow-hidden">
                        <thead>
                          <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest">
                            <th className="px-4 py-3 text-left border border-slate-800">Subject</th>
                            <th className="px-2 py-3 text-center border border-slate-800">CA1 (20)</th>
                            <th className="px-2 py-3 text-center border border-slate-800">CA2 (20)</th>
                            <th className="px-2 py-3 text-center border border-slate-800">Exam (60)</th>
                            <th className="px-2 py-3 text-center border border-slate-800">Total (100)</th>
                            <th className="px-2 py-3 text-center border border-slate-800">Pos</th>
                            <th className="px-4 py-3 text-center border border-slate-800">Grade</th>
                            <th className="px-4 py-3 text-center border border-slate-800">Remark</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {filteredResults.map((r, idx) => {
                            const total = r.ca1_score + r.ca2_score + r.exam_score;
                            const getGrade = (score: number) => {
                              if (score >= 70) return { label: 'A', color: 'text-emerald-600' };
                              if (score >= 60) return { label: 'B', color: 'text-blue-600' };
                              if (score >= 50) return { label: 'C', color: 'text-amber-600' };
                              if (score >= 45) return { label: 'D', color: 'text-orange-600' };
                              if (score >= 40) return { label: 'E', color: 'text-orange-400' };
                              return { label: 'F', color: 'text-red-600' };
                            };
                            const grade = getGrade(total);
                            const pos = calculateSubjectPosition(r.subject_id, total);
                            const remark = getRemark(total);

                            return (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="px-4 py-3 border border-slate-200 font-bold text-slate-900">
                                  {r.subject?.subject_name}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                  {r.ca1_score}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                  {r.ca2_score}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                  {r.exam_score}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-black">
                                  {total}
                                </td>
                                <td className="px-2 py-3 border border-slate-200 text-center font-bold text-blue-600 text-xs">
                                  {pos}
                                </td>
                                <td className={`px-4 py-3 border border-slate-200 text-center font-black ${grade.color}`}>{grade.label}</td>
                                <td className="px-4 py-3 border border-slate-200 text-center text-[10px] font-bold text-slate-500">
                                  {remark}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-900 text-white">
                            <td className="px-4 py-3 font-bold border border-slate-800">Grand Total</td>
                            <td colSpan={3} className="border border-slate-800"></td>
                            <td className="px-4 py-3 text-center font-black border border-slate-800">{calculateTotal()}</td>
                            <td colSpan={2} className="border border-slate-800"></td>
                          </tr>
                        </tfoot>
                      </table>

                      {/* Remarks Section */}
                      <div className="mt-8 grid grid-cols-1 gap-6">
                        <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl">
                          <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase mb-2">
                            <MessageSquare className="w-3 h-3" /> Class Teacher's Remark
                          </div>
                          <p className="text-sm text-slate-700 italic min-h-[40px]">
                            {psychomotor?.teacher_remark || 'No remark provided.'}
                          </p>
                        </div>
                        <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl">
                          <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase mb-2">
                            <MessageSquare className="w-3 h-3" /> Principal's Remark
                          </div>
                          <p className="text-sm text-slate-700 italic min-h-[40px]">
                            {psychomotor?.principal_remark || 'No remark provided.'}
                          </p>
                        </div>
                      </div>

                      {/* Signatures */}
                      <div className="mt-12 flex justify-between items-end px-4">
                        <div className="text-center">
                          <div className="w-40 border-b-2 border-slate-900 mb-2"></div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Class Teacher</div>
                        </div>
                        <div className="text-center">
                          <div className="mb-4">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Next Term Begins</div>
                            <div className="w-40 px-2 py-1 text-xs border border-slate-200 rounded text-center font-bold bg-slate-50">
                              {settings?.next_term_begins || 'TBD'}
                            </div>
                          </div>
                          <div className="h-12 flex items-center justify-center mb-1">
                            {settings?.principal_signature_url && (
                              <img src={settings.principal_signature_url} alt="Signature" className="h-12 object-contain" />
                            )}
                          </div>
                          <div className="w-40 border-b-2 border-slate-900 mb-2"></div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Principal's Signature</div>
                        </div>
                        <div className="text-center">
                          <div className="font-mono text-xs text-slate-900 font-bold">{new Date().toLocaleDateString()}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Date Issued</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-4">
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-8 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-black shadow-xl shadow-slate-200 flex items-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  Print Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
