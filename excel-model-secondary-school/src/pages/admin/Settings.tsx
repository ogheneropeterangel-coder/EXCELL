import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Settings as SettingsType } from '../../types';
import { 
  Save, 
  Upload, 
  Loader2,
  School,
  Image as ImageIcon
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { useAuth } from '../../context/AuthContext';

export default function Settings() {
  const { refreshSettings } = useAuth();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      setSettings(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setIsSubmitting(true);

    try {
      let logoUrl = settings.school_logo_url;
      let signatureUrl = settings.principal_signature_url;

      if (logoFile) {
        // Convert to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(logoFile);
        logoUrl = await base64Promise;
      }

      if (signatureFile) {
        // Convert to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(signatureFile);
        signatureUrl = await base64Promise;
      }

      const updateData: any = {
        school_name: settings.school_name,
        school_motto: settings.school_motto,
        current_term: settings.current_term,
        current_session: settings.current_session,
        school_logo_url: logoUrl,
        principal_signature_url: signatureUrl,
        id_card_header_color: settings.id_card_header_color,
        id_card_accent_color: settings.id_card_accent_color,
        id_card_font_style: settings.id_card_font_style,
        id_card_primary_text_color: settings.id_card_primary_text_color
      };

      // Only include next_term_begins if it's not null/undefined
      if (settings.next_term_begins !== undefined) {
        updateData.next_term_begins = settings.next_term_begins;
      }

      const { error } = await supabase.from('settings').update(updateData).eq('id', 1);

      if (error) {
        // If the error is specifically about the missing column, try updating without it
        if (error.message.includes("next_term_begins") || error.code === "42703") {
          const { next_term_begins, ...dataWithoutNextTerm } = updateData;
          const { error: retryError } = await supabase.from('settings').update(dataWithoutNextTerm).eq('id', 1);
          
          if (retryError) throw retryError;
          
          toast.warning('Settings saved, but "Next Term Begins" could not be updated because the column is missing in your database. Please add it to the "settings" table in Supabase.');
        } else {
          throw error;
        }
      } else {
        toast.success('Settings updated successfully');
      }

      await refreshSettings();
      fetchSettings();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) return <div className="animate-pulse space-y-8"><div className="h-64 bg-white rounded-2xl border border-slate-100"></div></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Toaster position="top-right" />
      
      <header>
        <h1 className="text-2xl font-bold text-slate-900">School Settings</h1>
        <p className="text-slate-500 mt-1">Configure your school's identity and current academic period.</p>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-slate-700 mb-4">School Logo</label>
              <div className="relative group">
                <div className="w-32 h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group-hover:border-blue-400 transition-colors">
                  {logoFile ? (
                    <img src={URL.createObjectURL(logoFile)} alt="Preview" className="w-full h-full object-contain" />
                  ) : settings?.school_logo_url ? (
                    <img src={settings.school_logo_url} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-lg shadow-md border border-slate-100 group-hover:bg-blue-50 transition-colors">
                  <Upload className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 text-center uppercase tracking-wider font-semibold">Click to change</p>
            </div>

            <div className="flex-1 space-y-6 w-full">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">School Name</label>
                <input
                  required
                  type="text"
                  value={settings?.school_name || ''}
                  onChange={(e) => setSettings({...settings!, school_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">School Motto</label>
                <input
                  type="text"
                  value={settings?.school_motto || ''}
                  onChange={(e) => setSettings({...settings!, school_motto: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start pt-6 border-t border-slate-100">
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-slate-700 mb-4">Principal's Signature</label>
              <div className="relative group">
                <div className="w-48 h-20 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group-hover:border-blue-400 transition-colors">
                  {signatureFile ? (
                    <img src={URL.createObjectURL(signatureFile)} alt="Preview" className="w-full h-full object-contain" />
                  ) : settings?.principal_signature_url ? (
                    <img src={settings.principal_signature_url} alt="Signature" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="w-6 h-6 text-slate-300 mx-auto" />
                      <p className="text-[10px] text-slate-400 font-medium">None</p>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSignatureFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-lg shadow-md border border-slate-100 group-hover:bg-blue-50 transition-colors">
                  <Upload className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 text-center uppercase tracking-wider font-semibold">Click to upload signature</p>
            </div>
            
            <div className="flex-1 space-y-6 w-full py-4 text-slate-500 text-sm">
              <p>Upload a clear image of the principal's signature on a white background. This will be automatically placed at the bottom of generated report cards.</p>
              <div className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg w-fit">
                <ImageIcon className="w-4 h-4" />
                Recommended: PNG with transparent background
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Term</label>
              <select
                value={settings?.current_term || ''}
                onChange={(e) => setSettings({...settings!, current_term: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="1st">1st Term</option>
                <option value="2nd">2nd Term</option>
                <option value="3rd">3rd Term</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Session</label>
              <select
                required
                value={settings?.current_session || ''}
                onChange={(e) => setSettings({...settings!, current_session: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {Array.from({ length: 21 }, (_, i) => {
                  const startYear = 2024 + i;
                  const session = `${startYear}/${startYear + 1}`;
                  return <option key={session} value={session}>{session}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Next Term Begins</label>
              <input
                type="text"
                value={settings?.next_term_begins || ''}
                onChange={(e) => setSettings({...settings!, next_term_begins: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. 15th April, 2026"
              />
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <School className="w-4 h-4 text-blue-600" />
              </div>
              ID Card Customization
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Header Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings?.id_card_header_color || '#2563eb'}
                    onChange={(e) => setSettings({...settings!, id_card_header_color: e.target.value})}
                    className="w-10 h-10 border-0 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings?.id_card_header_color || '#2563eb'}
                    onChange={(e) => setSettings({...settings!, id_card_header_color: e.target.value})}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Accent Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings?.id_card_accent_color || '#3b82f6'}
                    onChange={(e) => setSettings({...settings!, id_card_accent_color: e.target.value})}
                    className="w-10 h-10 border-0 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings?.id_card_accent_color || '#3b82f6'}
                    onChange={(e) => setSettings({...settings!, id_card_accent_color: e.target.value})}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Text Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings?.id_card_primary_text_color || '#0f172a'}
                    onChange={(e) => setSettings({...settings!, id_card_primary_text_color: e.target.value})}
                    className="w-10 h-10 border-0 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings?.id_card_primary_text_color || '#0f172a'}
                    onChange={(e) => setSettings({...settings!, id_card_primary_text_color: e.target.value})}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Font Style</label>
                <select
                  value={settings?.id_card_font_style || 'helvetica'}
                  onChange={(e) => setSettings({...settings!, id_card_font_style: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="helvetica">Helvetica (Standard)</option>
                  <option value="times">Times New Roman</option>
                  <option value="courier">Courier</option>
                </select>
              </div>
            </div>
            <div className="mt-6 p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
              <div className="w-16 h-24 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div style={{ backgroundColor: settings?.id_card_header_color || '#2563eb' }} className="h-4 w-full"></div>
                <div className="p-1 flex flex-col items-center gap-1">
                  <div className="w-10 h-10 bg-slate-100 rounded-md"></div>
                  <div style={{ backgroundColor: settings?.id_card_accent_color || '#3b82f6' }} className="h-1 w-8 rounded-full"></div>
                  <div className="space-y-0.5 w-full">
                    <div className="h-1 w-full bg-slate-100 rounded-full"></div>
                    <div className="h-1 w-2/3 bg-slate-100 rounded-full"></div>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Preview Layout</p>
                <p className="text-xs text-slate-500">The generated PDF will follow this color scheme.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2 font-semibold"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
