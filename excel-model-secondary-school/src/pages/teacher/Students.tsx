import React from 'react';
import Students from '../admin/Students';

export default function TeacherStudents() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">My Students</h1>
        <p className="text-slate-500">View students assigned to your classes.</p>
      </header>
      <Students />
    </div>
  );
}
