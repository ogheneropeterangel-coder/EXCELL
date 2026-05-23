import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Class, FeeStandard } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { 
  Save, 
  Loader2, 
  AlertCircle,
  Receipt,
  Plus,
  Trash2,
  Table as TableIcon
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export default function FeeStandards() {
  const { settings, profile } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [standards, setStandards] = useState<FeeStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');

  useEffect(() => {
    if (settings) {
      fetchData();
    }
  }, [settings]);

  async function fetchData() {
    try {
      const [
        { data: classesData },
        { data: standardsData }
      ] = await Promise.all([
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('fee_standards')
          .select('*, class:classes(class_name)')
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session)
      ]);

      setClasses(classesData || []);
      setStandards(standardsData || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveStandard(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId || !amount || isSubmitting) return;

    setIsSubmitting(true);
    try {
      console.log('FeeStandards: Saving standard. Role:', profile?.role);
      const { error } = await supabase
        .from('fee_standards')
        .upsert({
          class_id: parseInt(selectedClassId),
          term: settings?.current_term,
          session: settings?.current_session,
          amount: parseFloat(amount)
        }, { onConflict: 'class_id,term,session' });

      if (error) {
        console.error('FeeStandards: Error saving standard:', error);
        throw error;
      }
      
      toast.success('Fee standard updated successfully');
      setAmount('');
      setSelectedClassId('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteStandard(id: number) {
    if (!confirm('Are you sure you want to remove this fee standard?')) return;

    try {
      const { error } = await supabase
        .from('fee_standards')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Standard removed');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  if (loading) return <div className="animate-pulse space-y-8"><div className="h-64 bg-white rounded-3xl border border-slate-100"></div></div>;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-slate-900 rounded-xl shadow-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Fee Standards</h1>
          </div>
          <p className="text-slate-500 font-medium italic">Define required fees for each class in {settings?.current_term} Term {settings?.current_session}.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration Form */}
        <div className="lg:col-span-1">
          <form 
            onSubmit={saveStandard}
            className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6 sticky top-24"
          >
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Add/Edit Fee
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Select Class</label>
                <select
                  required
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-900 transition-all cursor-pointer"
                >
                  <option value="">Choose Class...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.class_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Required Amount</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">₦</div>
                  <input
                    required
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-900 transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Standard
            </button>

            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-[10px] text-blue-900 font-bold leading-relaxed uppercase">
                Revenue statistics on dashboards are calculated using these standard values.
              </p>
            </div>
          </form>
        </div>

        {/* Standards Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Active Standards</h2>
              </div>
              <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-tight">
                {standards.length} Classes Defined
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-50">
                  <tr>
                    <th className="px-8 py-4">Class</th>
                    <th className="px-8 py-4">Amount</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {standards.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest italic">
                        No fee standards defined for {settings?.current_term} term.
                      </td>
                    </tr>
                  ) : (
                    standards.map((s) => (
                      <motion.tr 
                        key={s.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-slate-50/30 transition-colors"
                      >
                        <td className="px-8 py-5">
                          <p className="font-black text-slate-900 uppercase tracking-tight">{s.class?.class_name}</p>
                        </td>
                        <td className="px-8 py-5">
                          <p className="font-black text-slate-900 text-lg">₦{Number(s.amount).toLocaleString()}</p>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button 
                            onClick={() => {
                              setSelectedClassId(s.class_id.toString());
                              setAmount(s.amount.toString());
                            }}
                            className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all mr-2"
                            title="Edit"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteStandard(s.id)}
                            className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
