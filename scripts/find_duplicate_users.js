// ============================================
// SCRIPT: Encontrar y Limpiar Usuarios Duplicados
// Ejecutar en MongoDB Shell o Compass
// ============================================

// 1. ENCONTRAR TODOS LOS ADMINS Y SUS EMAILS
print("=== PASO 1: Listando todos los Admins ===");
var admins = db.users.find({ role: "admin" }, { name: 1, email: 1, customer_id: 1, tenant_id: 1 }).toArray();
admins.forEach(function(admin) {
    print("Admin: " + admin.name + " | Email: " + admin.email + " | ID: " + admin.customer_id);
});

// 2. BUSCAR CLIENTES CON EL MISMO EMAIL QUE UN ADMIN
print("\n=== PASO 2: Buscando Clientes Duplicados ===");
var adminEmails = admins.map(function(a) { return a.email; });

var duplicateClients = db.users.find({
    role: "client",
    email: { $in: adminEmails }
}).toArray();

if (duplicateClients.length === 0) {
    print("✅ No se encontraron clientes duplicados");
} else {
    print("⚠️ CLIENTES DUPLICADOS ENCONTRADOS:");
    duplicateClients.forEach(function(client) {
        print("----------------------------------------");
        print("Cliente: " + client.name);
        print("Email: " + client.email);
        print("Customer ID: " + client.customer_id);
        print("WhatsApp: " + client.whatsapp);
        print("User ID: " + client.id);
        print("Tenant ID: " + client.tenant_id);
        print("Creado: " + client.created_at);
    });
}

// 3. OPCIÓN A: Cambiar el email del cliente duplicado (RECOMENDADO)
print("\n=== OPCIÓN A: Cambiar Email del Cliente ===");
print("Ejecuta este comando para cambiar el email del cliente:");
if (duplicateClients.length > 0) {
    duplicateClients.forEach(function(client) {
        print('db.users.updateOne({ id: "' + client.id + '" }, { $set: { email: "cliente_' + client.customer_id.toLowerCase() + '@temporal.com" } });');
    });
}

// 4. OPCIÓN B: Eliminar el cliente duplicado (CUIDADO - puede tener compras asociadas)
print("\n=== OPCIÓN B: Eliminar Cliente (CUIDADO) ===");
print("⚠️ ADVERTENCIA: Verifica primero si el cliente tiene compras o facturas");
if (duplicateClients.length > 0) {
    duplicateClients.forEach(function(client) {
        print("\n-- Para cliente " + client.customer_id + ":");
        print("-- Verificar compras:");
        print('db.purchases.countDocuments({ customer_id: "' + client.customer_id + '" });');
        print("-- Verificar facturas:");
        print('db.invoices.countDocuments({ customer_id: "' + client.customer_id + '" });');
        print("-- Si no tiene datos, eliminar:");
        print('db.users.deleteOne({ id: "' + client.id + '" });');
        print('db.wallets.deleteOne({ user_id: "' + client.id + '" });');
    });
}

print("\n=== FIN DEL SCRIPT ===");
