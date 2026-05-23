import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { 
  Users, 
  Search, 
  Download, 
  Loader2,
  Filter,
  CreditCard,
  QrCode,
  Printer,
  X,
  CheckCircle,
  AlertCircle,
  Maximize
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Class, Student } from '../../types';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Navigate } from 'react-router-dom';

export default function IDCards() {
  const { profile, settings } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'exam_officer';
  
  if (!canManage && profile) {
    return <Navigate to="/teacher" replace />;
  }

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Validation States
  const [showScanner, setShowScanner] = useState(false);
  const [scannedResult, setScannedResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    fetchInitialData();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        "reader", 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      scanner.render(onScanSuccess, onScanFailure);
      scannerRef.current = scanner;
    } else {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        scannerRef.current = null;
      }
    }
  }, [showScanner]);

  async function onScanSuccess(decodedText: string) {
    if (isValidating) return;
    
    try {
      let regNumber = '';
      
      // Try to parse as JSON first (handles both old and new formats)
      try {
        const data = JSON.parse(decodedText);
        // New cards use 'reg', old cards used 'id' for admission number
        regNumber = data.reg || data.id?.toString() || '';
        
        // If it looks like a new format but missing reg, or just suspicious
        if (!regNumber && data.admission_number) {
          regNumber = data.admission_number;
        }
      } catch (e) {
        // Not JSON, treat as raw admission number
        regNumber = decodedText.trim();
      }

      if (regNumber) {
        // Pause scanner if possible
        if (scannerRef.current) {
          try {
            await scannerRef.current.pause(true);
          } catch (pauseErr) {
            console.warn("Scanner pause failure", pauseErr);
          }
        }
        await validateStudent(regNumber);
      } else {
        toast.error('Invalid ID format. Could not find admission number.');
      }
    } catch (e) {
      console.error('QR Scan error:', e);
      toast.error('Scanner error occurred');
    }
  }

  function onScanFailure(error: any) {
    // console.warn(`Code scan error = ${error}`);
  }

  async function validateStudent(regNumber: string) {
    setIsValidating(true);
    setScannedResult(null);
    try {
      // First try exact match
      let { data, error } = await supabase
        .from('students')
        .select('*, class:classes(class_name)')
        .eq('admission_number', regNumber)
        .maybeSingle();

      // If not found, try case-insensitive match
      if (!data && !error) {
        const { data: retryData, error: retryError } = await supabase
          .from('students')
          .select('*, class:classes(class_name)')
          .ilike('admission_number', regNumber)
          .maybeSingle();
        data = retryData;
        error = retryError;
      }

      if (error) throw error;
      if (!data) throw new Error(`Student with ID "${regNumber}" not found in database.`);
      
      setScannedResult(data);
      toast.success('Identity Verified');
    } catch (error: any) {
      console.error('Validation error:', error);
      toast.error(error.message || 'Verification failed');
      setScannedResult({ error: true, message: error.message || 'Student not found.' });
    } finally {
      setIsValidating(false);
    }
  }

  async function fetchInitialData() {
    try {
      const { data: classesData } = await supabase.from('classes').select('*').order('class_name');
      setClasses(classesData || []);
    } catch (error: any) {
      toast.error('Error fetching classes: ' + error.message);
    }
  }

  useEffect(() => {
    fetchStudents();
  }, [selectedClass]);

  async function fetchStudents() {
    setLoading(true);
    try {
      let query = supabase.from('students').select('*, class:classes(class_name)');
      
      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data, error } = await query;
      if (error) throw error;
      setStudents(data || []);
    } catch (error: any) {
      toast.error('Error fetching students: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateIDCard(student: any) {
    setGenerating(student.id);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [54, 86] // CR80 Standard ID Card Size
      });

      const headerColor = settings?.id_card_header_color || '#2563eb';
      const accentColor = settings?.id_card_accent_color || '#3b82f6';
      const textColor = settings?.id_card_primary_text_color || '#0f172a';
      const fontStyle = settings?.id_card_font_style || 'helvetica';

      // Background
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 54, 86, 'F');

      // Top Decorative Shape
      doc.setFillColor(headerColor);
      doc.rect(0, 0, 54, 25, 'F');
      
      // Bottom Decorative Shape
      doc.setFillColor(accentColor);
      doc.rect(0, 82, 54, 4, 'F');

      // School Logo (if exists)
      if (settings?.school_logo_url) {
        try {
          doc.addImage(settings.school_logo_url, 'PNG', 4, 3, 10, 10);
        } catch (e) {
          console.warn('Could not load logo for PDF', e);
        }
      }

      // School Name
      doc.setTextColor(255, 255, 255);
      doc.setFont(fontStyle, 'bold');
      const schoolName = (settings?.school_name || 'SCHOOL NAME').toUpperCase();
      doc.setFontSize(schoolName.length > 20 ? 7 : 9);
      doc.text(schoolName, 30, 8, { align: 'center', maxWidth: 40 });

      doc.setFontSize(6);
      doc.setFont(fontStyle, 'normal');
      doc.text((settings?.school_motto || '').toUpperCase(), 30, 13, { align: 'center', maxWidth: 40 });

      // Profile Picture Box
      doc.setDrawColor(accentColor);
      doc.setLineWidth(0.5);
      doc.roundedRect(14, 20, 26, 26, 2, 2, 'D');
      
      // Placeholder text or icon in box
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(5);
      doc.text('HOLDER PHOTO', 27, 34, { align: 'center' });

      // Identity Label
      doc.setFillColor(accentColor);
      doc.roundedRect(15, 48, 24, 5, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont(fontStyle, 'bold');
      doc.text('STUDENT', 27, 51.5, { align: 'center' });

      // Student Name
      doc.setTextColor(textColor);
      doc.setFontSize(11);
      doc.setFont(fontStyle, 'bold');
      const fullName = `${student.first_name} ${student.last_name}`.toUpperCase();
      doc.text(fullName, 27, 58, { align: 'center', maxWidth: 50 });

      // Student Details
      doc.setFontSize(7);
      doc.setFont(fontStyle, 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('ADMISSION NO:', 10, 64);
      doc.setTextColor(textColor);
      doc.text(student.admission_number, 32, 64);

      doc.setTextColor(100, 116, 139);
      doc.text('CLASS / LEVEL:', 10, 68);
      doc.setTextColor(textColor);
      doc.text(student.class?.class_name || 'N/A', 32, 68);

      // QR Code
      const qrData = JSON.stringify({
        id: student.id,
        reg: student.admission_number,
        type: 'student_id'
      });
      const qrDataUrl = await QRCode.toDataURL(qrData);
      doc.addImage(qrDataUrl, 'PNG', 36, 70, 12, 12);

      // Signatures
      doc.setDrawColor(200, 200, 200);
      doc.line(5, 78, 20, 78);
      doc.setFontSize(4);
      doc.text('PRINCIPAL', 12.5, 80, { align: 'center' });

      doc.save(`ID_${student.admission_number}.pdf`);
      toast.success('ID Card generated successfully');
    } catch (error: any) {
      toast.error('Error generating ID Card: ' + error.message);
    } finally {
      setGenerating(null);
    }
  }

  async function generateBulkIDCards() {
    if (students.length === 0) return;
    toast.info('Generating bulk ID cards, please wait...');
    // In a real app we might combine them into one PDF, but here we just loop or limit
    const limit = 10;
    const toGen = students.slice(0, limit);
    for (const student of toGen) {
      await generateIDCard(student);
    }
    if (students.length > limit) {
      toast.warning(`Generated first ${limit} ID cards. Bulk generation is limited for performance.`);
    }
  }

  const filteredStudents = students.filter(s => 
    `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" /> Student ID Cards
          </h1>
          <p className="text-slate-500">Generate professional identity cards with unique QR codes.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95"
          >
            <Maximize className="w-4 h-4" />
            Validate ID Card
          </button>
          <button
            onClick={generateBulkIDCards}
            disabled={students.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            Bulk Generate (Max 10)
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-64">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none cursor-pointer"
            >
              <option value="all">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search students by name or admission number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredStudents.map(student => (
            <div key={student.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-20 h-20 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-300 font-bold mb-4 shadow-inner overflow-hidden">
                  <Users className="w-8 h-8 opacity-20" />
                </div>
                
                <h3 className="font-bold text-slate-900 text-center uppercase tracking-tight line-clamp-1">
                  {student.first_name} {student.last_name}
                </h3>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">
                  {student.class?.class_name || 'No Class'}
                </p>
                <div className="w-12 h-1 bg-blue-100 rounded-full my-4"></div>
                
                <div className="flex items-center gap-4 w-full pt-2">
                  <div className="flex-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Admission No.</p>
                    <p className="text-sm font-mono font-bold text-slate-700">{student.admission_number}</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                    <QrCode className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
                  </div>
                </div>

                <button
                  onClick={() => generateIDCard(student)}
                  disabled={generating === student.id}
                  className="w-full mt-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {generating === student.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Download Card
                </button>
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4 opacity-50" />
              <p className="text-slate-500 font-medium italic">No students found matching your criteria.</p>
            </div>
          )}
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative border border-white/20">
            <button 
              onClick={() => {
                setShowScanner(false);
                setScannedResult(null);
              }}
              className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-slate-900 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" />
                Validate ID Card
              </h2>
              <p className="text-sm text-slate-500 mb-6">Point your camera at the ID card QR code.</p>

              {scannedResult ? (
                <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                  {scannedResult.error ? (
                    <div className="p-6 bg-rose-50 rounded-2xl flex flex-col items-center text-center border border-rose-100">
                      <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
                      <h3 className="font-bold text-rose-900">Verification Failed</h3>
                      <p className="text-sm text-rose-600 mt-1">{scannedResult.message}</p>
                    </div>
                  ) : (
                    <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <div className="flex flex-col items-center text-center mb-6">
                        <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
                        <h3 className="font-bold text-emerald-900">Identity Verified</h3>
                        <div className="mt-2 px-3 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full uppercase tracking-widest">
                          Active Student
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-emerald-100/50 text-sm">
                          <span className="text-emerald-700/60 font-medium tracking-tight">FULL NAME</span>
                          <span className="font-bold text-emerald-900">{scannedResult.first_name} {scannedResult.last_name}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-emerald-100/50 text-sm">
                          <span className="text-emerald-700/60 font-medium tracking-tight">ADMISSION NO.</span>
                          <span className="font-mono font-bold text-emerald-900">{scannedResult.admission_number}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 text-sm">
                          <span className="text-emerald-700/60 font-medium tracking-tight">CLASS LEVEL</span>
                          <span className="font-bold text-emerald-900">{scannedResult.class?.class_name || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <button
                    onClick={() => {
                      setScannedResult(null);
                      if (scannerRef.current) scannerRef.current.resume();
                    }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-lg active:scale-95"
                  >
                    Scan Another Card
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl bg-slate-100 relative aspect-square">
                  <div id="reader" className="w-full h-full"></div>
                  {isValidating && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        <p className="text-sm font-bold text-slate-600 tracking-tight">Verifying with Database...</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
