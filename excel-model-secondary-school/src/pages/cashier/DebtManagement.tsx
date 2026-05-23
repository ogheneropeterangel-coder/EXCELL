import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  Filter, 
  Wallet,
  AlertCircle,
  Download,
  AlertTriangle,
  History,
  Receipt,
  Calendar,
  CreditCard,
  UserRound,
  TrendingDown,
  ArrowRight,
  TrendingUp,
  X,
  Loader2
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Class } from '../../types';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

export default function DebtManagement() {
  const { settings, profile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [minBalance, setMinBalance] = useState<string>('');
  
  // Modal State
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [feeTransactions, setFeeTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedRecordForPayment, setSelectedRecordForPayment] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRecordForPayment || !paymentAmount || isPaying) return;

    const amount = Number(paymentAmount);
    if (amount <= 0 || amount > Number(selectedRecordForPayment.balance)) {
      toast.error('Invalid payment amount');
      return;
    }

    setIsPaying(true);
    try {
      const newPaid = Number(selectedRecordForPayment.amount_paid) + amount;
      const totalAmount = Number(selectedRecordForPayment.total_amount);
      let status: 'Paid' | 'Partial' | 'Not Paid' = 'Not Paid';
      if (newPaid >= totalAmount) status = 'Paid';
      else if (newPaid > 0) status = 'Partial';

      const { data: updatedRecord, error: recordError } = await supabase
        .from('fee_records')
        .update({
          amount_paid: newPaid,
          status: status,
          results_locked: status !== 'Paid',
          last_updated_by: settings?.id ? profile?.id : profile?.id, // Just use profile ID
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedRecordForPayment.id)
        .select()
        .single();

      if (recordError) throw recordError;

      const { error: txError } = await supabase
        .from('fee_transactions')
        .insert({
          fee_record_id: updatedRecord.id,
          amount: amount,
          payment_method: 'Cash', // Default to cash for debt payment or add selector
          cashier_id: profile?.id
        });

      if (txError) throw txError;

      toast.success('Debt payment processed');
      setIsPayModalOpen(false);
      setPaymentAmount('');
      fetchStudents(); // Refresh main list
      if (selectedStudent) {
        // Refresh local student record in state
        const updatedRecords = selectedStudent.fee_records.map((r: any) => 
          r.id === updatedRecord.id ? updatedRecord : r
        );
        setSelectedStudent({ ...selectedStudent, fee_records: updatedRecords });
        fetchTransactions(selectedStudent);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsPaying(false);
    }
  }

  async function fetchTransactions(student: any) {
    setLoadingTransactions(true);
    try {
      // Get all fee records for this student first to get their IDs
      const { data: records } = await supabase
        .from('fee_records')
        .select('id')
        .eq('student_id', student.id);
      
      if (records && records.length > 0) {
        const recordIds = records.map(r => r.id);
        const { data: txData, error } = await supabase
          .from('fee_transactions')
          .select('*, cashier:profiles(name)')
          .in('fee_record_id', recordIds)
          .order('transaction_date', { ascending: false });
        
        if (error) throw error;
        setFeeTransactions(txData || []);
      } else {
        setFeeTransactions([]);
      }
    } catch (error: any) {
      toast.error('Error fetching history: ' + error.message);
    } finally {
      setLoadingTransactions(false);
    }
  }

  useEffect(() => {
    if (selectedStudent && isModalOpen) {
      fetchTransactions(selectedStudent);
    }
  }, [selectedStudent, isModalOpen]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (settings) {
      if (!selectedTerm) setSelectedTerm(settings.current_term);
      if (!selectedSession) setSelectedSession(settings.current_session);
    }
  }, [settings]);

  useEffect(() => {
    if (selectedTerm && selectedSession) {
      fetchStudents();
    }
  }, [selectedClass, selectedTerm, selectedSession]);

  async function fetchInitialData() {
    try {
      const { data: classesData } = await supabase.from('classes').select('*').order('class_name');
      setClasses(classesData || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function fetchStudents() {
    setLoading(true);
    try {
      let query = supabase
        .from('students')
        .select(`
          *,
          class:classes(class_name),
          fee_records!left(*)
        `);

      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data, error } = await query.order('last_name');
      if (error) throw error;
      setStudents(data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  const processedStudents = students.filter(student => {
    const matchesSearch = `${student.first_name} ${student.last_name} ${student.admission_number}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    // Debt Calculation
    const currentRecord = student.fee_records?.find((f: any) => 
      f.term === selectedTerm && f.session === selectedSession
    );

    const totalBalance = student.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
    const hasCurrentDebt = currentRecord && Number(currentRecord.balance) > 0;
    
    // Status Filter logic
    if (filterStatus !== 'all') {
      if (filterStatus === 'Not Paid') {
        const isNotPaid = !currentRecord || currentRecord.status === 'Not Paid';
        if (!isNotPaid) return false;
      } else if (filterStatus === 'Partial') {
        const isPartial = currentRecord?.status === 'Partial';
        if (!isPartial) return false;
      }
    }

    // Min Balance Filter logic
    if (minBalance && !isNaN(Number(minBalance))) {
      if (totalBalance < Number(minBalance)) return false;
    }

    // A debtor is anyone with a total balance > 0 OR specifically hasn't paid for current term
    // (If they have NO record for current term, they owe the full amount)
    // We only show them if they actually owe something globally.
    return totalBalance > 0 || (currentRecord === undefined); 
  });

  const exportToExcel = () => {
    const data = processedStudents.map(s => {
      const currentRecord = s.fee_records?.find((f: any) => 
        f.term === selectedTerm && f.session === selectedSession
      );
      const totalPaid = s.fee_records?.reduce((sum: number, f: any) => sum + Number(f.amount_paid), 0) || 0;
      const totalBalance = s.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
      const carriedOver = s.fee_records?.filter((f: any) => f.term !== selectedTerm || f.session !== selectedSession)
                                     .reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;

      return {
        'Admission No': s.admission_number,
        'Full Name': `${s.first_name} ${s.last_name}`,
        'Class': s.class?.class_name,
        'Term Paid': currentRecord?.amount_paid || 0,
        'Term Balance': currentRecord?.balance || 0,
        'Carried Over Debt': carriedOver,
        'Total Outstanding': totalBalance,
        'Total Ever Paid': totalPaid
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Debtors List");
    XLSX.writeFile(wb, `Debtors_Report_${selectedTerm}_${selectedSession}.xlsx`);
    toast.success('Debtor report exported');
  };

  const totals = processedStudents.reduce((acc, s) => {
    const current = s.fee_records?.find((f: any) => f.term === selectedTerm && f.session === selectedSession);
    const carried = s.fee_records?.filter((f: any) => f.term !== selectedTerm || f.session !== selectedSession)
                               .reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
    
    return {
      currentDebt: acc.currentDebt + (current ? Number(current.balance) : 0),
      carriedOver: acc.carriedOver + carried,
      total: acc.total + (s.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0)
    };
  }, { currentDebt: 0, carriedOver: 0, total: 0 });

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Debt Management</h1>
          <p className="text-slate-500 font-medium tracking-tight">Monitor and track outstanding student balances across terms.</p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95"
        >
          <Download className="w-4 h-4" />
          Export Debtors (Excel)
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-blue-600/80 font-bold tracking-widest uppercase">Term Debt</p>
            <p className="text-2xl font-black text-blue-900">₦{totals.currentDebt.toLocaleString()}</p>
          </div>
        </div>
        <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
            <History className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-amber-600/80 font-bold tracking-widest uppercase">Carried Over</p>
            <p className="text-2xl font-black text-amber-900">₦{totals.carriedOver.toLocaleString()}</p>
          </div>
        </div>
        <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-rose-600/80 font-bold tracking-widest uppercase">Total Debt</p>
            <p className="text-2xl font-black text-rose-900">₦{totals.total.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search debtor name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
          >
            <option value="all">All Classes</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.class_name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm text-rose-600"
          >
            <option value="all" className="text-slate-900">All Debtors</option>
            <option value="Not Paid" className="text-rose-600">Owing (Full Amount)</option>
            <option value="Partial" className="text-amber-600">Owing (Partial Payment)</option>
          </select>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₦ &gt;</div>
            <input
              type="number"
              placeholder="Min Balance"
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
              className="pl-10 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm w-32"
            />
          </div>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
          >
            <option value="1st Term">1st Term</option>
            <option value="2nd Term">2nd Term</option>
            <option value="3rd Term">3rd Term</option>
          </select>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
          >
            <option value="">Select Session</option>
            {Array.from({ length: 10 }, (_, i) => {
              const startYear = new Date().getFullYear() - 5 + i;
              const session = `${startYear}/${startYear + 1}`;
              return <option key={session} value={session}>{session}</option>;
            })}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Term Paid</th>
                <th className="px-6 py-4">Term Balance</th>
                <th className="px-6 py-4">Carried Over</th>
                <th className="px-6 py-4 text-right">Total Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : processedStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                        <TrendingDown className="w-8 h-8" />
                      </div>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No debtors found matching criteria</p>
                    </div>
                  </td>
                </tr>
              ) : processedStudents.map((student) => {
                const currentRecord = student.fee_records?.find((f: any) => 
                  f.term === selectedTerm && f.session === selectedSession
                );
                const totalBalance = student.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
                const carriedOver = student.fee_records?.filter((f: any) => f.term !== selectedTerm || f.session !== selectedSession)
                                               .reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;

                return (
                  <tr 
                    key={student.id} 
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                          {student.first_name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 tracking-tight">{student.first_name} {student.last_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono font-bold tracking-tight uppercase">{student.class?.class_name} • {student.admission_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-emerald-600">₦{(currentRecord?.amount_paid || 0).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-rose-500">
                      ₦{(currentRecord?.balance || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                       <div className="space-y-1">
                         <span className={`inline-flex text-[10px] font-black uppercase tracking-tight py-1 px-2 rounded-lg ${carriedOver > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                           ₦{carriedOver.toLocaleString()}
                         </span>
                         {carriedOver > 0 && (
                           <div className="flex flex-wrap gap-1">
                             {student.fee_records
                               ?.filter((f: any) => (f.term !== selectedTerm || f.session !== selectedSession) && Number(f.balance) > 0)
                               .map((f: any) => (
                                 <span key={f.id} className="text-[7px] font-bold text-slate-400 bg-slate-50 px-1 rounded whitespace-nowrap">
                                   {f.term} {f.session.split('/')[0]}
                                 </span>
                               ))
                             }
                           </div>
                         )}
                       </div>
                       {currentRecord?.status === 'Partial' && (
                         <div className="mt-1">
                           <span className="text-[8px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-1 rounded">Partially Paid</span>
                         </div>
                       )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-lg font-black text-rose-600 tracking-tight">₦{totalBalance.toLocaleString()}</p>
                      <button 
                        onClick={() => {
                          setSelectedStudent(student);
                          setIsModalOpen(true);
                        }}
                        className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-rose-600 rounded-2xl shadow-lg shadow-rose-100">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Debt Breakdown</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto">
                <div className="space-y-8">
                  {/* Term Summaries */}
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Term Summaries</h3>
                    <div className="space-y-4">
                      {selectedStudent?.fee_records?.sort((a: any, b: any) => b.session.localeCompare(a.session)).map((record: any) => (
                        <div key={record.id} className={`p-6 rounded-3xl border border-slate-100 flex items-center justify-between ${Number(record.balance) > 0 ? 'bg-rose-50/50' : 'bg-emerald-50/30'}`}>
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{record.session} • {record.term}</p>
                            <div className="flex items-center gap-4">
                               <div>
                                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Target</p>
                                  <p className="font-bold text-slate-600 text-sm">₦{Number(record.total_amount).toLocaleString()}</p>
                               </div>
                               <div>
                                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Paid</p>
                                  <p className="font-bold text-emerald-600 text-sm">₦{Number(record.amount_paid).toLocaleString()}</p>
                               </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1">Balance</p>
                              <p className={`text-xl font-black tracking-tight ${Number(record.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                ₦{Number(record.balance).toLocaleString()}
                              </p>
                            </div>
                            {Number(record.balance) > 0 && (
                              <button 
                                onClick={() => {
                                  setSelectedRecordForPayment(record);
                                  setPaymentAmount(record.balance.toString());
                                  setIsPayModalOpen(true);
                                }}
                                className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                              >
                                <CreditCard className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Modal (Nested) */}
                  <AnimatePresence>
                    {isPayModalOpen && (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setIsPayModalOpen(false)}
                          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
                        >
                          <div className="flex items-center justify-between mb-8">
                             <div>
                               <h3 className="text-xl font-black text-slate-900 tracking-tight">Post Debt Payment</h3>
                               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                 {selectedRecordForPayment?.session} • {selectedRecordForPayment?.term}
                               </p>
                             </div>
                             <button onClick={() => setIsPayModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                               <X className="w-6 h-6 text-slate-400" />
                             </button>
                          </div>

                          <form onSubmit={handlePayment} className="space-y-6">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Amount to Pay</label>
                              <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-black">₦</div>
                                <input
                                  type="number"
                                  autoFocus
                                  required
                                  max={selectedRecordForPayment?.balance}
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                                  className="w-full pl-8 pr-4 py-4 bg-emerald-50 border-none rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none font-black text-emerald-900 transition-all"
                                />
                              </div>
                              <p className="text-[10px] text-slate-400 font-bold px-1 mt-1 uppercase">
                                Outstanding: <span className="text-rose-500">₦{Number(selectedRecordForPayment?.balance).toLocaleString()}</span>
                              </p>
                            </div>

                            <button
                              type="submit"
                              disabled={isPaying}
                              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                              Confirm Payment
                            </button>
                          </form>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Transaction History */}
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Payment Timeline</h3>
                    {loadingTransactions ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 text-slate-200 animate-spin" />
                      </div>
                    ) : feeTransactions.length > 0 ? (
                      <div className="space-y-3">
                        {feeTransactions.map((tx) => (
                          <div key={tx.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                                <Receipt className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">₦{Number(tx.amount).toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                  {new Date(tx.transaction_date).toLocaleDateString()} • {tx.payment_method}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">ID: {tx.receipt_number}</p>
                              {tx.cashier && (
                                <p className="text-[9px] font-bold text-slate-400 uppercase">by {tx.cashier.name}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No individual payments found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cumulative Debt</p>
                   <p className="text-2xl font-black text-rose-600 tracking-tight">
                     ₦{(selectedStudent?.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0).toLocaleString()}
                   </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
