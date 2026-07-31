import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { seniorityLabel } from '../labels.js';

// Light-theme colors aligned to the design tokens (see docs/UI-redesign.md §7).
const TIER_COLORS = { Forte: '#16a34a', Médio: '#f59e0b', Fraco: '#ef4444' };

export default function Charts({ candidates }) {
  if (!candidates.length) return null;

  // Score distribution by tier
  const tiers = { Forte: 0, Médio: 0, Fraco: 0 };
  candidates.forEach((c) => {
    const s = c.analysis?.score ?? 0;
    if (s >= 80) tiers.Forte++;
    else if (s >= 60) tiers.Médio++;
    else tiers.Fraco++;
  });
  const tierData = Object.entries(tiers).map(([name, value]) => ({ name, value }));

  // Seniority mix (mapped to friendly pt-BR labels)
  const senio = {};
  candidates.forEach((c) => {
    const k = seniorityLabel(c.analysis?.seniority_estimate);
    senio[k] = (senio[k] || 0) + 1;
  });
  const senioData = Object.entries(senio).map(([name, value]) => ({ name, value }));
  const PIE = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#7c3aed'];

  const tooltipStyle = {
    background: '#ffffff',
    border: '1px solid #d7dde7',
    borderRadius: 8,
    color: '#1c2430',
    boxShadow: '0 6px 18px rgba(16,24,40,.12)',
  };

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Distribuição de notas</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={tierData}>
            <XAxis dataKey="name" stroke="#5b6675" fontSize={12} />
            <YAxis allowDecimals={false} stroke="#5b6675" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(16,24,40,0.05)' }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {tierData.map((d) => (
                <Cell key={d.name} fill={TIER_COLORS[d.name]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Nível de experiência</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={senioData} dataKey="value" nameKey="name" outerRadius={70} label>
              {senioData.map((d, i) => (
                <Cell key={d.name} fill={PIE[i % PIE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
