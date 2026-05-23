import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Wallet, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  Search,
  Filter,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Skeleton, CardSkeleton } from '../../components/ui/Skeleton';

export default function CashierDashboard() {
  const { profile, settings } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    paidStudents: 0,
    partialStudents: 0,
    notPaidStudents: 0,
    totalExpected: 0,
    totalCollected: 0,
    outstandingDebt: 0
  });
  const [outstandingStudents, setOutstandingStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [settings]);

  async function fetchStats() {
    try {
      const [
        { data: students },
        { data: fees },
        { data: classes },
        { data: standards }
      ] = await Promise.all([
        supabase.from('students').select('id, first_name, last_name, class_id'),
        supabase.from('fee_records').select('*').eq('term', settings?.current_term).eq('session', settings?.current_session),
        supabase.from('classes').select('id, class_name, students!class_id(count)'),
        supabase.from('fee_standards').select('*').eq('term', settings?.current_term).eq('session', settings?.current_session)
      ]);

      const totalStudentsCount = students?.length || 0;
      
      let paidCount = 0;
      let partialCount = 0;
      let expected = 0;
      let collected = fees?.reduce((sum, f) => sum + Number(f.amount_paid), 0) || 0;
      const outstandingList: any[] = [];

      if (classes && standards && students) {
        students.forEach(s => {
          const cls = classes.find(c => c.id === s.class_id);
          const standard = standards.find(st => st.class_id === s.class_id);
          const record = fees?.find(f => f.student_id === s.id);
          const paidAmount = record ? Number(record.amount_paid) : 0;
          
          if (standard) {
            const requiredAmount = Number(standard.amount);
            const isFullyPaid = paidAmount >= requiredAmount && requiredAmount > 0;
            
            if (isFullyPaid) {
              paidCount++;
            } else if (paidAmount > 0) {
              partialCount++;
            }

            const balance = Math.max(0, requiredAmount - paidAmount);
            if (balance > 0) {
              outstandingList.push({
                id: s.id,
                name: `${s.first_name} ${s.last_name}`,
                class: cls?.class_name || 'Unknown',
                balance: balance,
                status: paidAmount > 0 ? 'Partial' : 'Not Paid'
              });
            }
          }
        });

        // Calculate total expected
        classes.forEach((clr: any) => {
          const standard = standards.find(s => s.class_id === clr.id);
          if (standard) {
            const classCount = clr.students?.[0]?.count || 0;
            expected += classCount * Number(standard.amount);
          }
        });
      }
      
      const notPaidCount = totalStudentsCount - paidCount - partialCount;
      setOutstandingStudents(outstandingList.sort((a, b) => b.balance - a.balance).slice(0, 5));
      const debt = Math.max(0, expected - collected);

      setStats({
        totalStudents: totalStudentsCount,
        paidStudents: paidCount,
        partialStudents: partialCount,
        notPaidStudents: notPaidCount,
        totalExpected: expected,
        totalCollected: collected,
        outstandingDebt: debt
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cashier Dashboard</h1>
          <p className="text-slate-500 font-medium tracking-tight">Welcome back, {profile?.name}. Financial oversight for {settings?.current_term} Term.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-black uppercase tracking-widest">System Online</span>
          </div>
        </div>
      </header>

      {/* Payment Summary Section */}
      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Payment Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            icon={Wallet} 
            label="Total Collected" 
            value={`₦${stats.totalCollected.toLocaleString()}`} 
            color="emerald" 
            loading={loading}
          />
          <StatCard 
            icon={TrendingUp} 
            label="Outstanding Debt" 
            value={`₦${stats.outstandingDebt.toLocaleString()}`} 
            color="rose" 
            loading={loading}
          />
          <StatCard 
            icon={CheckCircle} 
            label="Fully Paid" 
            value={`${stats.paidStudents} Students`} 
            color="blue" 
            loading={loading}
          />
          <StatCard 
            icon={AlertCircle} 
            label="Partially Paid" 
            value={`${stats.partialStudents} Students`} 
            color="amber" 
            loading={loading}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 transition-transform group-hover:scale-110">
                <Search className="w-32 h-32 text-slate-900" />
              </div>
              <div className="relative">
                <h3 className="text-2xl font-black text-slate-900 mb-2">Quick Payment</h3>
                <p className="text-slate-500 mb-8 font-medium leading-relaxed">Process fees, issue receipts, and manage student portal access.</p>
                <Link 
                  to="/cashier/fees"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  Process Fees
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 transition-transform group-hover:scale-110">
                <TrendingUp className="w-32 h-32 text-slate-900" />
              </div>
              <div className="relative">
                <h3 className="text-2xl font-black text-slate-900 mb-2">Debt Recovery</h3>
                <p className="text-slate-500 mb-8 font-medium leading-relaxed">Track debtors, monitor carried-over balances and generate reports.</p>
                <Link 
                  to="/cashier/debt"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-100"
                >
                  Manage Debts
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
              <h4 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Compliance Rate
              </h4>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-3xl font-black text-slate-900">
                  {stats.totalStudents ? Math.round((stats.paidStudents / stats.totalStudents) * 100) : 0}%
                </span>
                <span className="text-sm text-slate-500 font-bold mb-1 tracking-tight">Full Compliance</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-1000" 
                  style={{ width: `${stats.totalStudents ? (stats.paidStudents / stats.totalStudents) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
              <h4 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                <Filter className="w-4 h-4 text-amber-600" />
                Enrollment Overview
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                  <span className="text-slate-500">Total Students</span>
                  <span className="text-slate-900">{stats.totalStudents}</span>
                </div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                  <span className="text-slate-500">Still Owing</span>
                  <span className="text-rose-600">{stats.notPaidStudents + stats.partialStudents}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-slate-200 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-400" />
            </div>
            <h3 className="text-xl font-black italic uppercase tracking-tight">Priority Debtors</h3>
          </div>
          
          <div className="flex-1 space-y-4">
            {outstandingStudents.length > 0 ? (
              outstandingStudents.map((student) => (
                <div key={student.id} className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-sm tracking-tight">{student.name}</p>
                      <p className="text-[10px] font-black text-slate-500 uppercase">{student.class}</p>
                    </div>
                    <p className="font-black text-rose-400 text-sm">₦{student.balance.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${student.status === 'Partial' ? 'bg-amber-400' : 'bg-rose-500'}`}></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {student.status === 'Partial' ? 'Partial Payment' : 'Owing (None)'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 opacity-50 italic">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-xs">No outstanding debts found for this term.</p>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10">
            <Link 
              to="/cashier/debt"
              className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
            >
              View All Debtors
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, loading }: any) {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100"
  };

  if (loading) return <CardSkeleton />;

  return (
    <div className={`p-6 rounded-[2rem] border ${colors[color]} shadow-sm flex flex-col items-center text-center group hover:bg-white transition-all`}>
      <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-inherit transition-transform group-hover:scale-110`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
      <p className="text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}
