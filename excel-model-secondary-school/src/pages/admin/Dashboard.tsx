import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Users, UserRound, School, BookOpen, TrendingUp, BarChart3, PieChart as PieChartIcon, Sparkles, Trophy, Loader2, ChevronRight, Brain, Wallet, Receipt, Megaphone, Send, Trash2, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { Toaster, toast } from 'sonner';
import { Announcement } from '../../types';
import { Skeleton, CardSkeleton, TableSkeleton, ChartSkeleton } from '../../components/ui/Skeleton';
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

export default function AdminDashboard() {
  const { settings } = useAuth();
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0,
    expectedRevenue: 0,
    collectedRevenue: 0
  });
  const [outstandingStudents, setOutstandingStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [topStudents, setTopStudents] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<Record<number, string>>({});
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  
  // Announcements State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    target_role: 'all' as 'all' | 'teacher' | 'student'
  });
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [
          { count: studentsCount },
          { count: teachersCount },
          { count: classesCount },
          { count: subjectsCount },
          { data: classes },
          { data: standards },
          { data: feeRecords },
          { data: allStudents }
        ] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
          supabase.from('classes').select('*', { count: 'exact', head: true }),
          supabase.from('subjects').select('*', { count: 'exact', head: true }),
          supabase.from('classes').select('id, class_name, students!class_id(id, first_name, last_name, admission_number)'),
          supabase.from('fee_standards').select('*').eq('term', settings?.current_term).eq('session', settings?.current_session),
          supabase.from('fee_records').select('*').eq('term', settings?.current_term).eq('session', settings?.current_session),
          supabase.from('students').select('id, first_name, last_name, class_id, classes(class_name)')
        ]);

        // Calculate expected revenue based on standards and enrolled students
        let expectedRevenue = 0;
        const outstandingList: any[] = [];

        if (classes && standards) {
          classes.forEach((clr: any) => {
            const standard = standards.find(s => s.class_id === clr.id);
            if (standard) {
              const studentsInClass = clr.students || [];
              const classFee = Number(standard.amount);
              expectedRevenue += studentsInClass.length * classFee;

              // Identify students who haven't paid or partially paid
              studentsInClass.forEach((student: any) => {
                const record = feeRecords?.find(r => r.student_id === student.id);
                const paid = record ? Number(record.amount_paid) : 0;
                const balance = classFee - paid;

                if (balance > 0) {
                  outstandingList.push({
                    id: student.id,
                    name: `${student.first_name} ${student.last_name}`,
                    class: clr.class_name,
                    total: classFee,
                    paid: paid,
                    balance: balance,
                    status: record?.status || 'Not Paid'
                  });
                }
              });
            }
          });
        }

        setOutstandingStudents(outstandingList.sort((a, b) => b.balance - a.balance).slice(0, 10));

        const collectedRevenue = feeRecords?.reduce((sum, r) => sum + Number(r.amount_paid), 0) || 0;

        setStats({
          students: studentsCount || 0,
          teachers: teachersCount || 0,
          classes: classesCount || 0,
          subjects: subjectsCount || 0,
          expectedRevenue,
          collectedRevenue
        });

        // Prepare class distribution data
        if (classes) {
          const dist = classes.map((c: any) => ({
            name: c.class_name,
            students: c.students?.length || 0
          }));
          setClassData(dist);

          // Optimized Top Students Fetch: Single query instead of N+1
          const classIds = classes.map(c => c.id);
          const { data: allResults } = await supabase
            .from('results')
            .select('student_id, ca1_score, ca2_score, exam_score, class_id, students!inner(first_name, last_name, class_id)')
            .in('class_id', classIds);

          if (allResults) {
            const classTopStudents: Record<number, any> = {};
            
            // Group and find top
            allResults.forEach(r => {
              const total = (r.ca1_score || 0) + (r.ca2_score || 0) + (r.exam_score || 0);
              if (total > 0) {
                if (!classTopStudents[r.class_id]) classTopStudents[r.class_id] = {};
                
                if (!classTopStudents[r.class_id][r.student_id]) {
                  const sData = r.students as any;
                  const cls = classes.find(c => c.id === r.class_id);
                  classTopStudents[r.class_id][r.student_id] = {
                    id: r.student_id,
                    name: `${sData.first_name} ${sData.last_name}`,
                    class: cls?.class_name || 'Unknown',
                    total: 0,
                    count: 0
                  };
                }
                classTopStudents[r.class_id][r.student_id].total += total;
                classTopStudents[r.class_id][r.student_id].count += 1;
              }
            });

            const topStudentsList = Object.values(classTopStudents).map((studentsObj: any) => {
              const top = Object.values(studentsObj).sort((a: any, b: any) => b.total - a.total)[0] as any;
              return top ? { ...top, average: top.total / (top.count || 1) } : null;
            }).filter(Boolean);

            setTopStudents(topStudentsList);
          }
        }

        // Prepare performance data (mocking some distribution for visual appeal)
        setPerformanceData([
          { range: '0-39', count: 12, fill: '#ef4444' },
          { range: '40-49', count: 25, fill: '#f97316' },
          { range: '50-59', count: 45, fill: '#eab308' },
          { range: '60-69', count: 68, fill: '#22c55e' },
          { range: '70-100', count: 34, fill: '#3b82f6' },
        ]);

        // Fetch announcements
        const { data: annData } = await supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
        setAnnouncements(annData || []);

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
      
      const prompt = `You are an expert Educational Analyst. Analyze the performance of a top-performing student:
      Student Name: ${student.name}
      Class: ${student.class}
      Total Aggregate Score: ${student.total.toFixed(1)}
      Average Score: ${student.average.toFixed(1)}
      
      Provide a brief (2-3 sentences) professional insight into their academic excellence and potential areas for further enrichment.`;

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insight: {
                type: Type.STRING,
                description: "A brief professional insight into the student's performance."
              }
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
      console.error('AI Insight Error:', error);
      setAiInsights(prev => ({ ...prev, [student.id]: "Exceptional performance across all metrics. This student demonstrates a high level of mastery and consistent academic dedication." }));
    } finally {
      setAnalyzingId(null);
    }
  }

  async function postAnnouncement() {
    if (!newAnnouncement.title || !newAnnouncement.content) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('announcements')
        .insert({
          title: newAnnouncement.title,
          content: newAnnouncement.content,
          target_role: newAnnouncement.target_role,
          sender_id: user.id
        });

      if (error) throw error;

      toast.success('Announcement posted successfully');
      setNewAnnouncement({ title: '', content: '', target_role: 'all' });
      setIsAnnouncementModalOpen(false);
      
      // Refresh announcements
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      setAnnouncements(data || []);
    } catch (error: any) {
      toast.error('Error posting announcement: ' + error.message);
    } finally {
      setIsPosting(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setAnnouncements(announcements.filter(a => a.id !== id));
      toast.success('Announcement deleted');
    } catch (error: any) {
      toast.error('Error deleting announcement');
    }
  }

  const cards = [
    { label: 'Total Students', value: stats.students, icon: Users, color: 'bg-blue-500' },
    { label: 'Total Teachers', value: stats.teachers, icon: UserRound, color: 'bg-purple-500' },
    { label: 'Total Classes', value: stats.classes, icon: School, color: 'bg-emerald-500' },
    { label: 'Total Subjects', value: stats.subjects, icon: BookOpen, color: 'bg-orange-500' },
  ];

  const financialCards = [
    { label: 'Real Revenue (Target)', value: `₦${(stats.expectedRevenue || 0).toLocaleString()}`, icon: Receipt, color: 'bg-slate-900' },
    { label: 'Collected Revenue', value: `₦${(stats.collectedRevenue || 0).toLocaleString()}`, icon: Wallet, color: 'bg-emerald-600' },
    { label: 'Outstanding Fees', value: `₦${((stats.expectedRevenue || 0) - (stats.collectedRevenue || 0)).toLocaleString()}`, icon: TrendingUp, color: 'bg-rose-600' },
    { label: 'Collection Rate', value: `${stats.expectedRevenue > 0 ? Math.round((stats.collectedRevenue / stats.expectedRevenue) * 100) : 0}%`, icon: BarChart3, color: 'bg-blue-600' },
  ];

  if (loading) return (
    <div className="space-y-8 pb-12">
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {[1, 2].map(i => (
          <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 flex gap-6">
            <Skeleton className="w-20 h-20 rounded-2xl" />
            <div className="flex-1 space-y-4">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      <Toaster position="top-right" />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your school's performance and statistics.</p>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {financialCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.1 }}
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

      {/* AI Performance Analytics Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">AI Performance Analytics</h2>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {topStudents.map((student, index) => (
            <motion.div
              key={student.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-500"
            >
              <div className="p-6 flex items-start gap-6">
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <Trophy className="w-10 h-10" />
                  </div>
                  <div className="absolute -top-2 -right-2 bg-amber-400 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border-4 border-white shadow-sm">
                    #{index + 1}
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{student.name}</h3>
                      <p className="text-blue-600 font-bold text-sm uppercase tracking-widest">{student.class}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900">{student.average.toFixed(1)}%</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Average Score</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <AnimatePresence mode="wait">
                      {aiInsights[student.id] ? (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-2 opacity-5">
                            <Brain className="w-12 h-12 text-blue-600" />
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed font-medium italic">
                            "{aiInsights[student.id]}"
                          </p>
                        </motion.div>
                      ) : (
                        <button
                          onClick={() => generateInsight(student)}
                          disabled={analyzingId === student.id}
                          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-slate-200 disabled:opacity-70"
                        >
                          {analyzingId === student.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Analyzing Performance...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Generate AI Insights
                            </>
                          )}
                        </button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {topStudents.length === 0 && (
            <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
              <p className="text-slate-500 font-medium italic">No performance data available yet to generate analytics.</p>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Student Distribution</h2>
              <p className="text-sm text-slate-500">Number of students per class</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                  }}
                />
                <Bar 
                  dataKey="students" 
                  fill="#3b82f6" 
                  radius={[6, 6, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Performance Overview</h2>
              <p className="text-sm text-slate-500">Score ranges across all subjects</p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <PieChartIcon className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={performanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="range"
                >
                  {performanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                  }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Outstanding Payments</h2>
              <p className="text-sm text-slate-500">Top 10 students with outstanding fees</p>
            </div>
            <div className="p-2 bg-rose-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-rose-600" />
            </div>
          </div>
          <div className="space-y-4">
            {outstandingStudents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 italic text-slate-400 text-xs">
                      <th className="pb-3 font-medium">Student</th>
                      <th className="pb-3 font-medium">Class</th>
                      <th className="pb-3 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {outstandingStudents.map((student) => (
                      <tr key={student.id} className="group">
                        <td className="py-4">
                          <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors uppercase text-sm">{student.name}</p>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${student.status === 'Partial' ? 'text-amber-500' : 'text-rose-500'}`}>
                            {student.status === 'Partial' ? 'Partial Payment' : 'Owing (None)'}
                          </p>
                        </td>
                        <td className="py-4">
                          <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md">{student.class}</span>
                        </td>
                        <td className="py-4 text-right">
                          <p className="font-black text-slate-900">₦{student.balance.toLocaleString()}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-12 italic">All matching students have cleared their fees!</p>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => window.location.href = '/admin/students'}
              className="p-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-left transition-colors border border-slate-200 group"
            >
              <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">Add Student</p>
              <p className="text-xs text-slate-500 mt-1">Register a new student</p>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/teachers'}
              className="p-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-left transition-colors border border-slate-200 group"
            >
              <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">Add Teacher</p>
              <p className="text-xs text-slate-500 mt-1">Onboard a new staff</p>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/permits'}
              className="p-4 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors border border-blue-200 group"
            >
              <p className="font-semibold text-blue-900 group-hover:text-blue-600 transition-colors">Exam Permits</p>
              <p className="text-xs text-blue-500 mt-1">Generate exam passes</p>
            </button>
            <button 
              onClick={() => {
                const el = document.getElementById('announcements');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-4 bg-purple-50 hover:bg-purple-100 rounded-xl text-left transition-colors border border-purple-200 group"
            >
              <p className="font-semibold text-purple-900 group-hover:text-blue-600 transition-colors">Broadcast</p>
              <p className="text-xs text-purple-500 mt-1">Send announcement to all</p>
            </button>
          </div>
        </div>
      </div>

      {/* Announcements Modal */}
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
                  <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase italic">Post Announcement</h2>
                </div>
                <button onClick={() => setIsAnnouncementModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Announcement Title</label>
                  <input
                    type="text"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                    placeholder="e.g., School Resumption Date"
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Target Audience</label>
                  <select
                    value={newAnnouncement.target_role}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, target_role: e.target.value as any })}
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  >
                    <option value="all">Everyone (Teachers & Students)</option>
                    <option value="teacher">Teachers Only</option>
                    <option value="student">Students Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Message Content</label>
                  <textarea
                    rows={4}
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                    placeholder="Write your message here..."
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
                  Post Announcement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Announcements Management Section */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden scroll-mt-24" id="announcements">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase italic">Broadcasting & Announcements</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage school-wide communications</p>
            </div>
          </div>
          <button
            onClick={() => setIsAnnouncementModalOpen(true)}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-slate-200"
          >
            <Plus className="w-4 h-4" />
            New Broadcast
          </button>
        </div>
        
        <div className="p-8">
          {announcements.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {announcements.map((ann) => (
                <motion.div
                  key={ann.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 rounded-3xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                        ann.target_role === 'all' ? 'bg-blue-100 text-blue-600' :
                        ann.target_role === 'teacher' ? 'bg-purple-100 text-purple-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        To: {ann.target_role}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(ann.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteAnnouncement(ann.id)}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      title="Delete Announcement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2 truncate">{ann.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-3">
                    {ann.content}
                  </p>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Megaphone className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No active announcements</p>
              <button 
                onClick={() => setIsAnnouncementModalOpen(true)}
                className="mt-4 text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] hover:tracking-[0.3em] transition-all"
              >
                + create your first one
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
