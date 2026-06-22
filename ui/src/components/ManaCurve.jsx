import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const CMC_COLORS = ['#9aacb8','#5a9e6f','#4e9bcd','#7c5cbf','#c89b3c','#e35d4a','#e8683a','#c84040']

export function ManaCurve({ curve = {} }) {
  const labels = ['0','1','2','3','4','5','6','7+']
  const data = labels.map((label, i) => ({
    cmc: label,
    count: curve[label] || 0,
    color: CMC_COLORS[i],
  }))

  const max = Math.max(...data.map(d => d.count), 1)

  return (
    <div>
      <h3 className="text-arena-gold text-xs font-semibold uppercase tracking-widest mb-2">
        Mana Curve
      </h3>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="cmc"
            tick={{ fill: '#8892a4', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, max]}
            tick={{ fill: '#8892a4', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip
            cursor={{ fill: 'rgba(200,155,60,0.08)' }}
            contentStyle={{ background: '#1a2235', border: '1px solid #2a3550', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#c89b3c' }}
            itemStyle={{ color: '#d4d8e8' }}
            formatter={(val) => [val, 'cards']}
          />
          <Bar dataKey="count" radius={[3,3,0,0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
