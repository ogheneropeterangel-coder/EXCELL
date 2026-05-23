import React from 'react';
import Results from '../admin/Results';

export default function TeacherResults() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Student Results</h1>
        <p className="text-slate-500">View performance reports for your subjects.</p>
      </header>
      <Results />
    </div>
  );
}
