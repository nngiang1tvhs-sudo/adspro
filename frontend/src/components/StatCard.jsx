export default function StatCard({ label, value, color = 'default', size = 'normal' }) {
  const colorClass = {
    default: 'text-slate-800',
    blue: 'text-blue-600',
    green: 'text-emerald-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  }[color];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`font-semibold ${colorClass} ${size === 'small' ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </div>
    </div>
  );
}
