'use client'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export function Chart({ data }: { data: Array<Record<string, number | string>> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="day" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="sent" stroke="#6366f1" />
          <Line type="monotone" dataKey="open" stroke="#22c55e" />
          <Line type="monotone" dataKey="click" stroke="#eab308" />
          <Line type="monotone" dataKey="reply" stroke="#06b6d4" />
          <Line type="monotone" dataKey="bounce" stroke="#ef4444" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
