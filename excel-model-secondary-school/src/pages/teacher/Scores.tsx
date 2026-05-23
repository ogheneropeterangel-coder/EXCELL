import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Student, Class, Subject, Settings, Result } from '../../types';
import * as XLSX from 'xlsx';
import { 
  Save, 
  Search, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Brain,
  GraduationCap,
  Activity,
  Heart,
  CalendarDays,
  MessageSquare,
  Printer,
  Download
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

type Tab = 'academic' | 'psychomotor';

export default function Scores() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('academic');
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filters, setFilters] = useState({
    class_id: '',
    subject_id: '',
  });

  const [scores, setScores] = useState<{[key: number]: { ca1: number, ca2: number, exam: number, exists?: boolean }}>({});
  const [psychomotor, setPsychomotor] = useState<{[key: number]: any}>({});

  useEffect(() => {
    fetchInitialData();
  }, [profile]);

  useEffect(() => {
    if (filters.class_id) {
      fetchSubjectsForClass(filters.class_id);
    } else {
      setSubjects([]);
    }
  }, [filters.class_id]);

  async function fetchInitialData() {
    if (!profile) return;
    console.log('Scores: Fetching initial data for profile:', profile.id, profile.role);
    try {
      let classesQuery = supabase.from('classes').select('*').order('class_name');

      if (profile.role === 'teacher') {
        // Fetch only classes assigned to this teacher
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

        console.log('Scores: Teacher assigned class IDs:', classIds);
        
        if (classIds.length > 0) {
          classesQuery = classesQuery.in('id', classIds);
        } else {
          // If no classes assigned, return empty list
          setClasses([]);
          setLoading(false);
          return;
        }
      }

      const [classesRes, settingsRes] = await Promise.all([
        classesQuery,
        supabase.from('settings').select('*').single(),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (settingsRes.error && settingsRes.error.code !== 'PGRST116') throw settingsRes.error;

      console.log('Scores: Classes fetched:', classesRes.data?.length);
      setClasses(classesRes.data || []);
      setSettings(settingsRes.data);
    } catch (error: any) {
      console.error('Scores: Error in fetchInitialData:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSubjectsForClass(classId: string) {
    if (!profile) return;
    console.log('Scores: Fetching subjects for class:', classId);
    try {
      // 1. Fetch all subjects assigned to this class
      const { data: classSubjectsData, error: classSubjectsError } = await supabase
        .from('class_subjects')
        .select('subject_id, subjects(*)')
        .eq('class_id', classId);

      if (classSubjectsError) throw classSubjectsError;

      const subjectsForClass = classSubjectsData?.map(d => {
        if (Array.isArray(d.subjects)) return d.subjects[0] as unknown as Subject;
        return d.subjects as unknown as Subject;
      }).filter(Boolean) || [];

      console.log('Scores: Total subjects for class:', subjectsForClass.length);

      let finalSubjects: Subject[] = [];

      if (profile.role === 'teacher') {
        // 2. Fetch subjects assigned to this teacher
        const { data: teacherSubjectsData } = await supabase
          .from('teacher_subjects')
          .select('subject_id, subjects(*)')
          .eq('teacher_id', profile.id);
        
        const teacherSubjects = teacherSubjectsData?.map(d => {
          if (Array.isArray(d.subjects)) return d.subjects[0] as unknown as Subject;
          return d.subjects as unknown as Subject;
        }).filter(Boolean) || [];
        
        const teacherSubjectIds = teacherSubjects.map(s => s.id);
        
        // 3. Check if teacher is the Form Teacher for this class
        const { data: isFormTeacher } = await supabase
          .from('classes')
          .select('id')
          .eq('id', classId)
          .eq('teacher_id', profile.id)
          .maybeSingle();

        if (isFormTeacher) {
          // Form teachers see all subjects in their class
          finalSubjects = subjectsForClass;
        } else {
          // Subject teachers only see their assigned subjects that are also in this class
          finalSubjects = subjectsForClass.filter(s => teacherSubjectIds.includes(s.id));
          
          // Fallback 1: If no intersection but teacher has assigned subjects, show teacher's subjects
          if (finalSubjects.length === 0 && teacherSubjects.length > 0) {
             console.log('Scores: No class-subject intersection, showing teacher assigned subjects');
             finalSubjects = teacherSubjects;
          }
        }

        // Fallback 2: If still no subjects, fetch ALL subjects as last resort
        if (finalSubjects.length === 0) {
          console.log('Scores: Still no subjects, fetching all subjects as last resort');
          const { data: allSubjectsData } = await supabase.from('subjects').select('*').order('subject_name');
          finalSubjects = allSubjectsData || [];
        }
      } else {
        // Admin sees all subjects in the class
        finalSubjects = subjectsForClass;
        // If class has no subjects, show all subjects
        if (finalSubjects.length === 0) {
          const { data: allSubjectsData } = await supabase.from('subjects').select('*').order('subject_name');
          finalSubjects = allSubjectsData || [];
        }
      }

      setSubjects(finalSubjects);

      // Reset selected subject if it's no longer in the list
      if (filters.subject_id) {
        const currentSubjectId = parseInt(filters.subject_id);
        if (!finalSubjects.find(s => s.id === currentSubjectId)) {
          setFilters(f => ({ ...f, subject_id: '' }));
        }
      }
    } catch (error: any) {
      console.error('Scores: Error in fetchSubjectsForClass:', error);
      toast.error(error.message);
    }
  }

  async function fetchStudents() {
    if (!filters.class_id || (activeTab === 'academic' && !filters.subject_id)) {
      toast.error('Please select required filters');
      return;
    }

    console.log('Scores: Fetching students for class:', filters.class_id);
    setLoading(true);
    try {
      let query = supabase
        .from('students')
        .select('*')
        .eq('class_id', filters.class_id)
        .order('last_name');

      // Removed restrictive teacher_id filtering to allow teachers to see all students in the selected class
      // matching the admin behavior as requested.

      const { data: studentsData, error: studentsError } = await query;

      if (studentsError) throw studentsError;

      console.log('Scores: Students fetched:', studentsData?.length);
      
      if (activeTab === 'academic') {
        console.log('Scores: Fetching academic results for term:', settings?.current_term);
        const { data: resultsData, error: resultsError } = await supabase
          .from('results')
          .select('*')
          .eq('class_id', filters.class_id)
          .eq('subject_id', filters.subject_id)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session);

        if (resultsError) throw resultsError;
        console.log('Scores: Results fetched:', resultsData?.length);

        const initialScores: any = {};
        studentsData?.forEach(s => {
          const existing = resultsData?.find(r => r.student_id === s.id);
          initialScores[s.id] = {
            ca1: existing?.ca1_score || 0,
            ca2: existing?.ca2_score || 0,
            exam: existing?.exam_score || 0,
            exists: !!existing,
          };
        });
        setScores(initialScores);
      } else {
        console.log('Scores: Fetching psychomotor skills for term:', settings?.current_term);
        const { data: psychoData, error: psychoError } = await supabase
          .from('psychomotor_skills')
          .select('*')
          .eq('class_id', filters.class_id)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session);

        if (psychoError) throw psychoError;
        console.log('Scores: Psychomotor data fetched:', psychoData?.length);

        const initialPsycho: any = {};
        studentsData?.forEach(s => {
          const existing = psychoData?.find(p => p.student_id === s.id);
          initialPsycho[s.id] = existing || {
            student_id: s.id,
            class_id: parseInt(filters.class_id),
            term: settings?.current_term,
            session: settings?.current_session,
            handwriting: 0, fluency: 0, games: 0, sports: 0, gymnastics: 0,
            handling_tools: 0, drawing_painting: 0, crafts: 0, musical_skills: 0,
            punctuality: 0, neatness: 0, politeness: 0, honesty: 0,
            relationship_with_others: 0, leadership: 0, emotional_stability: 0,
            health: 0, self_control: 0, attentiveness: 0, perseverance: 0,
            days_present: 0, days_absent: 0, total_days: 0,
            teacher_remark: '', principal_remark: ''
          };
        });
        setPsychomotor(initialPsycho);
      }

      setStudents(studentsData || []);
    } catch (error: any) {
      console.error('Scores: Error in fetchStudents:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAcademic() {
    if (!settings) return;
    setIsSubmitting(true);
    try {
      const resultsToUpsert = students.map(student => ({
        student_id: student.id,
        subject_id: parseInt(filters.subject_id),
        class_id: parseInt(filters.class_id),
        term: settings.current_term,
        session: settings.current_session,
        ca1_score: scores[student.id].ca1,
        ca2_score: scores[student.id].ca2,
        exam_score: scores[student.id].exam,
      }));

      const { error } = await supabase
        .from('results')
        .upsert(resultsToUpsert, { onConflict: 'student_id,subject_id,term,session' });

      if (error) throw error;
      
      // Update local state to show as "exists"
      const updatedScores = { ...scores };
      students.forEach(s => {
        if (updatedScores[s.id]) {
          updatedScores[s.id].exists = true;
        }
      });
      setScores(updatedScores);
      
      toast.success('Academic scores saved');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSavePsychomotor() {
    if (!settings) return;
    setIsSubmitting(true);
    try {
      console.log('Scores: Saving psychomotor skills. User role:', profile?.role);
      const dataToUpsert = Object.values(psychomotor).map((p: any) => ({
        ...p,
        student_id: parseInt(String(p.student_id)),
        class_id: parseInt(String(filters.class_id)),
        term: settings.current_term,
        session: settings.current_session,
        days_present: parseInt(String(p.days_present)) || 0,
        days_absent: parseInt(String(p.days_absent)) || 0,
        total_days: parseInt(String(p.total_days)) || 0,
        // Ensure all rating fields are at least 0
        handwriting: parseInt(String(p.handwriting)) || 0,
        fluency: parseInt(String(p.fluency)) || 0,
        games: parseInt(String(p.games)) || 0,
        sports: parseInt(String(p.sports)) || 0,
        gymnastics: parseInt(String(p.gymnastics)) || 0,
        handling_tools: parseInt(String(p.handling_tools)) || 0,
        drawing_painting: parseInt(String(p.drawing_painting)) || 0,
        crafts: parseInt(String(p.crafts)) || 0,
        musical_skills: parseInt(String(p.musical_skills)) || 0,
        punctuality: parseInt(String(p.punctuality)) || 0,
        neatness: parseInt(String(p.neatness)) || 0,
        politeness: parseInt(String(p.politeness)) || 0,
        honesty: parseInt(String(p.honesty)) || 0,
        relationship_with_others: parseInt(String(p.relationship_with_others)) || 0,
        leadership: parseInt(String(p.leadership)) || 0,
        emotional_stability: parseInt(String(p.emotional_stability)) || 0,
        health: parseInt(String(p.health)) || 0,
        self_control: parseInt(String(p.self_control)) || 0,
        attentiveness: parseInt(String(p.attentiveness)) || 0,
        perseverance: parseInt(String(p.perseverance)) || 0,
      }));

      console.log('Scores: Upserting data:', dataToUpsert);
      const { error, data } = await supabase
        .from('psychomotor_skills')
        .upsert(dataToUpsert, { onConflict: 'student_id,term,session' })
        .select();

      if (error) {
        console.error('Scores: Upsert error detail:', error);
        throw error;
      }
      console.log('Scores: Save response:', data);
      toast.success('Psychomotor skills saved successfully');
    } catch (error: any) {
      console.error('Scores: Final error:', error);
      toast.error(error.message || 'Failed to save psychomotor skills');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function generateAutomaticRemarks() {
    if (!filters.class_id || !settings) return;
    setLoading(true);
    try {
      // Fetch all results for this class, term, and session
      const { data: resultsData, error: resultsError } = await supabase
        .from('results')
        .select('student_id, ca1_score, ca2_score, exam_score')
        .eq('class_id', filters.class_id)
        .eq('term', settings.current_term)
        .eq('session', settings.current_session);

      if (resultsError) throw resultsError;

      // Group by student and calculate average
      const studentAverages: {[key: number]: number} = {};
      const studentCounts: {[key: number]: number} = {};

      resultsData?.forEach(r => {
        const total = (r.ca1_score || 0) + (r.ca2_score || 0) + (r.exam_score || 0);
        studentAverages[r.student_id] = (studentAverages[r.student_id] || 0) + total;
        studentCounts[r.student_id] = (studentCounts[r.student_id] || 0) + 1;
      });

      const newPsychomotor = { ...psychomotor };
      Object.keys(studentAverages).forEach(sid => {
        const studentId = parseInt(sid);
        if (newPsychomotor[studentId]) {
          const avg = studentAverages[studentId] / studentCounts[studentId];
          let remark = "";
          if (avg >= 80) remark = "Excellent work! Your dedication is truly showing in these results. Keep up the fantastic momentum!";
          else if (avg >= 70) remark = "Very good performance! You have a strong grasp of the subjects. Continue to aim for even greater heights.";
          else if (avg >= 60) remark = "Good effort! You're making steady progress. Focus on refining your understanding to reach the next level.";
          else if (avg >= 50) remark = "A fair attempt. You have potential to do much better. Let's identify the areas where you can improve and work on them together.";
          else if (avg >= 40) remark = "You've made a start, but there's significant room for growth. Don't be discouraged—with more focused study and practice, you can improve.";
          else remark = "This result shows you're facing some challenges. Let's work together to find better study strategies and get you back on track. You can do it!";

          newPsychomotor[studentId] = {
            ...newPsychomotor[studentId],
            teacher_remark: remark
          };
        }
      });

      setPsychomotor(newPsychomotor);
      toast.success('Automatic remarks generated based on current scores');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredStudents = students.filter(s => 
    `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const handleDownloadScoresheet = () => {
    if (students.length === 0) {
      toast.error('No student data loaded to download. Please load a class first.');
      return;
    }

    try {
      const selectedCls = classes.find(c => c.id.toString() === filters.class_id);
      const className = selectedCls?.class_name || 'Class';

      if (activeTab === 'academic') {
        const selectedSub = subjects.find(s => s.id.toString() === filters.subject_id);
        const subjectName = selectedSub?.subject_name || 'Subject';

        const dataToExport = students.map(student => {
          const studentScore = scores[student.id] || { ca1: 0, ca2: 0, exam: 0 };
          const total = (studentScore.ca1 || 0) + (studentScore.ca2 || 0) + (studentScore.exam || 0);
          
          let grade = 'F';
          if (total >= 70) grade = 'A';
          else if (total >= 60) grade = 'B';
          else if (total >= 50) grade = 'C';
          else if (total >= 45) grade = 'D';
          else if (total >= 40) grade = 'E';

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

          return {
            'Student Name': [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' '),
            'Admission Number': student.admission_number,
            'CA 1': studentScore.ca1 || 0,
            'CA 2': studentScore.ca2 || 0,
            'Exam Score': studentScore.exam || 0,
            'Total (100)': total,
            'Grade': grade,
            'Remark': getRemark(total)
          };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Academic Scores');

        const fileName = `${className}_${subjectName}_Scores_${settings?.current_term}_${settings?.current_session.replace('/', '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`${subjectName} scoresheet downloaded successfully!`);
      } else {
        const dataToExport = students.map(student => {
          const p = psychomotor[student.id] || {};
          return {
            'Student Name': [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' '),
            'Admission Number': student.admission_number,
            'Days Present': p.days_present || 0,
            'Days Absent': p.days_absent || 0,
            'Total Days': p.total_days || 0,
            'Handwriting': p.handwriting || 0,
            'Fluency': p.fluency || 0,
            'Games': p.games || 0,
            'Sports': p.sports || 0,
            'Gymnastics': p.gymnastics || 0,
            'Handling Tools': p.handling_tools || 0,
            'Drawing & Painting': p.drawing_painting || 0,
            'Crafts': p.crafts || 0,
            'Musical Skills': p.musical_skills || 0,
            'Punctuality': p.punctuality || 0,
            'Neatness': p.neatness || 0,
            'Politeness': p.politeness || 0,
            'Honesty': p.honesty || 0,
            'Relationship with Others': p.relationship_with_others || 0,
            'Leadership': p.leadership || 0,
            'Emotional Stability': p.emotional_stability || 0,
            'Health': p.health || 0,
            'Self Control': p.self_control || 0,
            'Attentiveness': p.attentiveness || 0,
            'Perseverance': p.perseverance || 0,
            'Teacher Remark': p.teacher_remark || '',
            'Principal Remark': p.principal_remark || ''
          };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Psychomotor Ratings');

        const fileName = `${className}_Psychomotor_${settings?.current_term}_${settings?.current_session.replace('/', '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Psychomotor scoresheet downloaded successfully!`);
      }
    } catch (err: any) {
      toast.error('Could not download scoresheet: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manage Scores & Skills</h1>
          <p className="text-slate-500">Record academic performance and behavioral assessments.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setLoading(true);
              fetchInitialData();
              if (filters.class_id) fetchSubjectsForClass(filters.class_id);
              if (students.length > 0) fetchStudents();
            }}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all"
            title="Refresh Data"
          >
            <Activity className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 text-sm font-bold">
            {settings?.current_term} Term | {settings?.current_session} Session
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-200/50 rounded-2xl w-fit">
        <button
          onClick={() => { setActiveTab('academic'); setStudents([]); }}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'academic' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Academic Scores
        </button>
        <button
          onClick={() => { setActiveTab('psychomotor'); setStudents([]); }}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'psychomotor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Psychomotor & Affective
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
          <select
            value={filters.class_id}
            onChange={(e) => setFilters({...filters, class_id: e.target.value})}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Select Class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
          </select>
        </div>
        {activeTab === 'academic' && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
            <select
              value={filters.subject_id}
              onChange={(e) => setFilters({...filters, subject_id: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
            </select>
          </div>
        )}
        <button 
          onClick={fetchStudents}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Load Students
        </button>
      </div>

      {students.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between bg-slate-50/50 gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="text-sm">
                {activeTab === 'academic' 
                  ? (() => {
                      const selectedCls = classes.find(c => c.id.toString() === filters.class_id);
                      const isSenior = selectedCls?.category === 'Senior';
                      return isSenior 
                        ? 'Max CA1: 15 | Max CA2: 15 | Max Exam: 70 | Total: 100'
                        : 'Max CA1: 20 | Max CA2: 20 | Max Exam: 60 | Total: 100';
                    })()
                  : 'Rating Scale: 5 (Excellent) to 1 (Poor)'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {activeTab === 'psychomotor' && (
                <button 
                  onClick={generateAutomaticRemarks}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all flex items-center gap-2 text-sm font-bold"
                >
                  <Brain className="w-4 h-4" />
                  Auto-generate Remarks
                </button>
              )}
              {activeTab === 'academic' && (profile?.role === 'admin' || profile?.role === 'exam_officer') && (
                <button 
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl transition-all flex items-center gap-2 text-sm font-bold border border-blue-200"
                >
                  <Printer className="w-4 h-4 text-blue-600" />
                  Print Score Sheet
                </button>
              )}
              {students.length > 0 && (
                <button 
                  onClick={handleDownloadScoresheet}
                  type="button"
                  className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl transition-all flex items-center gap-2 text-sm font-bold border border-blue-200"
                >
                  <Download className="w-4 h-4 text-blue-600" />
                  Download Scoresheet (Excel)
                </button>
              )}
              <button 
                onClick={activeTab === 'academic' ? handleSaveAcademic : handleSavePsychomotor}
                disabled={isSubmitting}
                className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 font-semibold"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save All Changes
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeTab === 'academic' ? (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  {(() => {
                    const selectedCls = classes.find(c => c.id.toString() === filters.class_id);
                    const isSenior = selectedCls?.category === 'Senior';
                    return (
                      <tr>
                        <th className="px-6 py-4 font-semibold">Student Name</th>
                        <th className="px-6 py-4 font-semibold">Admission No</th>
                        <th className="px-6 py-4 font-semibold w-24">CA1 ({isSenior ? 15 : 20})</th>
                        <th className="px-6 py-4 font-semibold w-24">CA2 ({isSenior ? 15 : 20})</th>
                        <th className="px-6 py-4 font-semibold w-24">Exam ({isSenior ? 70 : 60})</th>
                        <th className="px-6 py-4 font-semibold w-24">Total (100)</th>
                        <th className="px-6 py-4 font-semibold text-right">Status</th>
                      </tr>
                    );
                  })()}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((student) => {
                    const selectedCls = classes.find(c => c.id.toString() === filters.class_id);
                    const isSenior = selectedCls?.category === 'Senior';
                    const maxCA = isSenior ? 15 : 20;
                    const maxExam = isSenior ? 70 : 60;

                    return (
                      <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{student.first_name} {student.last_name}</td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-sm">{student.admission_number}</td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            max={maxCA}
                            min={0}
                            value={scores[student.id]?.ca1 || 0}
                            onChange={(e) => {
                              const val = Math.min(maxCA, Math.max(0, parseInt(e.target.value) || 0));
                              setScores({ ...scores, [student.id]: { ...scores[student.id], ca1: val } });
                            }}
                            className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            max={maxCA}
                            min={0}
                            value={scores[student.id]?.ca2 || 0}
                            onChange={(e) => {
                              const val = Math.min(maxCA, Math.max(0, parseInt(e.target.value) || 0));
                              setScores({ ...scores, [student.id]: { ...scores[student.id], ca2: val } });
                            }}
                            className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            max={maxExam}
                            min={0}
                            value={scores[student.id]?.exam || 0}
                            onChange={(e) => {
                              const val = Math.min(maxExam, Math.max(0, parseInt(e.target.value) || 0));
                              setScores({ ...scores, [student.id]: { ...scores[student.id], exam: val } });
                            }}
                            className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center"
                          />
                        </td>
                      <td className="px-6 py-4">
                        <div className="w-20 py-2 bg-slate-100 border border-slate-200 rounded-lg text-center font-black text-slate-900">
                          {(scores[student.id]?.ca1 || 0) + (scores[student.id]?.ca2 || 0) + (scores[student.id]?.exam || 0)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {scores[student.id]?.exists ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-200 ml-auto"></div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            ) : (
              <div className="p-6 space-y-8">
                {filteredStudents.map((student) => (
                  <div key={student.id} className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                          {student.first_name[0]}{student.last_name[0]}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{student.first_name} {student.last_name}</h3>
                          <p className="text-xs text-slate-500 font-mono">{student.admission_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Attendance</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              placeholder="Present"
                              value={psychomotor[student.id]?.days_present || ''}
                              onChange={(e) => setPsychomotor({...psychomotor, [student.id]: {...psychomotor[student.id], days_present: parseInt(e.target.value)}})}
                              className="w-16 px-2 py-1 text-xs border border-slate-200 rounded bg-white text-center"
                            />
                            <span className="text-slate-300">/</span>
                            <input 
                              type="number" 
                              placeholder="Total"
                              value={psychomotor[student.id]?.total_days || ''}
                              onChange={(e) => setPsychomotor({...psychomotor, [student.id]: {...psychomotor[student.id], total_days: parseInt(e.target.value)}})}
                              className="w-16 px-2 py-1 text-xs border border-slate-200 rounded bg-white text-center"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {/* Psychomotor */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-blue-600 font-bold text-sm border-b border-blue-100 pb-2">
                          <Activity className="w-4 h-4" />
                          Psychomotor Skills
                        </div>
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
                          <div key={skill.key} className="flex items-center justify-between">
                            <label className="text-xs text-slate-600">{skill.label}</label>
                            <select 
                              value={psychomotor[student.id]?.[skill.key] || 0}
                              onChange={(e) => setPsychomotor({...psychomotor, [student.id]: {...psychomotor[student.id], [skill.key]: parseInt(e.target.value)}})}
                              className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
                            >
                              {[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Affective */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-rose-600 font-bold text-sm border-b border-rose-100 pb-2">
                          <Heart className="w-4 h-4" />
                          Affective Domain
                        </div>
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
                          <div key={skill.key} className="flex items-center justify-between">
                            <label className="text-xs text-slate-600">{skill.label}</label>
                            <select 
                              value={psychomotor[student.id]?.[skill.key] || 0}
                              onChange={(e) => setPsychomotor({...psychomotor, [student.id]: {...psychomotor[student.id], [skill.key]: parseInt(e.target.value)}})}
                              className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
                            >
                              {[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Remarks */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-amber-600 font-bold text-sm border-b border-amber-100 pb-2">
                          <MessageSquare className="w-4 h-4" />
                          Remarks
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Teacher's Remark</label>
                            <textarea 
                              value={psychomotor[student.id]?.teacher_remark || ''}
                              onChange={(e) => setPsychomotor({...psychomotor, [student.id]: {...psychomotor[student.id], teacher_remark: e.target.value}})}
                              className="w-full h-24 p-3 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-amber-500"
                              placeholder="Enter behavioral remark..."
                            />
                          </div>
                          {(profile?.role === 'admin' || profile?.role === 'exam_officer') && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Principal's Remark</label>
                              <textarea 
                                value={psychomotor[student.id]?.principal_remark || ''}
                                onChange={(e) => setPsychomotor({...psychomotor, [student.id]: {...psychomotor[student.id], principal_remark: e.target.value}})}
                                className="w-full h-24 p-3 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter principal's remark..."
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Score Sheet Section */}
      {filters.class_id && (
        <div id="printable-scoresheet" className="hidden print:block p-8 bg-white text-slate-900 font-sans">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-300 pb-4 mb-6">
            <h1 className="text-2xl font-black uppercase text-[#112255]">
              {settings?.school_name || "SCHOOL ACADEMIC PORTAL"}
            </h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
              OFFICIAL ACADEMIC SCORE SHEET
            </p>
            <div className="flex justify-center gap-6 mt-3 text-xs font-bold uppercase">
              <span className="bg-slate-100 px-3 py-1 rounded">Term: {settings?.current_term}</span>
              <span className="bg-slate-100 px-3 py-1 rounded">Session: {settings?.current_session}</span>
            </div>
          </div>

          {/* Info row */}
          <div className="grid grid-cols-3 gap-4 mb-6 bg-slate-50 p-4 border border-slate-200 rounded-xl text-xs font-bold uppercase text-slate-700">
            <div>
              <span className="text-slate-400">Class: </span>
              <span className="text-slate-900 font-black">
                {classes.find(c => c.id.toString() === filters.class_id)?.class_name || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Subject: </span>
              <span className="text-slate-900 font-black">
                {subjects.find(s => s.id.toString() === filters.subject_id)?.subject_name || "N/A"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-400">No. of Students: </span>
              <span className="text-slate-900 font-black">{filteredStudents.length}</span>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse border border-slate-300 text-xs text-slate-800">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-black uppercase">
                <th className="border border-slate-300 px-3 py-2">S/N</th>
                <th className="border border-slate-300 px-3 py-2">First Name</th>
                <th className="border border-slate-300 px-3 py-2">Surname</th>
                <th className="border border-slate-300 px-3 py-2">Middle Name</th>
                <th className="border border-slate-300 px-3 py-2 text-center">CA1</th>
                <th className="border border-slate-300 px-3 py-2 text-center">CA2</th>
                <th className="border border-slate-300 px-3 py-2 text-center">Exam</th>
                <th className="border border-slate-300 px-3 py-2 text-center">Total</th>
                <th className="border border-slate-300 px-3 py-2 text-center">Grade</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => {
                const ca1 = scores[student.id]?.ca1 || 0;
                const ca2 = scores[student.id]?.ca2 || 0;
                const exam = scores[student.id]?.exam || 0;
                const total = ca1 + ca2 + exam;
                
                // Calculate grade
                let grade = 'F';
                if (total >= 70) grade = 'A';
                else if (total >= 60) grade = 'B';
                else if (total >= 50) grade = 'C';
                else if (total >= 45) grade = 'D';
                else if (total >= 40) grade = 'E';

                return (
                  <tr key={student.id} className="border-b border-slate-200">
                    <td className="border border-slate-300 px-3 py-2 font-mono">{idx + 1}</td>
                    <td className="border border-slate-300 px-3 py-2 font-black uppercase">{student.first_name || ""}</td>
                    <td className="border border-slate-300 px-3 py-2 font-black uppercase">{student.last_name || ""}</td>
                    <td className="border border-slate-300 px-3 py-2 font-black uppercase">{student.middle_name || "—"}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-bold font-mono">{ca1}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-bold font-mono">{ca2}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-bold font-mono">{exam}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-black font-mono text-[#112255] bg-slate-50">{total}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-black text-rose-600 bg-slate-50">{grade}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Attestation / Sign-off */}
          <div className="mt-12 flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-500">
            <div className="text-center">
              <div className="w-36 border-b border-slate-400 mb-2"></div>
              <div>Subject Teacher Signature</div>
            </div>
            <div className="text-center">
              <div className="w-36 border-b border-slate-400 mb-2"></div>
              <div>Date Issued</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
