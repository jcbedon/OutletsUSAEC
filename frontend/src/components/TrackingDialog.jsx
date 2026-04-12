import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Save, Plus, Trash2, Package } from "lucide-react";

export default function TrackingDialog({
  shipment,
  trackingDialogOpen,
  setTrackingDialogOpen,
  trackingNumbers,
  setTrackingNumbers,
  handleOpenTrackingDialog,
  handleUpdateTracking,
  addTrackingField,
  removeTrackingField,
  updateTrackingField
}) {
  return (
    <Dialog 
      open={trackingDialogOpen === shipment.id} 
      onOpenChange={(open) => {
        if (!open) {
          setTrackingDialogOpen(null);
          setTrackingNumbers([""]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-lg" 
          data-testid={`tracking-btn-${shipment.id}`}
          onClick={() => handleOpenTrackingDialog(shipment)}
        >
          <Edit className="h-4 w-4 mr-1" />
          Tracking ({shipment.tracking_numbers?.length || (shipment.tracking_number ? 1 : 0)})
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Tracking de Paquetes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <p className="text-sm text-gray-600">
            ¿Cuántos paquetes envías? Agrega un tracking por cada paquete.
          </p>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {trackingNumbers.map((tracking, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 w-6">
                  #{index + 1}
                </span>
                <Input
                  placeholder={`Tracking paquete ${index + 1}`}
                  value={tracking}
                  onChange={(e) => updateTrackingField(index, e.target.value)}
                  className="h-10 rounded-lg flex-1"
                  data-testid={`tracking-input-${index}`}
                />
                {trackingNumbers.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTrackingField(index)}
                    className="h-10 w-10 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    data-testid={`remove-tracking-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          
          <Button
            type="button"
            variant="outline"
            onClick={addTrackingField}
            className="w-full h-10 rounded-lg border-dashed"
            data-testid="add-tracking-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar otro paquete
          </Button>
          
          <Button 
            onClick={() => handleUpdateTracking(shipment.id)}
            className="w-full h-12 rounded-xl" 
            style={{ background: '#1E3A5F', color: 'white' }}
            data-testid="save-tracking-btn"
          >
            <Save className="h-4 w-4 mr-2" />
            Guardar {trackingNumbers.filter(t => t.trim()).length} Tracking(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
