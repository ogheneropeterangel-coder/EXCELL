import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import LoadingScreen from './components/LoadingScreen';

// Core Pages
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

// Admin Pages
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Students = lazy(() => import('./pages/admin/Students'));
const Teachers = lazy(() => import('./pages/admin/Teachers'));
const Classes = lazy(() => import('./pages/admin/Classes'));
const Subjects = lazy(() => import('./pages/admin/Subjects'));
const Results = lazy(() => import('./pages/admin/Results'));
const ExamPermits = lazy(() => import('./pages/admin/ExamPermits'));
const Promotion = lazy(() => import('./pages/admin/Promotion'));
const Attendance = lazy(() => import('./pages/admin/Attendance'));
const IDCards = lazy(() => import('./pages/admin/IDCards'));
const Transcript = lazy(() => import('./pages/admin/Transcript'));
const FeeStatusChecker = lazy(() => import('./pages/admin/FeeStatusChecker'));
const FeeStandards = lazy(() => import('./pages/admin/FeeStandards'));
const SettingsPage = lazy(() => import('./pages/admin/Settings'));

// Cashier Pages
const CashierDashboard = lazy(() => import('./pages/cashier/Dashboard'));
const FeeManagement = lazy(() => import('./pages/cashier/FeeManagement'));
const DebtManagement = lazy(() => import('./pages/cashier/DebtManagement'));

// Teacher Pages
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));
const Scores = lazy(() => import('./pages/teacher/Scores'));
const TeacherAttendance = lazy(() => import('./pages/teacher/Attendance'));

// Student Pages
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));

// Exam Officer Pages
const ExamOfficerDashboard = lazy(() => import('./pages/exam_officer/Dashboard'));

export default function App() {
  const rawUrl = (import.meta as any).env.VITE_SUPABASE_URL;
  const rawKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
  const isConfigured = 
    rawUrl && 
    rawKey && 
    rawUrl.trim() !== "" &&
    rawKey.trim() !== "" &&
    !rawUrl.includes('placeholder') && 
    !rawKey.includes('placeholder') && 
    !rawUrl.includes('YOUR_SUPABASE') && 
    !rawKey.includes('YOUR_SUPABASE') &&
    rawUrl.startsWith('https://');

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-orange-100">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <SettingsIcon className="w-8 h-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tight">Configuration Required</h1>
          <p className="text-slate-500 mb-6 leading-relaxed">
            Please set your Supabase credentials in the <strong>Secrets</strong> panel (Settings menu) to start using the application.
          </p>
          <div className="space-y-3 text-left bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-xs overflow-x-auto">
            <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-2">Current Config Status:</p>
            <div className="space-y-1">
              <p><span className="text-blue-600 font-bold">URL:</span> {(import.meta as any).env.VITE_SUPABASE_URL ? `${(import.meta as any).env.VITE_SUPABASE_URL.trim()}${(import.meta as any).env.VITE_SUPABASE_URL !== (import.meta as any).env.VITE_SUPABASE_URL.trim() ? ' [HAS SPACES]' : ''}${/['"]/.test((import.meta as any).env.VITE_SUPABASE_URL) ? ' [HAS QUOTES]' : ''}` : 'MISSING'}</p>
              <p><span className="text-blue-600 font-bold">KEY:</span> {(import.meta as any).env.VITE_SUPABASE_ANON_KEY ? `${(import.meta as any).env.VITE_SUPABASE_ANON_KEY.trim().substring(0, 10)}...${(import.meta as any).env.VITE_SUPABASE_ANON_KEY !== (import.meta as any).env.VITE_SUPABASE_ANON_KEY.trim() ? ' [HAS SPACES]' : ''}${/['"]/.test((import.meta as any).env.VITE_SUPABASE_ANON_KEY) ? ' [HAS QUOTES]' : ''}` : 'MISSING'}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 font-medium">
            Make sure there are no spaces or quotes in your Secrets values. If you've just set them, try refreshing the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route element={<Layout />}>
              {/* Admin Routes */}
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/students" element={<Students />} />
              <Route path="/admin/teachers" element={<Teachers />} />
              <Route path="/admin/classes" element={<Classes />} />
              <Route path="/admin/subjects" element={<Subjects />} />
              <Route path="/admin/results" element={<Results />} />
              <Route path="/admin/attendance" element={<Attendance />} />
              <Route path="/admin/idcards" element={<IDCards />} />
              <Route path="/admin/transcript" element={<Transcript />} />
              <Route path="/admin/permits" element={<ExamPermits />} />
              <Route path="/admin/promotion" element={<Promotion />} />
              <Route path="/admin/scores" element={<Scores />} />
              <Route path="/admin/fees" element={<FeeStatusChecker />} />
              <Route path="/admin/fee-standards" element={<FeeStandards />} />
              <Route path="/admin/settings" element={<SettingsPage />} />

              {/* Cashier Routes */}
              <Route path="/cashier" element={<CashierDashboard />} />
              <Route path="/cashier/fees" element={<FeeManagement />} />
              <Route path="/cashier/debt" element={<DebtManagement />} />
              <Route path="/cashier/fee-standards" element={<FeeStandards />} />
              <Route path="/cashier/students" element={<Students />} />

              {/* Teacher Routes */}
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/attendance" element={<TeacherAttendance />} />
              <Route path="/teacher/scores" element={<Scores />} />
              <Route path="/teacher/students" element={<Students />} />
              <Route path="/teacher/results" element={<Results />} />

              {/* Student Routes */}
              <Route path="/student" element={<StudentDashboard />} />

              {/* Exam Officer Routes */}
              <Route path="/exam_officer" element={<ExamOfficerDashboard />} />
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
