
import React from 'react';
import { Policy, PolicyType } from '../types';
import { ShieldCheck, Info, Activity } from 'lucide-react';

interface Props {
  policies: Policy[];
}

export const PolicyStats: React.FC<Props> = ({ policies }) => {
  if (policies.length === 0) return null;

  const healthScore = Math.min(100, (policies.length * 15) + 20);
  const stats = policies.reduce((acc, policy) => {
    acc[policy.type] = (acc[policy.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = policies.length;
  const categories = Object.keys(stats);
  const colors = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#64748b'];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-white/10 rounded-2xl text-primary-400 shadow-inner"><ShieldCheck className="w-6 h-6" /></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Indice de Protection Globale</span>
          </div>
          <div className="mt-4">
            <div className="text-5xl font-black text-white">{healthScore}%</div>
            <div className="w-full bg-white/10 h-3 rounded-full mt-6 overflow-hidden border border-white/5">
              <div className="bg-primary-500 h-full transition-all duration-1000 shadow-[0_0_20px_rgba(14,165,233,0.5)]" style={{ width: `${healthScore}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">Niveau de sérénité calculé par l'IA</p>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 opacity-5 transform rotate-12"><ShieldCheck className="w-48 h-48" /></div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-8">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
            <Activity className="w-4 h-4 text-primary-500" />
            Répartition des Garanties
          </h3>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-12">
          <div className="relative w-40 h-40 flex-shrink-0">
             <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                {categories.map((cat, i) => {
                   const count = stats[cat];
                   const percentage = (count / total) * 100;
                   let offset = 0;
                   for(let j=0; j<i; j++) offset += (stats[categories[j]] / total) * 100;
                   return (
                      <circle key={cat} cx="18" cy="18" r="15.915" fill="transparent" stroke={colors[i % colors.length]} strokeWidth="4" strokeDasharray={`${percentage} ${100 - percentage}`} strokeDashoffset={100 - offset} className="transition-all duration-1000 ease-out" />
                   );
                })}
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-900 leading-none">{total}</span>
                <span className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-tighter">Assurances</span>
             </div>
          </div>

          <div className="flex-grow grid grid-cols-1 gap-3">
            {categories.map((cat, i) => (
              <div key={cat} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: colors[i % colors.length] }} />
                  <span className="text-xs text-slate-600 font-black uppercase tracking-tight">{cat}</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="h-1.5 w-24 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                      <div className="h-full bg-slate-200 transition-all group-hover:bg-primary-500" style={{ width: `${(stats[cat]/total)*100}%` }} />
                   </div>
                   <span className="text-xs font-black text-slate-900">{stats[cat]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
