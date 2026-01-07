// -----------------------------------------------------------------------------
// Statistiques des polices
// - Composant purement présentational qui calcule et affiche une visualisation
//   simple (diagramme circulaire CSS) de la répartition des contrats par type.
// -----------------------------------------------------------------------------
import React from 'react';
import { Policy, PolicyType } from '../types';
import { PieChart } from 'lucide-react';

interface Props {
  policies: Policy[];
}

export const PolicyStats: React.FC<Props> = ({ policies }) => {
  if (policies.length === 0) return null;

  // Group by type
  const stats = policies.reduce((acc, policy) => {
    acc[policy.type] = (acc[policy.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = policies.length;
  const categories = Object.keys(stats);
  
  // Colors for the chart
  const colors = [
    '#0ea5e9', // primary-500
    '#f59e0b', // amber-500
    '#10b981', // emerald-500
    '#8b5cf6', // violet-500
    '#ef4444', // red-500
    '#64748b'  // slate-500
  ];

  // Create conic gradient string for pure CSS pie chart
  let currentDeg = 0;
  const gradientParts = categories.map((cat, i) => {
    const count = stats[cat];
    const percentage = (count / total) * 100;
    const deg = (count / total) * 360;
    const color = colors[i % colors.length];
    const str = `${color} ${currentDeg}deg ${currentDeg + deg}deg`;
    currentDeg += deg;
    return str;
  });

  const gradientString = `conic-gradient(${gradientParts.join(', ')})`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <PieChart className="w-5 h-5 text-slate-500" />
        Répartition du Portefeuille
      </h3>
      
      <div className="flex flex-col sm:flex-row items-center gap-8">
        {/* Chart Circle */}
        <div className="relative w-40 h-40 flex-shrink-0">
          <div 
            className="w-full h-full rounded-full"
            style={{ background: gradientString }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                <span className="text-3xl font-bold text-slate-800">{total}</span>
                <span className="text-xs text-slate-500 font-medium uppercase">Contrats</span>
             </div>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 w-full">
          {categories.map((cat, i) => (
            <div key={cat} className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: colors[i % colors.length] }} 
                />
                <span className="text-sm text-slate-700 font-medium">{cat}</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{stats[cat]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};