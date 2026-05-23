import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      style={style}
      className={cn(
        "animate-pulse rounded-md bg-slate-200/60",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
      <Skeleton className="w-14 h-14 rounded-xl" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4 w-full">
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-6 w-1/6" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-4 border-b border-slate-50">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="w-10 h-10 rounded-lg" />
      </div>
      <div className="flex items-end justify-between h-[250px] pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton 
            key={i} 
            className="w-10 rounded-t-lg" 
            style={{ height: `${Math.floor(Math.random() * 60) + 20}%` }} 
          />
        ))}
      </div>
    </div>
  );
}
