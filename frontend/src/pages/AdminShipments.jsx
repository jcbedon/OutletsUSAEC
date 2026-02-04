import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  getAllShipments, 
  updateShipmentStatus, 
  updateTracking,
  getAllClients,
  getPendingShipmentPurchases,
  createShipment
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  Truck, 
  Package, 
  CheckCircle, 
  Clock, 
  Plus,
  MapPin,
  Phone,
  Edit,
  Navigation
} from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/2n5fsvku_outlets.jpg";

export default function AdminShipments() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(null);
  const [newTracking, setNewTracking] = useState("");
  
  // Create shipment form
  const [selectedClient, setSelectedClient] = useState(null);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [shipmentForm, setShipmentForm] = useState({
    shipping_type: "",
    shipping_cost: "",
    address: "",
    country: "",
    phone: "",
    additional_info: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [shipmentsRes, clientsRes] = await Promise.all([
        getAllShipments(),
        getAllClients()
      ]);
      setShipments(shipmentsRes.data);
      setClients(clientsRes.data);
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = async (clientId) => {
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client);
    setSelectedPurchases([]);
    
    if (client) {
      try {
        const response = await getPendingShipmentPurchases(clientId);
        setPendingPurchases(response.data);
        setShipmentForm({
          ...shipmentForm,
          country: client.country,
          phone: client.whatsapp
        });
      } catch (error) {
        toast.error("Error al cargar compras");
      }
    }
  };

  const handleCreateShipment = async () => {
    if (!selectedClient || selectedPurchases.length === 0 || !shipmentForm.shipping_type || !shipmentForm.address || !shipmentForm.shipping_cost) {
      toast.error("Completa todos los campos requeridos");
      return;
    }

    const cost = parseFloat(shipmentForm.shipping_cost);
    if (isNaN(cost) || cost < 0) {
      toast.error("Ingresa un costo de envío válido");
      return;
    }

    try {
      await createShipment({
        user_id: selectedClient.id,
        purchase_ids: selectedPurchases,
        shipping_type: shipmentForm.shipping_type,
        shipping_cost: cost,
        address: shipmentForm.address,
        country: shipmentForm.country,
        phone: shipmentForm.phone,
        additional_info: shipmentForm.additional_info
      });
      
      toast.success("Envío creado exitosamente");
      setCreateDialogOpen(false);
      setSelectedClient(null);
      setPendingPurchases([]);
      setSelectedPurchases([]);
      setShipmentForm({
        shipping_type: "",
        shipping_cost: "",
        address: "",
        country: "",
        phone: "",
        additional_info: ""
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear envío");
    }
  };

  const handleUpdateStatus = async (shipmentId, newStatus) => {
    try {
      await updateShipmentStatus(shipmentId, newStatus);
      toast.success(`Estado actualizado a: ${getStatusLabel(newStatus)}`);
      loadData();
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleUpdateTracking = async (shipmentId) => {
    if (!newTracking.trim()) {
      toast.error("Ingresa un número de tracking");
      return;
    }
    
    try {
      await updateTracking(shipmentId, newTracking);
      toast.success("Tracking actualizado");
      setTrackingDialogOpen(null);
      setNewTracking("");
      loadData();
    } catch (error) {
      toast.error("Error al actualizar tracking");
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      preparing: "Preparando",
      in_transit: "En Tránsito",
      delivered: "Entregado"
    };
    return labels[status] || status;
  };

  const getStatusBadge = (status) => {
    const styles = {
      preparing: "bg-yellow-100 text-yellow-800",
      in_transit: "bg-blue-100 text-blue-800",
      delivered: "bg-green-100 text-green-800"
    };
    return (
      <Badge className={`${styles[status]} font-medium`}>
        {getStatusLabel(status)}
      </Badge>
    );
  };

  const filterByStatus = (status) => {
    if (status === "all") return shipments;
    return shipments.filter(s => s.status === status);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/admin")}
              data-testid="back-btn"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={LOGO_URL} alt="Outlets USA EC" className="h-8 object-contain" />
            <span className="font-bold text-slate-800">Envíos</span>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-red-600 hover:bg-red-700 font-bold rounded-xl"
                data-testid="create-shipment-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Envío</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {/* Client Select */}
                <div>
                  <Label>Cliente</Label>
                  <Select onValueChange={handleClientSelect}>
                    <SelectTrigger className="h-12 rounded-xl mt-1" data-testid="select-client">
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          #{client.customer_id} - {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pending Purchases */}
                {selectedClient && (
                  <>
                    <div>
                      <Label>Compras a enviar ({pendingPurchases.length} disponibles)</Label>
                      {pendingPurchases.length === 0 ? (
                        <p className="text-sm text-gray-500 mt-2">No hay compras pendientes de envío</p>
                      ) : (
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                          {pendingPurchases.map((purchase) => (
                            <label 
                              key={purchase.id}
                              className={`flex items-center p-3 rounded-xl border cursor-pointer transition-colors ${
                                selectedPurchases.includes(purchase.id) 
                                  ? 'bg-red-50 border-red-200' 
                                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPurchases.includes(purchase.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPurchases([...selectedPurchases, purchase.id]);
                                  } else {
                                    setSelectedPurchases(selectedPurchases.filter(id => id !== purchase.id));
                                  }
                                }}
                                className="mr-3"
                              />
                              <div className="flex-1">
                                <p className="font-medium text-sm">{purchase.item_name}</p>
                                <p className="text-xs text-gray-500">{purchase.store}</p>
                              </div>
                              <span className="font-bold text-red-600">${purchase.price.toFixed(2)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Shipping Type */}
                    <div>
                      <Label>Tipo de Envío</Label>
                      <Select 
                        value={shipmentForm.shipping_type}
                        onValueChange={(value) => setShipmentForm({ ...shipmentForm, shipping_type: value })}
                      >
                        <SelectTrigger className="h-12 rounded-xl mt-1" data-testid="select-shipping-type">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="with_family">Con Familiar en USA</SelectItem>
                          <SelectItem value="without_family">Sin Familiar en USA</SelectItem>
                          <SelectItem value="custom">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Shipping Cost - Custom */}
                    <div>
                      <Label>Costo de Envío (USD) *</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Ej: 32, 52, o personalizado"
                        value={shipmentForm.shipping_cost}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, shipping_cost: e.target.value })}
                        className="h-12 rounded-xl mt-1 text-xl font-bold"
                        data-testid="shipping-cost-input"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Define el precio según el cliente y el envío
                      </p>
                    </div>

                    {/* Address */}
                    <div>
                      <Label>Dirección Completa</Label>
                      <Textarea
                        placeholder="Calle, número, ciudad..."
                        value={shipmentForm.address}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, address: e.target.value })}
                        className="mt-1 rounded-xl"
                        data-testid="shipment-address"
                      />
                    </div>

                    {/* Country & Phone */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>País</Label>
                        <Input
                          value={shipmentForm.country}
                          onChange={(e) => setShipmentForm({ ...shipmentForm, country: e.target.value })}
                          className="h-12 rounded-xl mt-1"
                        />
                      </div>
                      <div>
                        <Label>Teléfono</Label>
                        <Input
                          value={shipmentForm.phone}
                          onChange={(e) => setShipmentForm({ ...shipmentForm, phone: e.target.value })}
                          className="h-12 rounded-xl mt-1"
                        />
                      </div>
                    </div>

                    {/* Additional Info */}
                    <div>
                      <Label>Información Adicional (opcional)</Label>
                      <Textarea
                        placeholder="Notas adicionales..."
                        value={shipmentForm.additional_info}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, additional_info: e.target.value })}
                        className="mt-1 rounded-xl"
                      />
                    </div>

                    <Button
                      onClick={handleCreateShipment}
                      className="w-full h-12 bg-red-600 hover:bg-red-700 font-bold rounded-xl"
                      disabled={selectedPurchases.length === 0}
                      data-testid="submit-shipment-btn"
                    >
                      <Truck className="h-5 w-5 mr-2" />
                      Crear Envío
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
              <p className="text-2xl font-extrabold text-slate-800">
                {shipments.filter(s => s.status === "preparing").length}
              </p>
              <p className="text-xs text-gray-500">Preparando</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <Truck className="h-6 w-6 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-extrabold text-slate-800">
                {shipments.filter(s => s.status === "in_transit").length}
              </p>
              <p className="text-xs text-gray-500">En Tránsito</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-extrabold text-slate-800">
                {shipments.filter(s => s.status === "delivered").length}
              </p>
              <p className="text-xs text-gray-500">Entregados</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-gray-100 rounded-xl p-1 h-auto mb-4">
            <TabsTrigger value="all" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Todos
            </TabsTrigger>
            <TabsTrigger value="preparing" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Preparando
            </TabsTrigger>
            <TabsTrigger value="in_transit" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Tránsito
            </TabsTrigger>
            <TabsTrigger value="delivered" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Entregados
            </TabsTrigger>
          </TabsList>

          {["all", "preparing", "in_transit", "delivered"].map((tabValue) => (
            <TabsContent key={tabValue} value={tabValue}>
              <ScrollArea className="h-[calc(100vh-400px)]">
                {filterByStatus(tabValue).length === 0 ? (
                  <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                    <CardContent className="p-8 text-center">
                      <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No hay envíos</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filterByStatus(tabValue).map((shipment) => (
                      <Card key={shipment.id} className="rounded-xl" data-testid="shipment-item">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="font-bold">
                                  #{shipment.customer_id}
                                </Badge>
                                <span className="font-bold text-slate-800">{shipment.user_name}</span>
                              </div>
                              <p className="text-sm text-gray-500">
                                {shipment.shipping_type === 'with_family' ? 'Con Familiar USA' : 'Sin Familiar USA'}
                                {' - '}${shipment.shipping_cost.toFixed(2)}
                              </p>
                            </div>
                            {getStatusBadge(shipment.status)}
                          </div>

                          <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                              <p className="text-sm text-gray-600">{shipment.address}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <p className="text-sm text-gray-600">{shipment.phone}</p>
                            </div>
                            {shipment.tracking_number && (
                              <div className="flex items-center gap-2">
                                <Navigation className="h-4 w-4 text-gray-400" />
                                <p className="text-sm font-mono font-bold">{shipment.tracking_number}</p>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {/* Tracking Button */}
                            <Dialog 
                              open={trackingDialogOpen === shipment.id} 
                              onOpenChange={(open) => {
                                setTrackingDialogOpen(open ? shipment.id : null);
                                if (!open) setNewTracking("");
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="flex-1 rounded-lg">
                                  <Edit className="h-4 w-4 mr-1" />
                                  Tracking
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="rounded-2xl">
                                <DialogHeader>
                                  <DialogTitle>Actualizar Tracking</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                  <Input
                                    placeholder="Número de tracking"
                                    value={newTracking}
                                    onChange={(e) => setNewTracking(e.target.value)}
                                    className="h-12 rounded-xl"
                                  />
                                  <Button 
                                    onClick={() => handleUpdateTracking(shipment.id)}
                                    className="w-full h-12 bg-red-600 hover:bg-red-700 rounded-xl"
                                  >
                                    Guardar
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>

                            {/* Status Buttons */}
                            {shipment.status === "preparing" && (
                              <Button 
                                size="sm" 
                                className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg"
                                onClick={() => handleUpdateStatus(shipment.id, "in_transit")}
                              >
                                <Truck className="h-4 w-4 mr-1" />
                                En Tránsito
                              </Button>
                            )}
                            {shipment.status === "in_transit" && (
                              <Button 
                                size="sm" 
                                className="flex-1 bg-green-600 hover:bg-green-700 rounded-lg"
                                onClick={() => handleUpdateStatus(shipment.id, "delivered")}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Entregado
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
