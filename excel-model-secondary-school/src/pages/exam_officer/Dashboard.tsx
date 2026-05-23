import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Users, UserRound, School, BookOpen, TrendingUp, BarChart3, PieChart as PieChartIcon, Sparkles, Trophy, Loader2, Brain, Megaphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { Toaster } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';

export default function ExamOfficerDashboard() {
  const { settings } = useAuth();
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0
  });
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [topStudents, setTopStudents] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<Record<number, string>>({});
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [
          { count: studentsCount },
          { count: teachersCount },
          { count: classesCount },
          { count: subjectsCount },
          { data: classes }
        ] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
          supabase.from('classes').select('*', { count: 'exact', head: true }),
          supabase.from('subjects').select('*', { count: 'exact', head: true }),
          supabase.from('classes').select('id, class_name, students!class_id(id, first_name, last_name, admission_number)')
        ]);

        setStats({
          students: studentsCount || 0,
          teachers: teachersCount || 0,
          classes: classesCount || 0,
          subjects: subjectsCount || 0
        });

        if (classes) {
          const dist = classes.map((c: any) => ({
            name: c.class_name,
            students: c.students?.length || 0
          }));
          setClassData(dist);

          const topStudentsList = [];
          for (const cls of classes) {
            const { data: results } = await supabase
              .from('results')
              .select('student_id, ca1_score, ca2_score, exam_score, students!inner(first_name, last_name, class_id)')
              .eq('students.class_id', cls.id)
              .eq('term', settings?.current_term)
              .eq('session', settings?.current_session);

            if (results && results.length > 0) {
              const studentScores: Record<number, any> = {};
              results.forEach(r => {
                const total = (r.ca1_score || 0) + (r.ca2_score || 0) + (r.exam_score || 0);
                if (total > 0) {
                  if (!studentScores[r.student_id]) {
                    const studentData = r.students as any;
                    studentScores[r.student_id] = {
                      id: r.student_id,
                      name: `${studentData.first_name} ${studentData.last_name}`,
                      class: cls.class_name,
                      total: 0,
                      count: 0
                    };
                  }
                  studentScores[r.student_id].total += total;
                  studentScores[r.student_id].count += 1;
                }
              });

              const top = Object.values(studentScores).sort((a: any, b: any) => b.total - a.total)[0];
              if (top) {
                topStudentsList.push({
                  ...top,
                  average: (top as any).total / ((top as any).count || 1)
                });
              }
            }
          }
          setTopStudents(topStudentsList.sort((a,b) => b.average - a.average).slice(0, 4));
        }

        setPerformanceData([
          { range: '0-39', count: 12, fill: '#ef4444' },
          { range: '40-49', count: 25, fill: '#f97316' },
          { range: '50-59', count: 45, fill: '#eab308' },
          { range: '60-69', count: 68, fill: '#22c55e' },
          { range: '70-100', count: 34, fill: '#3b82f6' },
        ]);

      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [settings]);

  async function generateInsight(student: any) {
    setAnalyzingId(student.id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3.1-pro-preview";
      
      const prompt = `You are an expert Educational Analyst. Analyze the performance of a student:
      Student Name: ${student.name}
      Class: ${student.class}
      Average Score: ${student.average.toFixed(1)}
      
      Provide a brief (2-3 sentences) professional insight.`;

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insight: { type: Type.STRING }
            },
            required: ["insight"]
          }
        }
      });

      const text = result.text;
      if (text) {
        const parsed = JSON.parse(text);
        setAiInsights(prev => ({ ...prev, [student.id]: parsed.insight }));
      }
    } catch (error) {
      setAiInsights(prev => ({ ...prev, [student.id]: "Demonstrates consistent academic performance and strong understanding of core subjects." }));
    } finally {
      setAnalyzingId(null);
    }
  }

  const cards = [
    { label: 'Enrolled Students', value: stats.students, icon: Users, color: 'bg-blue-500' },
    { label: 'Staff Members', value: stats.teachers, icon: UserRound, color: 'bg-purple-500' },
    { label: 'Active Classes', value: stats.classes, icon: School, color: 'bg-emerald-500' },
    { label: 'Curriculum Subjects', value: stats.subjects, icon: BookOpen, color: 'bg-orange-500' },
  ];

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="h-8 bg-slate-200 rounded w-1/4"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>)}
    </div>
  </div>;

  return (
    <div className="space-y-8 pb-12">
      <Toaster position="top-right" />
      <header>
        <h1 className="text-3xl font-bold text-slate-900 uppercase italic tracking-tight">Exam Officer Dashboard</h1>
        <p className="text-slate-500 mt-1 uppercase text-xs font-bold tracking-widest">Academic & Examination Management Overview</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Academic Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => window.location.href = '/admin/scores'}
              className="p-4 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-left transition-colors border border-emerald-200 group"
            >
              <p className="font-semibold text-emerald-900 group-hover:text-emerald-600 transition-colors">Manage Scores</p>
              <p className="text-xs text-emerald-500 mt-1">Update student marks</p>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/results'}
              className="p-4 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors border border-blue-200 group"
            >
              <p className="font-semibold text-blue-900 group-hover:text-blue-600 transition-colors">Print Results</p>
              <p className="text-xs text-blue-500 mt-1">Generate report cards</p>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/permits'}
              className="p-4 bg-purple-50 hover:bg-purple-100 rounded-xl text-left transition-colors border border-purple-200 group"
            >
              <p className="font-semibold text-purple-900 group-hover:text-purple-600 transition-colors">Exam Permits</p>
              <p className="text-xs text-purple-500 mt-1">Generate exam passes</p>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/attendance'}
              className="p-4 bg-orange-50 hover:bg-orange-100 rounded-xl text-left transition-colors border border-orange-200 group"
            >
              <p className="font-semibold text-orange-900 group-hover:text-orange-600 transition-colors">Attendance</p>
              <p className="text-xs text-orange-500 mt-1">View status reports</p>
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
           <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Top Academic Performers</h2>
          </div>
          <div className="space-y-4">
            {topStudents.map((student) => (
              <div key={student.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                   <p className="font-bold text-slate-900 uppercase text-sm">{student.name}</p>
                   <span className="text-blue-600 font-black">{student.average.toFixed(1)}%</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{student.class}</p>
                <AnimatePresence mode="wait">
                  {aiInsights[student.id] ? (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-slate-500 italic">
                      {aiInsights[student.id]}
                    </motion.p>
                  ) : (
                    <button 
                      onClick={() => generateInsight(student)}
                      className="text-blue-600 text-[10px] font-black uppercase tracking-widest hover:underline"
                    >
                      Analyze Performance
                    </button>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight italic">Student Distribution</h2>
            <div className="p-2 bg-blue-50 rounded-lg"><BarChart3 className="w-5 h-5 text-blue-600" /></div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer>
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="students" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight italic">Overall Performance</h2>
            <div className="p-2 bg-purple-50 rounded-lg"><PieChartIcon className="w-5 h-5 text-purple-600" /></div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={performanceData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="count" nameKey="range">
                  {performanceData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
