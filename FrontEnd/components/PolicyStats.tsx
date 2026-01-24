
import React from 'react';
import { Policy, PolicyType } from '../types';
import { ShieldCheck, Info, Activity, Trophy, Star, ShieldAlert } from 'lucide-react';

interface Props {
  policies: Policy[];
}

export const PolicyStats: React.FC<Props> = ({ policies }) => {
  if (policies.length === 0) return null;

  const healthScore = Math.min(100, (policies.length * 15) + 20);
  
  const getRank = (score: number) => {
    if (score < 40) return { label: 'Novice', icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' };
    if (score < 70) return { label: 'Protecteur', icon: ShieldCheck, color: 'text-primary-500', bg: 'bg-primary-50' };
    return { label: 'Maître de la Sérénité', icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-50' };
  };

  const rank = getRank(healthScore);
  const RankIcon = rank.icon;

  const stats = policies.reduce((acc, policy) => {
    acc[policy.type] = (acc[policy.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = policies.length;
  const categories = Object.keys(stats);
  const colors = ['bg-indigo-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-sky-500', 'bg-slate-500'];

  return (
    <div className="space-y-6">
      {/* Interactive Power Gauge */}
      <div className="bg-white rounded-[3rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 relative overflow-hidden group">
        <div className="relative z-10 flex flex-col items-center text-center space-y-4">
          <div className={`${rank.bg} ${rank.color} p-4 rounded-3xl shadow-inner animate-bounce-slow`}>
            <RankIcon className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Rang : {rank.label}</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Score de Puissance BienCouvert</p>
          </div>
          
          <div className="w-full max-w-xs space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
               <span>Vulnérable</span>
               <span className={rank.color}>{healthScore}%</span>
               <span>Invulnérable</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-1 border border-slate-50">
               <div 
                 className={`h-full rounded-full transition-all duration-1000 ease-out shadow-lg ${rank.color.replace('text', 'bg')}`}
                 style={{ width: `${healthScore}%` }}
               >
                 <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
               </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium max-w-[200px]">
            {healthScore < 80 ? "Ajoutez encore 2 contrats pour passer au rang supérieur ! 🚀" : "Impressionnant ! Votre protection est quasi-parfaite. ✨"}
          </p>
        </div>
        {/* Background Decorative Shapes */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-slate-50 rounded-full blur-3xl opacity-50 group-hover:bg-primary-50 transition-colors" />
      </div>

      {/* Distribution visual with pill-style counts */}
      <div className="bg-slate-50 rounded-[2.5rem] p-6 space-y-4">
         <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Répartition de votre arsenal</h4>
         <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat, i) => (
              <div key={cat} className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3 group hover:scale-105 transition-transform">
                <div className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
                <span className="text-[10px] font-black text-slate-700 uppercase">{cat}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-lg text-[10px] font-black text-slate-500">{stats[cat]}</span>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
};
