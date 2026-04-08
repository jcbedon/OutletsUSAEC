import { useState, useEffect } from "react";
import { getRechargeReport } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileBarChart, UserPlus, Users } from "lucide-react";

export default function RechargeReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("admin");

  useEffect(() => {
    getRechargeReport()
      .then(res => setData(res.data))
      .catch(() => toast.error("Error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Card className="rounded-2xl"><CardContent className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div></CardContent></Card>;
  }

  if (!data) {
    return <Card className="rounded-2xl border-dashed"><CardContent className="p-8 text-center"><FileBarChart className="h-10 w-10 text-gray-300 mx-auto" /><p className="text-gray-500 mt-2">Sin datos</p></CardContent></Card>;
  }

  const list = tab === "admin" ? data.admin_created : data.client_requested;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-xl border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-green-700 font-bold">{data.totals.admin_created.count}</p>
              <p className="text-xs text-green-600">${data.totals.admin_created.total.toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-xl border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-blue-700 font-bold">{data.totals.client_requested.count}</p>
              <p className="text-xs text-blue-600">${data.totals.client_requested.total.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab("admin")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "admin" ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>
          Admin ({data.admin_created.length})
        </button>
        <button onClick={() => setTab("client")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "client" ? "bg-blue-100 text-blue-700" : "bg-gray-100"}`}>
          Clientes ({data.client_requested.length})
        </button>
      </div>

      {tab === "client" && (
        <div className="flex gap-2 text-xs">
          <Badge className="bg-green-100 text-green-700">✓ {data.totals.client_requested.approved}</Badge>
          <Badge className="bg-yellow-100 text-yellow-700">⏳ {data.totals.client_requested.pending}</Badge>
          <Badge className="bg-red-100 text-red-700">✗ {data.totals.client_requested.rejected}</Badge>
        </div>
      )}

      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {list.map(d => (
            <Card key={d.id} className="rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-sm">{d.user_name}</p>
                  <p className="text-xs text-gray-500">#{d.user_customer_id}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">${d.amount.toFixed(2)}</p>
                  <Badge className={d.status === "approved" ? "bg-green-500" : d.status === "rejected" ? "bg-red-500" : "bg-yellow-500"} variant="secondary">
                    {d.status === "approved" ? "✓" : d.status === "rejected" ? "✗" : "⏳"}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
