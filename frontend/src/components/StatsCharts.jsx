import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend, ComposedChart, Line, ReferenceLine } from "recharts";

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

export function ClientsDebtsChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="h-[300px] flex items-center justify-center text-gray-400">Sin datos de clientes</div>;
  }
  
  // Prepare chart data - show clients with significant balances (positive or negative)
  const chartData = data
    .filter(c => Math.abs(c.pending_balance) > 0.01)
    .slice(0, 15)
    .map((c) => ({
      name: c.name.length > 12 ? c.name.slice(0, 12) + "..." : c.name,
      fullName: c.name,
      customerId: c.customer_id,
      balance: c.pending_balance,
      debt: c.debt_amount,
      wallet: c.wallet_balance,
      shipping: c.total_shipping,
      createdAt: c.created_at ? new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'
    }));
  
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isDebt = data.balance < 0;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg text-sm">
          <p className="font-bold text-slate-800">{data.fullName}</p>
          <p className="text-gray-500 text-xs">ID: {data.customerId}</p>
          <p className="text-gray-500 text-xs">Registrado: {data.createdAt}</p>
          <div className="mt-2 space-y-1">
            <p className="text-blue-600">Wallet: {formatMoney(data.wallet)}</p>
            <p className="text-purple-600">Envíos: {formatMoney(data.shipping)}</p>
            <p className={`font-bold ${isDebt ? 'text-red-600' : 'text-green-600'}`}>
              {isDebt ? `Debe: ${formatMoney(Math.abs(data.balance))}` : `A favor: ${formatMoney(data.balance)}`}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="name" 
          tick={{ fontSize: 9, angle: -45, textAnchor: "end" }} 
          interval={0}
          height={80}
        />
        <YAxis 
          tick={{ fontSize: 10 }} 
          tickFormatter={(v) => `$${v}`}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
        <Bar 
          dataKey="balance" 
          name="Balance Pendiente"
          radius={[4, 4, 0, 0]}
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.balance < 0 ? "#EF4444" : "#22C55E"} 
            />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ClientsDebtsPieChart({ summary }) {
  if (!summary) {
    return <div className="h-[200px] flex items-center justify-center text-gray-400">Sin datos</div>;
  }
  
  const data = [
    { name: "Sin Deuda", value: summary.clients_positive_balance || 0, color: "#22C55E" },
    { name: "Con Deuda", value: summary.clients_with_debt || 0, color: "#EF4444" }
  ].filter(d => d.value > 0);
  
  if (data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center text-gray-400">Sin clientes</div>;
  }
  
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={70}
          paddingAngle={5}
          dataKey="value"
          labelLine={false}
          label={renderLabel}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip 
          formatter={(value, name) => [value + " clientes", name]}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ClientsByDateChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="h-[250px] flex items-center justify-center text-gray-400">Sin datos de clientes</div>;
  }
  
  // Group clients by creation month
  const monthlyData = {};
  data.forEach(c => {
    if (c.created_at) {
      const date = new Date(c.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { 
          month: monthLabel, 
          key: monthKey,
          clientes: 0, 
          deudaTotal: 0,
          saldoPositivo: 0
        };
      }
      monthlyData[monthKey].clientes += 1;
      if (c.pending_balance < 0) {
        monthlyData[monthKey].deudaTotal += Math.abs(c.pending_balance);
      } else {
        monthlyData[monthKey].saldoPositivo += c.pending_balance;
      }
    }
  });
  
  const chartData = Object.values(monthlyData)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-12); // Last 12 months
  
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="month" 
          tick={{ fontSize: 10 }} 
        />
        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip 
          formatter={(value, name) => {
            if (name === "clientes") return [value, "Clientes"];
            return [formatMoney(value), name === "deudaTotal" ? "Deuda Total" : "Saldo a Favor"];
          }}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Legend />
        <Bar yAxisId="left" dataKey="clientes" name="Clientes" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="deudaTotal" name="Deuda Total" stroke="#EF4444" strokeWidth={2} dot={{ fill: "#EF4444" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
