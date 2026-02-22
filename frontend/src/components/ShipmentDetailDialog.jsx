import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Truck } from "lucide-react";

export function ShipmentDetailDialog({ open, onOpenChange, shipment, products }) {
  if (!shipment) return null;
  
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  
  function getAttUrl(att) {
    return att.startsWith('http') ? att : backendUrl + att;
  }
  
  function isImage(att) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(att);
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Detalle del Envio
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="bg-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Tipo:</span>
              <span className="font-medium">{shipment.shipping_type === 'with_family' ? 'Con Familiar USA' : 'Sin Familiar USA'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Destino:</span>
              <span className="font-medium">{shipment.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Peso:</span>
              <span className="font-bold text-blue-600">{shipment.weight_pounds || 0} lbs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Costo:</span>
              <span className="font-bold text-red-600">${(shipment.shipping_cost || 0).toFixed(2)}</span>
            </div>
            {shipment.tracking_number && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Tracking:</span>
                <span className="font-mono text-sm">{shipment.tracking_number}</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-bold text-slate-800 mb-3">Productos ({products.length})</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {products.map(function(p) {
                return (
                  <div key={p.id} className="bg-gray-50 rounded-lg p-3 flex justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{p.item_name}</p>
                      <p className="text-xs text-gray-500">{p.store || 'Sin tienda'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${(p.total || 0).toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
              {products.length === 0 && (
                <p className="text-center text-gray-400 py-4">Sin productos</p>
              )}
            </div>
          </div>

          {shipment.attachments && shipment.attachments.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 mb-2">Archivos ({shipment.attachments.length})</h4>
              <div className="space-y-2">
                {shipment.attachments.map(function(att, idx) {
                  var url = getAttUrl(att);
                  if (isImage(att)) {
                    return <img key={idx} src={url} alt="Adjunto" className="w-full max-h-32 object-contain bg-gray-50 rounded" />;
                  }
                  return (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50 rounded hover:bg-gray-100">
                      Archivo {idx + 1} - Ver
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
