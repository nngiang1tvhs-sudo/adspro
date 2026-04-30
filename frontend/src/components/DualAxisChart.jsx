import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import { formatNumber, formatCurrency } from '../utils/helpers';

export default function DualAxisChart({ data, leftKey = 'spend', rightKey = 'result', leftLabel = 'Chi tiêu', rightLabel = 'Kết quả', leftColor = '#2563EB', rightColor = '#D97706' }) {
  const formattedData = (data || []).map(d => ({
    ...d,
    date: dayjs(d.date).format('DD/MM'),
  }));

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={formattedData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#CBD5E1" />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: '#64748B' }}
            stroke={leftColor}
            tickFormatter={(v) => formatNumber(v)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: '#64748B' }}
            stroke={rightColor}
            tickFormatter={(v) => formatNumber(v)}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            formatter={(value, name) => {
              if (name === leftLabel) return [formatCurrency(value), name];
              return [formatNumber(value), name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            iconType="circle"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey={leftKey}
            name={leftLabel}
            stroke={leftColor}
            strokeWidth={2.5}
            dot={{ r: 3, fill: leftColor }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey={rightKey}
            name={rightLabel}
            stroke={rightColor}
            strokeWidth={2.5}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: rightColor }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
