import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, Plus, Trash2, Package } from "lucide-react";

export default function ShipmentEditDialog({
  shipment,
  editDialogOpen,
  setEditDialogOpen,
  editForm,
  setEditForm,
  handleOpenEditDialog,
  handleSaveEdit
}) {
  return (
    <Dialog 
      open={editDialogOpen === shipment.id} 
      onOpenChange={(open) => {
        if (!open) setEditDialogOpen(null);
      }}
    >
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-lg"
          onClick={() => handleOpenEditDialog(shipment)}
          data-testid={`edit-shipment-${shipment.id}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Envío</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label>Tipo de Envío</Label>
            <Select 
              value={editForm.shipping_type}
              onValueChange={(value) => setEditForm({...editForm, shipping_type: value})}
            >
              <SelectTrigger className="h-12 rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="with_family">Con Familiar en USA</SelectItem>
                <SelectItem value="without_family">Sin Familiar en USA</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Costo de Envío (USD)</Label>
            <Input 
              type="number" 
              step="0.01"
              value={editForm.shipping_cost}
              onChange={(e) => setEditForm({...editForm, shipping_cost: e.target.value})}
              onWheel={(e) => e.target.blur()}
              className="h-12 rounded-xl mt-1"
            />
          </div>
          <div>
            <Label>Peso (Libras)</Label>
            <Input 
              type="number" 
              step="0.1"
              placeholder="Ej: 5.5"
              value={editForm.weight_pounds}
              onChange={(e) => setEditForm({...editForm, weight_pounds: e.target.value})}
              onWheel={(e) => e.target.blur()}
              className="h-12 rounded-xl mt-1"
            />
          </div>
          <div>
            <Label>Dirección</Label>
            <Textarea
              value={editForm.address}
              onChange={(e) => setEditForm({...editForm, address: e.target.value})}
              className="rounded-xl mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>País</Label>
              <Input
                value={editForm.country}
                onChange={(e) => setEditForm({...editForm, country: e.target.value})}
                className="h-12 rounded-xl mt-1"
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                className="h-12 rounded-xl mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4" />
              Tracking Numbers ({editForm.tracking_numbers?.length || 0} paquetes)
            </Label>
            <div className="space-y-2">
              {(editForm.tracking_numbers || []).map((tracking, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500 w-6">#{index + 1}</span>
                  <Input
                    value={tracking}
                    onChange={(e) => {
                      const updated = [...(editForm.tracking_numbers || [])];
                      updated[index] = e.target.value;
                      setEditForm({...editForm, tracking_numbers: updated});
                    }}
                    className="h-10 rounded-lg flex-1"
                    placeholder={`Tracking paquete ${index + 1}`}
                  />
                  {(editForm.tracking_numbers?.length || 0) > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = editForm.tracking_numbers.filter((_, i) => i !== index);
                        setEditForm({...editForm, tracking_numbers: updated});
                      }}
                      className="h-10 w-10 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditForm({
                  ...editForm, 
                  tracking_numbers: [...(editForm.tracking_numbers || []), ""]
                })}
                className="w-full h-10 rounded-lg border-dashed"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Paquete
              </Button>
            </div>
          </div>
          <div>
            <Label>Información Adicional</Label>
            <Textarea
              value={editForm.additional_info}
              onChange={(e) => setEditForm({...editForm, additional_info: e.target.value})}
              className="rounded-xl mt-1"
            />
          </div>
          <Button 
            onClick={() => handleSaveEdit(shipment.id)}
            className="w-full h-12 font-bold rounded-xl" 
            style={{ background: '#1E3A5F', color: 'white' }}
          >
            <Save className="h-5 w-5 mr-2" />
            Guardar Cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
