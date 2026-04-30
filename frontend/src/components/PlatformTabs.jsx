import { PLATFORMS, PLATFORM_LABELS, PLATFORM_COLORS } from '../utils/helpers';

export default function PlatformTabs({ value, onChange }) {
  return (
    <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
      {PLATFORMS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            value === p
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: value === p ? '#FFFFFF' : PLATFORM_COLORS[p] }}
          />
          {PLATFORM_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
