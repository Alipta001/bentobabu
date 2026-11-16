import React from "react";

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-3xl p-5 border border-[#EFECE6] shadow-sm space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 bg-gray-200 rounded-md" />
        <div className="h-6 w-24 bg-gray-200 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-5 w-3/4 bg-gray-200 rounded-md" />
        <div className="h-4 w-1/2 bg-gray-200 rounded-md" />
      </div>
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="h-4 w-20 bg-gray-200 rounded-md" />
        <div className="h-9 w-32 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#EFECE6] shadow-sm space-y-2 animate-pulse">
      <div className="h-3 w-20 bg-gray-200 rounded" />
      <div className="h-7 w-28 bg-gray-200 rounded" />
      <div className="h-3 w-16 bg-gray-100 rounded" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-pulse p-4">
      <div className="h-6 w-36 bg-gray-200 rounded" />
      <div className="h-48 bg-gray-200 rounded-3xl w-full" />
      <div className="h-32 bg-gray-200 rounded-3xl w-full" />
      <div className="h-12 bg-gray-200 rounded-full w-full" />
    </div>
  );
}
