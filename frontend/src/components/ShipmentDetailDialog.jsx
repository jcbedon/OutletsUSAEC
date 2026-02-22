import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, ShoppingBag, Paperclip, Eye } from "lucide-react";

export function ShipmentDetailDialog({ open, onOpenChange, shipment, products }) {
  if (!shipment) return null;
  
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Detalle del Envio
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="bg-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Tipo:</span>
              <span className="font-medium">{shipment.shipping_type === 'with_family' ? 'Con Familiar USA' : 'Sin Familiar USA'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Destino:</span>
              <span className="font-medium">{shipment.country}</span>
            </div>
            {shipment.weight_pounds > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Peso:</span>
                <span className="font-bold text-blue-600">{shipment.weight_pounds} lbs</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Costo Envio:</span>
              <span className="font-bold text-red-600">${shipment.shipping_cost?.toFixed(2)}</span>
            </div>
            {shipment.tracking_number && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tracking:</span>
                <span className="font-mono text-sm">{shipment.tracking_number}</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Productos ({products.length})
            </h4>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {products.length > 0 ? products.map((product) => (
                  <div key={product.id} className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-800">{product.item_name}</p>
                      <p className="text-xs text-gray-500">{product.store || 'Sin tienda'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-800">${product.total?.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">
                        ${product.price?.toFixed(2)} + ${product.tax?.toFixed(2)} tax
                      </p>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-gray-400 py-4">Sin productos</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {shipment.attachments && shipment.attachments.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Archivos ({shipment.attachments.length})
              </h4>
              <div className="space-y-2">
                {shipment.attachments.map((att, idx) => {
                  const url = att.startsWith('http') ? att : backendUrl + att;
                  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att);
                  return (
                    <div key={idx} className="border rounded-lg overflow-hidden">
                      {isImg ? (
                        <img src={url} alt={`Adjunto ${idx + 1}`} className="w-full max-h-32 object-contain bg-gray-50" />
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="p-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 block">
                          <span className="text-sm text-gray-600">Archivo {idx + 1}</span>
                          <span className="text-sm text-blue-600 flex items-center gap-1">
                            <Eye className="h-4 w-4" /> Ver
                          </span>
                        </a>
                      )}
                    </div>
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
