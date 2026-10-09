import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Edit, Trash2, Save, X, Search } from "lucide-react";

export default function PurchaseItem({
  purchase,
  isEditing,
  editForm,
  setEditForm,
  taxOptions,
  activeClients,
  getEffectiveTaxRate,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete
}) {
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchValue, setClientSearchValue] = useState("");

  if (isEditing) {
    return (
      <Card className="rounded-xl border-blue-200 border-2" data-testid="live-purchase-item-editing">
        <CardContent className="p-3">
          <div className="space-y-2">
            {/* Client selector */}
            <div className="p-2 bg-purple-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Cliente</p>
              <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full h-8 justify-between text-xs rounded">
                    <span className="truncate">
                      {editForm.customer_id ? `#${editForm.customer_id} - ${activeClients.find(c => c.customer_id === editForm.customer_id)?.name || ''}` : "Seleccionar cliente..."}
                    </span>
                    <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0 rounded-xl" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar cliente..."
                      value={clientSearchValue}
                      onValueChange={setClientSearchValue}
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>No encontrado</CommandEmpty>
                      <CommandGroup>
                        {activeClients
                          .filter(c =>
                            clientSearchValue.length === 0 ||
                            c.name.toLowerCase().includes(clientSearchValue.toLowerCase()) ||
                            c.customer_id.toLowerCase().includes(clientSearchValue.toLowerCase())
                          )
                          .slice(0, 10)
                          .map((c) => (
                            <CommandItem
                              key={c.customer_id}
                              value={c.customer_id}
                              onSelect={() => {
                                setEditForm({ ...editForm, customer_id: c.customer_id });
                                setClientSearchOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <span className="font-bold text-red-600">#{c.customer_id}</span>
                              <span className="ml-2">{c.name}</span>
                            </CommandItem>
                          ))
                        }
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <Input value={editForm.item_name} onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
              placeholder="Producto" className="h-9 rounded-lg text-sm" data-testid="edit-item-name" />
            <div className="flex gap-2">
              <Input value={editForm.store} onChange={(e) => setEditForm({ ...editForm, store: e.target.value })}
                placeholder="Tienda" className="h-9 rounded-lg text-sm flex-1" />
              <Input type="number" step="0.01" value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                placeholder="Precio" className="h-9 rounded-lg text-sm w-24" data-testid="edit-price" />
            </div>

            {/* Tax Options */}
            <div className="p-2 bg-blue-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-1">Impuesto</p>
              <div className="flex gap-2 items-center">
                <Select
                  value={editForm.tax_option}
                  onValueChange={(val) => setEditForm({ ...editForm, tax_option: val })}
                >
                  <SelectTrigger className="h-8 rounded text-xs bg-white flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taxOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.tax_option === "other" && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" step="0.01" min="0"
                      value={editForm.custom_tax}
                      onChange={(e) => setEditForm({ ...editForm, custom_tax: e.target.value })}
                      className="w-16 h-8 text-xs text-center rounded"
                    />
                    <span className="text-xs">%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Commission */}
            <div className="p-2 bg-yellow-50 rounded-lg flex items-center justify-between">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={editForm.apply_commission}
                  onChange={(e) => setEditForm({ ...editForm, apply_commission: e.target.checked })}
                  className="w-3 h-3" />
                <span className="font-medium text-gray-700">Comision $</span>
              </label>
              {editForm.apply_commission && (
                <Input type="number" step="0.01" value={editForm.commission}
                  onChange={(e) => setEditForm({ ...editForm, commission: e.target.value })}
                  className="h-7 w-20 text-xs text-center rounded" data-testid="edit-commission" />
              )}
            </div>

            {/* Preview */}
            {editForm.price && (
              <div className="p-2 bg-gray-50 rounded-lg text-xs space-y-1">
                {(() => {
                  const price = parseFloat(editForm.price || 0);
                  const taxRate = getEffectiveTaxRate(editForm.tax_option, editForm.custom_tax);
                  const taxAmount = price * taxRate;
                  const commission = editForm.apply_commission ? parseFloat(editForm.commission || 0) : 0;
                  const total = price + taxAmount + commission;
                  const taxLabel = editForm.tax_option === "other"
                    ? `${editForm.custom_tax || 0}%`
                    : editForm.tax_option === "0" ? "Sin Tax" : `${editForm.tax_option}%`;

                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Precio:</span>
                        <span className="font-medium">${price.toFixed(2)}</span>
                      </div>
                      {taxRate > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tax ({taxLabel}):</span>
                          <span className="font-medium">${taxAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {editForm.apply_commission && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Comision:</span>
                          <span className="font-medium">${commission.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t font-bold text-blue-600">
                        <span>Total:</span>
                        <span>${total.toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={() => onSaveEdit(purchase.id)}
                className="flex-1 h-8 rounded-lg" style={{ background: '#2ECC71', color: 'white' }} data-testid="save-edit-btn">
                <Save className="h-3 w-3 mr-1" /> Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelEdit} className="h-8 rounded-lg">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Display mode
  return (
    <Card className="rounded-xl border-gray-100" data-testid="live-purchase-item">
      <CardContent className="p-3">
        <div>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="font-bold">#{purchase.customer_id}</Badge>
                <span className="text-sm font-medium text-gray-700">
                  {activeClients.find(c => c.customer_id === purchase.customer_id)?.name || ''}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(purchase.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {purchase.entry_source === "live" && (
                  <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 h-4 font-bold" data-testid={`purchase-source-live-${purchase.id}`}>LIVE</Badge>
                )}
              </div>
              <p className="font-medium text-slate-800">{purchase.item_name}</p>
              <p className="text-sm text-gray-500">{purchase.store}</p>
            </div>
            <div className="text-right">
              <p className="font-bold" style={{ color: '#1E3A5F' }}>${purchase.total.toFixed(2)}</p>
              <p className="text-xs text-gray-400">${purchase.price.toFixed(2)} + ${purchase.commission.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
            <Button size="sm" variant="outline" onClick={() => onEdit(purchase)}
              className="h-7 text-xs rounded-lg flex-1" data-testid={`edit-purchase-${purchase.id}`}>
              <Edit className="h-3 w-3 mr-1" /> Editar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(purchase.id)}
              className="h-7 text-xs rounded-lg flex-1 text-red-600 border-red-200 hover:bg-red-50"
              data-testid={`delete-purchase-${purchase.id}`}>
              <Trash2 className="h-3 w-3 mr-1" /> Eliminar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
