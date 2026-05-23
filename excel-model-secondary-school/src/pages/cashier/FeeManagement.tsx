import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  Filter, 
  Wallet,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ExternalLink,
  Plus,
  CreditCard,
  Banknote,
  Navigation,
  FileText,
  X,
  AlertTriangle,
  AlertCircle,
  History,
  Receipt,
  Calendar,
  UserRound
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Student, Class, FeeRecord, FeeTransaction } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function FeeManagement() {
  const { settings, profile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [feeStandards, setFeeStandards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [transactions, setTransactions] = useState<FeeTransaction[]>([]);
  
  const [paymentData, setPaymentData] = useState({
    amount: '',
    total_amount: '',
    term: '',
    session: '',
    method: 'Cash' as 'Cash' | 'Bank Transfer' | 'POS' | 'Online',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function fetchInitialData() {
    try {
      const [
        { data: classesData },
        { data: standardsData }
      ] = await Promise.all([
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('fee_standards').select('*').eq('term', settings?.current_term).eq('session', settings?.current_session)
      ]);
      setClasses(classesData || []);
      setFeeStandards(standardsData || []);
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

      let filteredData = data || [];
      if (filterStatus !== 'all') {
        filteredData = filteredData.filter(s => {
          const record = s.fee_records?.find((f: any) => 
            f.term === settings?.current_term && f.session === settings?.current_session
          );
          if (filterStatus === 'Paid') return record?.status === 'Paid';
          if (filterStatus === 'Partial') return record?.status === 'Partial';
          if (filterStatus === 'Owing') return !record || record.status === 'Not Paid';
          return true;
        });
      }

      setStudents(filteredData);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInitialData();
  }, [settings?.current_term, settings?.current_session]);

  useEffect(() => {
    fetchStudents();
  }, [selectedClass, filterStatus, settings?.current_term, settings?.current_session]);

  const updatePaymentInfo = (term: string, session: string, student: any) => {
    const record = student.fee_records?.find((f: any) => 
      f.term === term && f.session === session
    );
    
    // Find expected amount from standards if no record exists
    supabase
      .from('fee_standards')
      .select('amount')
      .eq('class_id', student.class_id)
      .eq('term', term)
      .eq('session', session)
      .maybeSingle()
      .then(({ data }) => {
        const defaultTotal = data?.amount || 0;
        const currentPaid = record?.amount_paid || 0;
        const totalAmount = record?.total_amount || defaultTotal;
        const balance = Number(totalAmount) - Number(currentPaid);

        setPaymentData(prev => ({
          ...prev,
          amount: balance > 0 ? balance.toString() : '',
          total_amount: totalAmount.toString(),
          term,
          session
        }));
      });
  };

  async function openPaymentModal(student: any) {
    setSelectedStudent(student);
    const term = settings?.current_term || '';
    const session = settings?.current_session || '';
    
    setPaymentData({
      amount: '',
      total_amount: '',
      term,
      session,
      method: 'Cash',
    });
    
    updatePaymentInfo(term, session, student);
    setIsPaymentModalOpen(true);
  }

  async function fetchHistory(feeRecordId: number) {
    try {
      const { data, error } = await supabase
        .from('fee_transactions')
        .select('*, cashier:profiles(name)')
        .eq('fee_record_id', feeRecordId)
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      setTransactions(data || []);
      setIsHistoryModalOpen(true);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function processPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent || isSubmitting) return;

    const amount = Number(paymentData.amount);
    const totalAmount = Number(paymentData.total_amount);
    const { term, session } = paymentData;

    if (!term || !session) {
      toast.error('Terms and session are required');
      return;
    }

    const record = selectedStudent.fee_records?.find((f: any) => 
      f.term === term && f.session === session
    );
    const recordExistsForTotalChange = !!record;

    if (amount <= 0 && !recordExistsForTotalChange) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Get or Create Fee Record
      let currentPaid = Number(record?.amount_paid || 0);
      let newPaid = currentPaid + amount;
      
      let status: 'Paid' | 'Partial' | 'Not Paid' = 'Not Paid';
      if (newPaid >= totalAmount) status = 'Paid';
      else if (newPaid > 0) status = 'Partial';

      const upsertData: any = {
        student_id: selectedStudent.id,
        term: term,
        session: session,
        total_amount: totalAmount,
        amount_paid: newPaid,
        status: status,
        results_locked: status !== 'Paid',
        last_updated_by: profile?.id,
        updated_at: new Date().toISOString()
      };

      const { data: updatedRecord, error: recordError } = await supabase
        .from('fee_records')
        .upsert(upsertData, { onConflict: 'student_id,term,session' })
        .select()
        .single();

      if (recordError) throw recordError;
      
      // 2. Log Transaction if amount > 0
      if (amount > 0) {
        const { error: txError } = await supabase
          .from('fee_transactions')
          .insert({
            fee_record_id: updatedRecord.id,
            amount: amount,
            payment_method: paymentData.method,
            cashier_id: profile?.id
          });
        if (txError) throw txError;
      }

      toast.success('Payment processed successfully');
      setIsPaymentModalOpen(false);
      fetchStudents();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleLock(studentId: number, record: any) {
    try {
      const { error } = await supabase
        .from('fee_records')
        .update({ results_locked: !record.results_locked })
        .eq('id', record.id);
      
      if (error) throw error;
      toast.success(`Results ${record.results_locked ? 'unlocked' : 'locked'}`);
      fetchStudents();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const recordExistsForTotalChange = selectedStudent?.fee_records?.find((f: any) => 
    f.term === settings?.current_term && f.session === settings?.current_session
  );

  const filteredStudents = students.filter(student => 
    `${student.first_name} ${student.last_name} ${student.admission_number}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Fee Management</h1>
          <p className="text-slate-500 font-medium tracking-tight">Process payments and manage access for {settings?.current_term} Term.</p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search student by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
          />
        </div>
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-sm text-slate-700"
        >
          <option value="all">All Classes</option>
          {classes.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.class_name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-sm text-slate-700"
        >
          <option value="all">Any Status</option>
          <option value="Paid">Fully Paid</option>
          <option value="Partial">Partially Paid</option>
          <option value="Owing">Owe Full Amount</option>
        </select>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-[0.2em] font-black">
              <tr>
                <th className="px-8 py-6">Student</th>
                <th className="px-8 py-6">Financial Balance</th>
                <th className="px-8 py-6">Status</th>
                <th className="px-8 py-6">Portal Access</th>
                <th className="px-8 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6">
                      <div className="h-12 bg-slate-50 rounded-2xl"></div>
                    </td>
                  </tr>
                ))
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="max-w-xs mx-auto">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                        <Users className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-slate-900 font-bold mb-1">No students found</p>
                      <p className="text-sm text-slate-400">Try adjusting your filters or search term.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const record = student.fee_records?.find((f: any) => 
                    f.term === settings?.current_term && f.session === settings?.current_session
                  );
                  
                  const status = record?.status || 'Not Paid';
                  const expected = Number(record?.total_amount || 0);
                  const paid = Number(record?.amount_paid || 0);
                  const balance = expected - paid;
                  const isLocked = record ? record.results_locked : true;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${
                            status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : 
                            status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {student.first_name[0]}{student.last_name[0]}
                          </div>
                          <div>
                            <p className="font-black text-slate-900 uppercase tracking-tight text-sm">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                              {student.admission_number} • {student.class?.class_name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900">₦{paid.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase leading-none">Paid</span>
                            </div>
                            {balance > 0 && (
                              <div className="text-right">
                                <p className="text-[9px] font-black text-rose-500 uppercase tracking-tight leading-none">Remaining</p>
                                <p className="text-[10px] font-black text-rose-600 uppercase tracking-tight">₦{balance.toLocaleString()}</p>
                              </div>
                            )}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex items-center">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                status === 'Paid' ? 'bg-emerald-500' : 'bg-amber-500'
                              }`} 
                              style={{ width: `${expected > 0 ? (paid / expected) * 100 : 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        {(() => {
                          const standard = feeStandards.find(fs => fs.class_id === student.class_id);
                          const requiredAmount = standard ? Number(standard.amount) : 0;
                          const isActuallyPaid = (record?.status === 'Paid' || status === 'Paid') && (paid >= requiredAmount && requiredAmount > 0);
                          const isPartial = !isActuallyPaid && paid > 0;
                          
                          return (
                            <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border ${
                              isActuallyPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              isPartial ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>
                              {isActuallyPaid ? 'Paid (Cleared)' : isPartial ? 'Partial / Owing' : 'Owing (Full)'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-8 py-4">
                        <button
                          onClick={() => record && toggleLock(student.id, record)}
                          disabled={!record}
                          className={`flex items-center gap-2 group transition-all ${
                            isLocked ? 'text-slate-400' : 'text-blue-600'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="w-4 h-4" />
                              <span className="text-[10px] font-black uppercase">Restricted</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-4 h-4" />
                              <span className="text-[10px] font-black uppercase">Full Access</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openPaymentModal(student)}
                            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                            title="Process Payment"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => record && fetchHistory(record.id)}
                            disabled={!record}
                            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm disabled:opacity-30"
                            title="View Invoices"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-200">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Process Payment</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-2 text-slate-400 hover:bg-white hover:text-slate-900 rounded-xl transition-all border border-transparent hover:border-slate-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={processPayment} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Term</label>
                    <select
                      value={paymentData.term}
                      onChange={(e) => {
                        const newTerm = e.target.value;
                        setPaymentData({...paymentData, term: newTerm});
                        updatePaymentInfo(newTerm, paymentData.session, selectedStudent);
                      }}
                      className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-900 text-sm transition-all"
                    >
                      <option value="1st Term">1st Term</option>
                      <option value="2nd Term">2nd Term</option>
                      <option value="3rd Term">3rd Term</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Academic Session</label>
                    <input
                      type="text"
                      placeholder="e.g. 2024/2025"
                      value={paymentData.session}
                      onChange={(e) => {
                        const newSession = e.target.value;
                        setPaymentData({...paymentData, session: newSession});
                        updatePaymentInfo(paymentData.term, newSession, selectedStudent);
                      }}
                      className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-900 text-sm transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Amount Due (Total)</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">₦</div>
                      <input
                        type="number"
                        required
                        value={paymentData.total_amount}
                        onChange={(e) => setPaymentData({...paymentData, total_amount: e.target.value})}
                        className="w-full pl-8 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-900 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Paying Now</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-black">₦</div>
                      <input
                        type="number"
                        value={paymentData.amount}
                        onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                        placeholder="0.00"
                        className="w-full pl-8 pr-4 py-4 bg-emerald-50 border-none rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none font-black text-emerald-900 placeholder:text-emerald-300 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Payment Method</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Cash', 'Bank Transfer', 'POS', 'Online'].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentData({...paymentData, method: method as any})}
                        className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all ${
                          paymentData.method === method 
                            ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-amber-900 font-bold leading-relaxed uppercase">
                    Confirm payment with student before proceeding. Final Status: 
                    <span className="ml-1 text-slate-900 border-b-2 border-slate-900">
                      { (Number(selectedStudent?.fee_records?.find((f: any) => f.term === paymentData.term && f.session === paymentData.session)?.amount_paid || 0) + Number(paymentData.amount)) >= Number(paymentData.total_amount) ? 'FULLY PAID' : 'PARTIAL / OWING BALANCE' }
                    </span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Finalize & Post Payment
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-100">
                    <History className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Invoice History</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-all"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto">
                {transactions.length > 0 ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-start gap-4">
                          <div className="p-2 bg-white rounded-xl shadow-sm">
                            <Receipt className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-lg font-black text-slate-900">₦{Number(tx.amount).toLocaleString()}</p>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[9px] font-black uppercase">
                                {tx.payment_method}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-slate-500">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <p className="text-[10px] font-bold tracking-tight uppercase">
                                  {new Date(tx.transaction_date).toLocaleDateString(undefined, { 
                                    day: 'numeric', 
                                    month: 'long', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <CreditCard className="w-3 h-3 text-slate-400" />
                                <p className="text-[10px] font-bold tracking-tight uppercase">REC: {tx.receipt_number}</p>
                              </div>
                              {tx.cashier && (
                                <div className="flex items-center gap-2 text-slate-500">
                                  <UserRound className="w-3 h-3 text-slate-400" />
                                  <p className="text-[10px] font-bold tracking-tight uppercase">Cashier: {tx.cashier.name}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-6 bg-blue-900 rounded-3xl text-white flex items-center gap-4 shadow-xl shadow-blue-100">
                        <div className="p-2 bg-white/10 rounded-xl">
                          <Wallet className="w-5 h-5 text-white/70" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Paid</p>
                          <p className="text-xl font-black tracking-tight">₦{transactions.reduce((sum, tx) => sum + Number(tx.amount), 0).toLocaleString()}</p>
                        </div>
                      </div>
                      
                      {(() => {
                        const record = selectedStudent?.fee_records?.find((f: any) => 
                          f.term === settings?.current_term && f.session === settings?.current_session
                        );
                        const balance = record ? Number(record.total_amount) - Number(record.amount_paid) : 0;
                        
                        return (
                          <div className={`p-6 rounded-3xl flex items-center gap-4 shadow-xl ${
                            balance > 0 ? 'bg-rose-600 text-white shadow-rose-100' : 'bg-emerald-600 text-white shadow-emerald-100'
                          }`}>
                            <div className="p-2 bg-white/10 rounded-xl">
                              <AlertCircle className="w-5 h-5 text-white/70" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                {balance > 0 ? 'Balance Owing' : 'Fully Paid'}
                              </p>
                              <p className="text-xl font-black tracking-tight">
                                {balance > 0 ? `₦${balance.toLocaleString()}` : 'CLEARED'}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                      <Receipt className="w-10 h-10 text-slate-200" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-900 tracking-tight">No Transactions Found</p>
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No payments recorded for this period.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
