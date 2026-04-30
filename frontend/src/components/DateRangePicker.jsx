import { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import dayjs from 'dayjs';
import { DATE_PRESETS, formatDate } from '../utils/helpers';

export default function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value?.from || '');
  const [customTo, setCustomTo] = useState(value?.to || '');
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handlePreset = (preset) => {
    const range = preset.getValue();
    onChange(range);
    setCustomFrom(range.from);
    setCustomTo(range.to);
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      onChange({ from: customFrom, to: customTo });
      setOpen(false);
    }
  };

  const displayLabel = value?.from && value?.to
    ? `${formatDate(value.from, 'DD/MM/YYYY')} — ${formatDate(value.to, 'DD/MM/YYYY')}`
    : 'Chọn ngày';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
      >
        <Calendar size={14} className="text-slate-400" />
        {displayLabel}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg w-80">
          <div className="grid grid-cols-2 gap-1 p-2 border-b border-slate-100">
            {DATE_PRESETS.map(preset => (
              <button
                key={preset.key}
                onClick={() => handlePreset(preset)}
                className="text-left px-3 py-2 text-sm rounded-md hover:bg-slate-50 text-slate-700"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2">
            <div className="text-xs text-slate-500 mb-1">Tùy chỉnh khoảng thời gian</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Từ</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-md outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Đến</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-md outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <button
              onClick={handleCustomApply}
              className="w-full mt-2 bg-brand-500 text-white py-1.5 rounded-md text-sm hover:bg-brand-600"
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
