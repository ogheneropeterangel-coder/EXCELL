import { createClient } from '@supabase/supabase-js';

const cleanValue = (val: string | undefined, fallback: string) => {
  if (!val) return fallback;
  // Remove quotes and whitespace
  return val.replace(/['"]/g, '').trim();
};

export const supabaseUrl = cleanValue((import.meta as any).env.VITE_SUPABASE_URL, 'https://placeholder-project.supabase.co');
export const supabaseAnonKey = cleanValue((import.meta as any).env.VITE_SUPABASE_ANON_KEY, 'placeholder-key');

if (typeof window !== 'undefined') {
  console.log('Supabase Config Check:', {
    url: supabaseUrl,
    urlValid: supabaseUrl.startsWith('https://'),
    hasKey: !!supabaseAnonKey,
    keyLength: supabaseAnonKey?.length,
    isPlaceholder: supabaseUrl.includes('placeholder') || supabaseAnonKey.includes('placeholder')
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
