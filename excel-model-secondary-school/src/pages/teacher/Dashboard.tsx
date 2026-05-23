import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Users, BookOpen, School, TrendingUp, ClipboardList, Sparkles, Megaphone, Send, X, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import AIHomeworkHelper from '../../components/AIHomeworkHelper';
import { Toaster, toast } from 'sonner';
import { Announcement } from '../../types';

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    myClasses: 0,
    mySubjects: 0,
    totalStudents: 0,
  });
  const [classDetails, setClassDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [recentScores, setRecentScores] = useState<any[]>([]);
  
  // Announcements State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    target_class_id: 'all' as string
  });
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      if (!profile) return;

      try {
        // Group initial parallel fetches
        const [
          { data: directClasses },
          { data: pivotClasses },
          { data: studentClasses },
          { data: teacherSubjectsData }
        ] = await Promise.all([
          supabase.from('classes').select('id, class_name').eq('teacher_id', profile.id),
          supabase.from('teacher_classes').select('class_id, classes!class_id(id, class_name)').eq('teacher_id', profile.id),
          supabase.from('students').select('class_id, classes!class_id(id, class_name)').eq('teacher_id', profile.id),
          supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', profile.id)
        ]);

        const teacherSubjectIds = teacherSubjectsData?.map(ts => ts.subject_id) || [];
        
        // Secondary fetches based on first results
        const [subjectClassesData, teacherSubjectsStats, allSubjectsRes, announcementsRes] = await Promise.all([
          teacherSubjectIds.length > 0 ? 
            supabase.from('class_subjects').select('class_id, classes!class_id(id, class_name)').in('subject_id', teacherSubjectIds) : 
            Promise.resolve({ data: [] }),
          supabase.from('teacher_subjects').select('*, subjects(id, subject_name)').eq('teacher_id', profile.id),
          supabase.from('subjects').select('*').order('subject_name'),
          supabase.from('announcements')
            .select('*')
            .or(`target_role.eq.all,target_role.eq.teacher,sender_id.eq.${profile.id}`)
            .order('created_at', { ascending: false })
            .limit(5)
        ]);

        const subjectClasses = subjectClassesData.data?.map((cs: any) => cs.classes).filter(Boolean) || [];

        const directData = directClasses || [];
        const pivotData = pivotClasses?.map(p => p.classes).filter(Boolean) as any[] || [];
        const studentClassData = studentClasses?.map(s => s.classes).filter(Boolean) as any[] || [];
        
        // Combine and unique by ID
        const allClassData = Array.from(
          new Map([...directData, ...pivotData, ...studentClassData, ...subjectClasses].map(c => [c.id, c])).values()
        );
        const classIds = allClassData.map(c => c.id);

        // Third level parallel fetches
        if (classIds.length > 0) {
          const [scoresRes, classSubjectsRes, classStudentsRes, directStudentsRes] = await Promise.all([
            supabase.from('results').select('*, students(first_name, last_name), subjects(subject_name)').in('class_id', classIds).order('created_at', { ascending: false }).limit(5),
            supabase.from('class_subjects').select('*, subjects(id, subject_name)').in('class_id', classIds),
            supabase.from('students').select('*').in('class_id', classIds).order('last_name'),
            supabase.from('students').select('*').eq('teacher_id', profile.id)
          ]);

          setRecentScores(scoresRes.data || []);
          const classSubjectsData = classSubjectsRes.data || [];
          const classStudents = classStudentsRes.data || [];
          const directStudentsData = directStudentsRes.data || [];
          const allSubjectNames = allSubjectsRes.data?.map(s => s.subject_name) || [];

          // Combine and unique by ID
          const allStudents = Array.from(
            new Map([...classStudents, ...directStudentsData].map(s => [s.id, s])).values()
          );

          // Build class details
          const details = allClassData.map(cls => {
            const studentsInThisClass = allStudents.filter(s => s.class_id === cls.id);
            const isClassTeacher = directData.some(d => d.id === cls.id);
            
            let subjectsInThisClass: string[] = [];
            const teacherAssignedSubjects = (teacherSubjectsStats.data || []).map(ts => {
              const sub = Array.isArray(ts.subjects) ? ts.subjects[0] : ts.subjects;
              return sub?.subject_name;
            }).filter(Boolean) || [];

            if (isClassTeacher) {
              subjectsInThisClass = classSubjectsData
                .filter(cs => cs.class_id === cls.id)
                .map(cs => {
                  const sub = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
                  return sub?.subject_name;
                })
                .filter(Boolean) || [];
              
              if (subjectsInThisClass.length === 0 && teacherAssignedSubjects.length > 0) {
                subjectsInThisClass = teacherAssignedSubjects;
              }
            } else {
              subjectsInThisClass = classSubjectsData
                .filter(cs => cs.class_id === cls.id && teacherSubjectIds.includes(cs.subject_id))
                .map(cs => {
                  const sub = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
                  return sub?.subject_name;
                })
                .filter(Boolean) || [];
              
              if (subjectsInThisClass.length === 0) {
                if (teacherAssignedSubjects.length > 0) {
                  subjectsInThisClass = teacherAssignedSubjects;
                } else {
                  subjectsInThisClass = classSubjectsData
                    .filter(cs => cs.class_id === cls.id)
                    .map(cs => {
                      const sub = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
                      return sub?.subject_name;
                    })
                    .filter(Boolean) || [];
                }
              }
            }

            if (subjectsInThisClass.length === 0) {
              subjectsInThisClass = allSubjectNames;
            }

            return {
              ...cls,
              students: studentsInThisClass,
              subjects: subjectsInThisClass,
              isClassTeacher
            };
          });

          // Calculate total unique subjects
          const allUniqueSubjects = new Set<string>();
          details.forEach(d => {
            d.subjects.forEach((s: string) => allUniqueSubjects.add(s));
          });

          setClassDetails(details);
          setStats({
            myClasses: classIds.length,
            mySubjects: allUniqueSubjects.size,
            totalStudents: allStudents.length,
          });
        }

        setAnnouncements(announcementsRes.data || []);

      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [profile]);

  async function postAnnouncement() {
    if (!newAnnouncement.title || !newAnnouncement.content) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsPosting(true);
    try {
      const { error } = await supabase
        .from('announcements')
        .insert({
          title: newAnnouncement.title,
          content: newAnnouncement.content,
          target_role: 'student',
          target_class_id: newAnnouncement.target_class_id === 'all' ? null : Number(newAnnouncement.target_class_id),
          sender_id: profile?.id
        });

      if (error) throw error;

      toast.success('Announcement posted to students');
      setNewAnnouncement({ title: '', content: '', target_class_id: 'all' });
      setIsAnnouncementModalOpen(false);
      
      // Refresh
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .or(`target_role.eq.all,target_role.eq.teacher,sender_id.eq.${profile?.id}`)
        .order('created_at', { ascending: false })
        .limit(5);
      setAnnouncements(data || []);
    } catch (error: any) {
      toast.error('Error: ' + error.message);
    } finally {
      setIsPosting(false);
    }
  }

  const cards = [
    { label: 'My Classes', value: stats.myClasses, icon: School, color: 'bg-emerald-500' },
    { label: 'My Subjects', value: stats.mySubjects, icon: BookOpen, color: 'bg-orange-500' },
    { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'bg-blue-500' },
  ];

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="h-8 bg-slate-200 rounded w-1/4"></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>)}
    </div>
  </div>;

  return (
    <div className="space-y-8">
      <Toaster position="top-right" />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome, {profile?.name}</h1>
          <p className="text-slate-500 mt-1">Manage your classes, subjects, and student scores.</p>
        </div>
        <button
          onClick={() => setIsAnnouncementModalOpen(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-slate-200"
        >
          <Megaphone className="w-4 h-4" />
          Notify Students
        </button>
      </header>

      {/* Announcements Feed */}
      {announcements.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest px-2">
            <Megaphone className="w-3 h-3" /> Recent Announcements
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scroll-hide">
            {announcements.map((ann) => (
              <motion.div 
                key={ann.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-shrink-0 w-[400px] bg-slate-900 text-white p-6 rounded-[2rem] border border-white/10 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Megaphone className="w-20 h-20 -rotate-12" />
                </div>
                <h3 className="font-black text-lg mb-2 line-clamp-1">{ann.title}</h3>
                <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed mb-4">
                  {ann.content}
                </p>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                    {new Date(ann.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] font-black text-slate-500 uppercase">
                    Target: {ann.target_role === 'student' ? 'Students' : ann.target_role === 'teacher' ? 'Staff' : 'Everyone'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
          >
            <div className={`${card.color} p-4 rounded-xl text-white shadow-lg`}>
              <card.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Quick Actions</h2>
          <TrendingUp className="w-5 h-5 text-slate-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button 
            onClick={() => navigate('/teacher/scores')}
            className="p-6 bg-slate-50 hover:bg-slate-100 rounded-2xl text-left transition-all border border-slate-200 group"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <ClipboardList className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-900 text-lg">Enter Scores</p>
            <p className="text-sm text-slate-500 mt-1">Record CA and Exam marks for your students.</p>
          </button>
          <button 
            onClick={() => navigate('/teacher/students')}
            className="p-6 bg-slate-50 hover:bg-slate-100 rounded-2xl text-left transition-all border border-slate-200 group"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Users className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-900 text-lg">My Students</p>
            <p className="text-sm text-slate-500 mt-1">View list of students in your assigned classes.</p>
          </button>
          <button 
            onClick={() => navigate('/teacher/results')}
            className="p-6 bg-slate-50 hover:bg-slate-100 rounded-2xl text-left transition-all border border-slate-200 group"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <TrendingUp className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-900 text-lg">View Results</p>
            <p className="text-sm text-slate-500 mt-1">Check performance reports for your subjects.</p>
          </button>
        </div>
      </div>

      {recentScores.length > 0 && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Recent Scores Entered</h2>
            <Sparkles className="w-5 h-5 text-blue-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-4">Student</th>
                  <th className="pb-4">Subject</th>
                  <th className="pb-4 text-center">CA1</th>
                  <th className="pb-4 text-center">CA2</th>
                  <th className="pb-4 text-center">Exam</th>
                  <th className="pb-4 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentScores.map((score) => (
                  <tr key={score.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4">
                      <p className="font-bold text-slate-700">
                        {score.students?.first_name} {score.students?.last_name}
                      </p>
                    </td>
                    <td className="py-4 text-slate-600">{score.subjects?.subject_name}</td>
                    <td className="py-4 text-center font-medium text-slate-600">{score.ca1_score}</td>
                    <td className="py-4 text-center font-medium text-slate-600">{score.ca2_score}</td>
                    <td className="py-4 text-center font-medium text-slate-600">{score.exam_score}</td>
                    <td className="py-4 text-center">
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
                        {score.ca1_score + score.ca2_score + score.exam_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        <AIHomeworkHelper />
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">My Classes Overview</h2>
          <div className="px-4 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-bold border border-blue-100">
            {classDetails.length} Assigned Classes
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {classDetails.map((cls, idx) => (
            <motion.div
              key={cls.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col"
            >
              <div className="p-6 bg-slate-900 text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                      <School className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{cls.class_name}</h3>
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                        {cls.isClassTeacher ? 'Class Teacher' : 'Subject Teacher'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-blue-400">{cls.students.length}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Students</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {cls.subjects.length > 0 ? (
                    cls.subjects.map((sub: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-wide border border-white/10">
                        {sub}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 italic">No subjects assigned to you for this class</span>
                  )}
                </div>
              </div>

              <div className="p-6 flex-1 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-4 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                  <Users className="w-3 h-3" /> Enrolled Students
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {cls.students.length > 0 ? (
                    cls.students.map((student: any) => (
                      <div 
                        key={student.id}
                        className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3 group hover:border-blue-200 transition-colors"
                      >
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{student.first_name} {student.last_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{student.admission_number}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-8 text-center text-slate-400 italic text-sm">
                      No students enrolled in this class yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-white border-t border-slate-100 flex justify-between items-center">
                <button 
                  onClick={() => navigate('/teacher/scores', { state: { classId: cls.id } })}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <ClipboardList className="w-4 h-4" />
                  Manage Scores
                </button>
                <button 
                  onClick={() => navigate('/teacher/results', { state: { classId: cls.id } })}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1"
                >
                  <TrendingUp className="w-4 h-4" />
                  View Reports
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Announcement Modal */}
      <AnimatePresence>
        {isAnnouncementModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAnnouncementModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 rounded-xl text-white">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase italic text-center">Post to Students</h2>
                </div>
                <button onClick={() => setIsAnnouncementModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Target Class</label>
                  <select
                    value={newAnnouncement.target_class_id}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, target_class_id: e.target.value })}
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  >
                    <option value="all">All My Students</option>
                    {classDetails.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.class_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Heading</label>
                  <input
                    type="text"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                    placeholder="e.g., Homework Reminder"
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Message</label>
                  <textarea
                    rows={4}
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                    placeholder="Describe the announcement..."
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 resize-none"
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                <button
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="flex-1 py-4 bg-white text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={postAnnouncement}
                  disabled={isPosting}
                  className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-slate-200 disabled:opacity-70"
                >
                  {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send to Students
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
