import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GraduationCap, Mail, Lock, Loader2, School, Sparkles } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion } from 'motion/react';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolName, setSchoolName] = useState('EMSS WUK');
  const [schoolMotto, setSchoolMotto] = useState('For Discipline & Academic Excellence');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSchoolSettings();
    checkAdminExists();
  }, []);

  async function checkAdminExists() {
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin');
      
      if (!error && count !== null) {
        setHasAdmin(count > 0);
      } else {
        setHasAdmin(false);
      }
    } catch (e) {
      console.error('Failed to check if admin exists', e);
      setHasAdmin(false);
    }
  }

  async function fetchSchoolSettings() {
    try {
      const { data, error } = await supabase.from('settings').select('school_name, school_logo_url, school_motto').single();
      if (data) {
        setSchoolName(data.school_name);
        setLogoUrl(data.school_logo_url);
        if (data.school_motto) {
          setSchoolMotto(data.school_motto);
        }
      }
    } catch (e) {
      console.error('Failed to fetch school settings');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      let loginEmail = identifier;
      let isStudentLogin = false;
      
      // If identifier doesn't look like an email, try to find the email by username
      if (!identifier.includes('@')) {
        // Find if it's a student in the students table first
        const { data: studentData, error: studentFetchError } = await supabase
          .from('students')
          .select('id, admission_number, last_name, first_name')
          .eq('admission_number', identifier)
          .maybeSingle();
        
        if (studentFetchError) throw studentFetchError;
        
        if (studentData) {
          // If student exists and password matches surname (case-insensitive check for surname)
          if (studentData.last_name.toLowerCase() === password.toLowerCase()) {
            loginEmail = `${studentData.admission_number}@school.com`;
            isStudentLogin = true;
            
            // Use admission number as the actual authentication password
            const authPassword = studentData.admission_number;
            
            // Attempt to sign up this student if they don't have an auth account
            // This is idempotent; if they exist, it returns an "already registered" error we catch
            const { error: signUpError } = await supabase.auth.signUp({
              email: loginEmail,
              password: authPassword,
              options: {
                data: {
                  name: studentData.first_name + ' ' + studentData.last_name,
                  role: 'student',
                  username: studentData.admission_number
                }
              }
            });
            
            if (signUpError && !signUpError.message.includes('already registered')) {
              throw signUpError;
            }

            // Perform the actual sign in using admission number as password
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: loginEmail,
              password: authPassword,
            });

            if (signInError) throw signInError;
            
            navigate('/student');
            toast.success('Logged in successfully');
            return;
          } else {
            throw new Error('Invalid credentials. Please check your admission number and surname.');
          }
        } else {
          // If not a student, check if it's a staff username in profiles
          const { data: profileData, error: profileFetchError } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', identifier)
            .maybeSingle();
          
          if (profileFetchError) throw profileFetchError;
          
          if (profileData) {
            loginEmail = profileData.email;
          } else {
            throw new Error('Username not found. Please use your email or a valid admission number.');
          }
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) throw error;

      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      // BOOTSTRAP / OVERWRITE ROLE FOR PRIMARY ADMIN ONLY:
      if (loginEmail === 'peteroghenero24@gmail.com') {
        if (!profile || profile.role !== 'admin') {
          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert([{
              id: data.user.id,
              name: 'Primary Admin',
              username: 'admin',
              email: loginEmail,
              role: 'admin'
            }])
            .select()
            .maybeSingle();
          
          if (upsertError) throw upsertError;
          profile = { role: 'admin' };
          toast.success('Admin profile bootstrapped successfully');
        }
      }

      if (!profile) {
        // If no profile exists and not bootstrap email, sign them out
        await supabase.auth.signOut();
        throw new Error('Your account was authenticated, but no profile was found. Please contact the administrator.');
      }

      if (profile.role === 'admin') {
        navigate('/admin');
      } else if (profile.role === 'teacher') {
        navigate('/teacher');
      } else if (profile.role === 'cashier') {
        navigate('/cashier');
      } else if (profile.role === 'exam_officer') {
        navigate('/exam_officer');
      } else {
        navigate('/student');
      }
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Login error details:', error);
      toast.error(error.message || 'Failed to login. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden font-sans">
      {/* Futuristic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
        
        {/* Animated Orbs */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 100, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, -100, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-[100px]"
        />
        
        {/* Student Background Image (Transparent & Filtered) */}
        <div className="absolute inset-0 z-[-1] opacity-20 grayscale brightness-50 contrast-125">
          <img 
            src="https://images.unsplash.com/photo-1523050853064-80d8390b4458?q=80&w=2000&auto=format&fit=crop" 
            alt="School background" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/80" />
        </div>
      </div>

      <Toaster position="top-right" theme="dark" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-md w-full bg-slate-900/40 backdrop-blur-3xl rounded-[2.5rem] p-8 md:p-12 border border-slate-800 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-20 h-20 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 relative"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <School className="w-10 h-10 text-white" />
            )}
            <div className="absolute -inset-1 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-2xl blur opacity-30 animate-pulse" />
          </motion.div>
          
          <div className="text-center">
            <h1 className="text-3xl font-black text-white tracking-tight mb-1 uppercase">
              {schoolName}
            </h1>
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] opacity-80">{schoolMotto}</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Portal Access ID</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="w-4 h-4 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950/50 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-white font-medium text-sm placeholder:text-slate-700"
                placeholder="Username or Admission No."
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">System Cipher</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950/50 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-white font-medium text-sm placeholder:text-slate-700"
                placeholder="••••••••"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/10 transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-6 text-xs uppercase tracking-[0.2em]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Initialize Login</span>
                <Sparkles className="w-3.5 h-3.5" />
              </>
            )}
          </motion.button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-800/50 text-center space-y-6">
          <div className="space-y-2">
            {hasAdmin !== true && (
              <p className="text-xs text-slate-500">
                New staff member? <Link to="/register" className="text-blue-400 font-bold hover:text-blue-300 transition-colors underline underline-offset-4 decoration-blue-500/30">Create Account</Link>
              </p>
            )}
            <p className="text-[10px] text-slate-600">
              Forgot access details? <span className="text-slate-400 font-bold hover:text-white cursor-pointer transition-colors">Contact Registry</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 opacity-40">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Encryption Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Portal Verified</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
