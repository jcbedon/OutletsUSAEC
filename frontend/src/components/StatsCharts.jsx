import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";

const COLORS = ["#1E3A5F", "#2ECC71", "#F39C12", "#9B59B6", "#E74C3C", "#3498DB"];

function formatMoney(value) {
  return "$" + (value || 0).toFixed(2);
}

export function SalesTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="h-[250px] flex items-center justify-center text-gray-400">Sin datos de tendencia</div>;
  }
  
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1E3A5F" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorComisiones" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#2ECC71" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 10 }} 
          tickFormatter={(v) => v ? v.slice(5) : ""} 
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip 
          formatter={(value, name) => [formatMoney(value), name === "ventas" ? "Ventas" : "Comisiones"]}
          labelFormatter={(label) => `Fecha: ${label}`}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Legend />
        <Area 
          type="monotone" 
          dataKey="ventas" 
          name="Ventas" 
          stroke="#1E3A5F" 
          fill="url(#colorVentas)" 
          strokeWidth={2} 
        />
        <Area 
          type="monotone" 
          dataKey="comisiones" 
          name="Comisiones" 
          stroke="#2ECC71" 
          fill="url(#colorComisiones)" 
          strokeWidth={2} 
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StoreBarChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="h-[250px] flex items-center justify-center text-gray-400">Sin datos de tiendas</div>;
  }
  
  const chartData = data.slice(0, 6).map((s) => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "..." : s.name,
    ventas: s.ventas,
    comisiones: s.comisiones
  }));
  
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
        <Tooltip 
          formatter={(value) => formatMoney(value)}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Legend />
        <Bar dataKey="ventas" name="Ventas" fill="#1E3A5F" radius={[0, 4, 4, 0]} />
        <Bar dataKey="comisiones" name="Comisiones" fill="#2ECC71" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProfitPieChart({ commissions, shipping }) {
  const total = (commissions || 0) + (shipping || 0);
  
  if (total === 0) {
    return <div className="h-[250px] flex items-center justify-center text-gray-400">Sin datos de ganancias</div>;
  }
  
  const data = [
    { name: "Comisiones", value: commissions || 0 },
    { name: "Envios", value: shipping || 0 }
  ];
  
  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={5}
          dataKey="value"
          labelLine={false}
          label={renderCustomizedLabel}
        >
          <Cell fill="#F39C12" />
          <Cell fill="#9B59B6" />
        </Pie>
        <Tooltip 
          formatter={(value) => formatMoney(value)}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LiveBarChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="h-[250px] flex items-center justify-center text-gray-400">Sin datos de lives</div>;
  }
  
  const chartData = data.slice(0, 6).map((l) => ({
    name: l.name.length > 15 ? l.name.slice(0, 15) + "..." : l.name,
    ventas: l.ventas,
    comisiones: l.comisiones
  }));
  
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="name" 
          tick={{ fontSize: 9, angle: -45, textAnchor: "end" }} 
          interval={0}
          height={60}
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip 
          formatter={(value) => formatMoney(value)}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Legend />
        <Bar dataKey="ventas" name="Ventas" fill="#E74C3C" radius={[4, 4, 0, 0]} />
        <Bar dataKey="comisiones" name="Comisiones" fill="#F39C12" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
