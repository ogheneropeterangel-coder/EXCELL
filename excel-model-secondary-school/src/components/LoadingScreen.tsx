import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-[400px] w-full flex flex-col items-center justify-center space-y-4">
      <div className="relative">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <div className="absolute inset-0 bg-blue-600/20 blur-xl rounded-full" />
      </div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">
        Initializing Module
      </p>
    </div>
  );
}
