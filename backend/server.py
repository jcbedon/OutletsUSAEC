from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Form as FastAPIForm
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import random
import string
import hashlib
import jwt
import shutil

ROOT_DIR = Path(__file__).parent.parent  # /app instead of /app/backend
BACKEND_DIR = Path(__file__).parent  # /app/backend
load_dotenv(BACKEND_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"

# Use backend/uploads for all uploaded files (logos, proofs, etc.)
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="OUTLETS USA EC - SaaS Live Shopping API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DEFAULT_COMMISSION_FEE = 3.0
LOW_BALANCE_THRESHOLD = 9.0
DEFAULT_REFERRAL_BONUS = 5.0
ILLINOIS_TAX_RATE = 0.0825

# ==================== MODELS ====================

class Tenant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_name: str
    slug: str
    owner_name: str
    email: str
    logo_url: Optional[str] = None
    status: str = "active"
    tax_options: List[dict] = Field(default_factory=lambda: [
        {"value": "8.25", "label": "8.25%"},
        {"value": "10", "label": "10%"},
        {"value": "15", "label": "15%"},
        {"value": "0", "label": "Sin Taxes"},
        {"value": "other", "label": "Otro"}
    ])
    tracking_url_template: Optional[str] = None  # URL template with {tracking} placeholder
    # Invoice settings
    invoice_show_tax_per_item: bool = True  # Show tax column in product table
    invoice_show_tax_summary: bool = True   # Show tax total at the bottom
    # Shipment settings  
    shipment_show_product_list: bool = True  # Show product list when creating shipment
    # Client ID settings
    allow_custom_client_id: bool = False  # Allow admin to enter custom client ID instead of auto-generated
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    customer_id: str
    referral_code: str = ""
    referred_by: Optional[str] = None
    referral_count: int = 0
    commission_fee: float = DEFAULT_COMMISSION_FEE
    name: str
    country: str
    whatsapp: str
    email: Optional[str] = None
    whatsapp_consent: bool = False
    password_hash: str
    role: str = "client"
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Wallet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    user_id: str
    customer_id: str
    available: float = 0.0
    reserved: float = 0.0
    pending_adjustment: float = 0.0
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WalletTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    user_id: str
    customer_id: str
    type: str
    amount: float
    balance_after: float
    description: str
    status: str = "pending"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_at: Optional[str] = None
    purchase_id: Optional[str] = None

class Live(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    title: str
    store: Optional[str] = None
    status: str = "inactive"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    total_sales: float = 0.0
    total_commissions: float = 0.0
    purchase_count: int = 0
    # Store invoice fields (for profit calculation)
    store_invoice_amount: Optional[float] = None  # What was actually paid to the store
    store_invoice_image: Optional[str] = None     # URL of the store invoice/receipt image
    store_profit: Optional[float] = None          # Calculated profit: total_sales - store_invoice_amount

class Purchase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    user_id: str
    customer_id: str
    item_name: str
    store: str
    price: float
    tax: float = 0.0
    price_with_tax: float = 0.0
    commission: float = DEFAULT_COMMISSION_FEE
    total: float = 0.0
    status: str = "confirmed"
    live_id: str
    invoice_id: Optional[str] = None  # ID de factura si está facturado
    invoiced_at: Optional[str] = None  # Fecha de facturación
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    customer_id: str
    invoice_number: str  # Número de factura consecutivo
    purchase_ids: List[str]
    subtotal: float
    total_tax: float
    total_commission: float
    total: float
    status: str = "pending"  # pending, approved
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_at: Optional[str] = None
    is_annulled: bool = False
    annulled_at: Optional[str] = None
    annulled_by: Optional[str] = None
    annulled_by_name: Optional[str] = None

class Shipment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    user_id: str
    customer_id: str
    purchase_ids: List[str]
    shipping_type: str
    shipping_cost: float
    weight_pounds: float = 0
    address: str = ""  # Optional - can be empty
    country: str = ""  # Optional
    phone: str = ""    # Optional
    additional_info: Optional[str] = None
    tracking_number: Optional[str] = None  # Legacy single tracking (kept for backwards compatibility)
    tracking_numbers: List[str] = []  # Multiple tracking numbers for multiple packages
    status: str = "preparing"
    attachments: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: Optional[str] = None
    user_id: str
    customer_id: str
    type: str
    title: str
    message: str
    whatsapp_sent: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TemporaryAccessToken(BaseModel):
    """Temporary token for QR code access to client dashboard"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    customer_id: str
    invoice_id: Optional[str] = None
    used: bool = False
    expires_at: str = Field(default_factory=lambda: (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EmployeePermissions(BaseModel):
    """Granular permissions for employees"""
    manage_clients: bool = False       # Crear, editar, eliminar clientes
    manage_purchases: bool = False     # Crear, editar, eliminar compras
    manage_lives: bool = False         # Crear, iniciar, cerrar lives
    approve_recharges: bool = False    # Aprobar/Rechazar recargas
    manage_shipments: bool = False     # Gestionar envíos
    manage_invoices: bool = False      # Generar/Aprobar facturas
    view_reports: bool = False         # Ver reportes
    adjust_wallet: bool = False        # Ajustar saldos de wallet
    view_statistics: bool = False      # Ver estadísticas

class Employee(BaseModel):
    """Employee model with granular permissions"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    email: str
    whatsapp: Optional[str] = None
    password_plain: str  # Stored in plain text so admin can view/change it
    password_hash: str
    permissions: EmployeePermissions = Field(default_factory=EmployeePermissions)
    status: str = "active"  # active, inactive
    created_by: str  # Admin user_id who created this employee
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AuditLog(BaseModel):
    """Audit log for tracking all employee/admin actions"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str  # ID of user who performed action (admin or employee)
    user_name: str  # Name for display
    user_role: str  # "admin" or "employee"
    action: str  # Action type: create_client, delete_purchase, approve_recharge, etc.
    entity_type: str  # Type of affected entity: client, purchase, recharge, etc.
    entity_id: Optional[str] = None  # ID of affected entity
    entity_name: Optional[str] = None  # Name/description of affected entity
    details: Optional[dict] = None  # Additional details about the action
    ip_address: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ==================== REQUEST MODELS ====================

class UserLogin(BaseModel):
    identifier: str
    password: str

class UserRegister(BaseModel):
    tenant_slug: str
    name: str
    country: str
    whatsapp: str
    email: Optional[str] = None
    whatsapp_consent: bool = False
    password: str
    referral_code: Optional[str] = None

class LiveCreate(BaseModel):
    title: str
    store: Optional[str] = None

class PurchaseCreate(BaseModel):
    customer_id: str
    item_name: str
    store: str
    price: float
    live_id: str
    tax_rate: float = 0.0825  # Direct tax rate (0.0825 = 8.25%)
    apply_tax: bool = True
    apply_commission: bool = True
    commission_amount: float = 0

class ShipmentCreate(BaseModel):
    user_id: str
    purchase_ids: List[str]
    shipping_type: str
    shipping_cost: float
    weight_pounds: float = 0
    address: Optional[str] = ""  # Optional - can be empty
    country: Optional[str] = ""  # Optional
    phone: Optional[str] = ""    # Optional
    additional_info: Optional[str] = None
    invoice_id: Optional[str] = None  # Link shipment to invoice

class WalletDepositRequest(BaseModel):
    user_id: str
    amount: float
    description: Optional[str] = "Recarga de saldo"

class CreateTenantRequest(BaseModel):
    business_name: str
    slug: str
    owner_name: Optional[str] = ""
    email: Optional[str] = ""

class CreateAdminRequest(BaseModel):
    name: str
    email: str
    password: str
    whatsapp: str
    country: str

class AdminClientCreate(BaseModel):
    name: str
    country: str
    whatsapp: str
    email: Optional[str] = None
    password: str
    commission_fee: float = DEFAULT_COMMISSION_FEE
    initial_balance: float = 0.0
    custom_customer_id: Optional[str] = None  # Optional custom customer ID

class EmployeeCreate(BaseModel):
    name: str
    email: str
    whatsapp: Optional[str] = None
    password: str
    permissions: dict = {}  # Will be converted to EmployeePermissions

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[dict] = None
    status: Optional[str] = None

# ==================== JWT & AUTH ====================

def create_token(user_id: str, role: str, tenant_id: str = None):
    payload = {
        "user_id": user_id,
        "role": role,
        "tenant_id": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

# ==================== HELPERS ====================

def generate_customer_id(name: str) -> str:
    letter = name[0].upper() if name else 'X'
    digits = ''.join(random.choices(string.digits, k=4))
    return f"{letter}{digits}"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash

async def create_notification(tenant_id: str, user_id: str, customer_id: str, notif_type: str, title: str, message: str):
    notification = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=customer_id,
        type=notif_type,
        title=title,
        message=message
    )
    await db.notifications.insert_one(notification.model_dump())
    return notification

async def check_low_balance(tenant_id: str, user_id: str, customer_id: str, balance: float):
    if balance < LOW_BALANCE_THRESHOLD:
        await create_notification(tenant_id, user_id, customer_id, "low_balance", "Saldo Bajo",
            f"Tu saldo actual es ${balance:.2f} USD. Recarga para seguir comprando.")

async def get_referral_bonus(tenant_id: str):
    settings = await db.settings.find_one({"key": "referral_bonus", "tenant_id": tenant_id}, {"_id": 0})
    if settings:
        return settings.get("value", DEFAULT_REFERRAL_BONUS)
    return DEFAULT_REFERRAL_BONUS

async def process_referral(tenant_id: str, referrer_customer_id: str, new_user_id: str, new_customer_id: str):
    referrer = await db.users.find_one({"customer_id": referrer_customer_id.upper(), "tenant_id": tenant_id}, {"_id": 0})
    if not referrer:
        return False
    bonus = await get_referral_bonus(tenant_id)
    if bonus <= 0:
        return False
    referrer_wallet = await db.wallets.find_one({"user_id": referrer["id"], "tenant_id": tenant_id}, {"_id": 0})
    if referrer_wallet:
        new_balance = referrer_wallet["available"] + bonus
        await db.wallets.update_one({"user_id": referrer["id"], "tenant_id": tenant_id},
            {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
        tx = WalletTransaction(tenant_id=tenant_id, user_id=referrer["id"], customer_id=referrer_customer_id.upper(),
            type="referral_bonus", amount=bonus, balance_after=new_balance,
            description=f"Bono por referir a #{new_customer_id}", status="approved",
            approved_at=datetime.now(timezone.utc).isoformat())
        await db.wallet_transactions.insert_one(tx.model_dump())
        await create_notification(tenant_id, referrer["id"], referrer_customer_id.upper(), "referral_bonus",
            "Bono de Referido!", f"Recibiste ${bonus:.2f} USD por referir a un nuevo cliente.")
        await db.users.update_one({"id": referrer["id"]}, {"$inc": {"referral_count": 1}})
    new_wallet = await db.wallets.find_one({"user_id": new_user_id, "tenant_id": tenant_id}, {"_id": 0})
    if new_wallet:
        new_balance = new_wallet["available"] + bonus
        await db.wallets.update_one({"user_id": new_user_id, "tenant_id": tenant_id},
            {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
        tx = WalletTransaction(tenant_id=tenant_id, user_id=new_user_id, customer_id=new_customer_id,
            type="referral_bonus", amount=bonus, balance_after=new_balance,
            description=f"Bono de bienvenida por código de #{referrer_customer_id.upper()}", status="approved",
            approved_at=datetime.now(timezone.utc).isoformat())
        await db.wallet_transactions.insert_one(tx.model_dump())
        await create_notification(tenant_id, new_user_id, new_customer_id, "referral_bonus",
            "Bono de Bienvenida!", f"Recibiste ${bonus:.2f} USD por usar un código de referido.")
    return True

# ==================== AUDIT LOG HELPER ====================

async def log_audit_action(
    tenant_id: str,
    user_id: str,
    user_name: str,
    user_role: str,
    action: str,
    entity_type: str,
    entity_id: str = None,
    entity_name: str = None,
    details: dict = None
):
    """Log an action to the audit trail"""
    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        user_name=user_name,
        user_role=user_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=details
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

async def check_employee_permission(user_id: str, permission: str) -> bool:
    """Check if an employee has a specific permission"""
    employee = await db.employees.find_one({"id": user_id}, {"_id": 0})
    if not employee:
        return False
    return employee.get("permissions", {}).get(permission, False)

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register_user(data: UserRegister):
    tenant = await db.tenants.find_one({"slug": data.tenant_slug.lower(), "status": "active"}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Código de negocio no encontrado")
    tenant_id = tenant["id"]
    
    # Check if email belongs to an admin, superadmin or employee (PREVENT COLLISION)
    if data.email:
        existing_admin = await db.users.find_one({
            "email": data.email, 
            "role": {"$in": ["admin", "superadmin"]}
        }, {"_id": 0})
        if existing_admin:
            raise HTTPException(status_code=400, detail="Este email ya está registrado. Por favor use otro email.")
        existing_employee = await db.employees.find_one({"email": data.email}, {"_id": 0})
        if existing_employee:
            raise HTTPException(status_code=400, detail="Este email ya está registrado. Por favor use otro email.")
    
    existing = await db.users.find_one({
        "tenant_id": tenant_id,
        "$or": [{"whatsapp": data.whatsapp}, {"email": data.email} if data.email else {"_id": None}]
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Usuario ya registrado con este WhatsApp o email")
    referred_by = None
    if data.referral_code:
        referrer = await db.users.find_one({"customer_id": data.referral_code.upper(), "tenant_id": tenant_id}, {"_id": 0})
        if referrer:
            referred_by = data.referral_code.upper()
    customer_id = generate_customer_id(data.name)
    while await db.users.find_one({"customer_id": customer_id, "tenant_id": tenant_id}, {"_id": 0}):
        customer_id = generate_customer_id(data.name)
    user = User(tenant_id=tenant_id, customer_id=customer_id, referral_code=customer_id, referred_by=referred_by,
        name=data.name, country=data.country, whatsapp=data.whatsapp, email=data.email,
        whatsapp_consent=data.whatsapp_consent, password_hash=hash_password(data.password), role="client")
    await db.users.insert_one(user.model_dump())
    wallet = Wallet(tenant_id=tenant_id, user_id=user.id, customer_id=customer_id)
    await db.wallets.insert_one(wallet.model_dump())
    await create_notification(tenant_id, user.id, customer_id, "welcome", "Bienvenido!",
        f"Tu ID de cliente es #{customer_id}. Usa este ID para tus compras en vivo.")
    if referred_by:
        await process_referral(tenant_id, referred_by, user.id, customer_id)
    token = create_token(user.id, "client", tenant_id)
    return {
        "message": "Usuario registrado exitosamente",
        "token": token,
        "user_id": user.id,
        "customer_id": customer_id,
        "name": user.name,
        "role": "client",
        "tenant_id": tenant_id,
        "tenant_name": tenant["business_name"],
        "tenant_logo": tenant.get("logo_url")
    }

@api_router.post("/auth/login")
async def login_user(login_data: UserLogin):
    identifier = login_data.identifier.strip()
    identifier_lower = identifier.lower()
    
    # FIRST: Always check if identifier is a tenant slug - HIGHEST PRIORITY
    admin_from_slug = None
    tenant_by_slug = await db.tenants.find_one({"slug": identifier_lower}, {"_id": 0})
    if tenant_by_slug:
        admin_from_slug = await db.users.find_one({
            "tenant_id": tenant_by_slug["id"],
            "role": "admin"
        }, {"_id": 0})
        
        # If found admin from tenant slug and password matches, login immediately
        if admin_from_slug and verify_password(login_data.password, admin_from_slug["password_hash"]):
            tenant_id = admin_from_slug.get("tenant_id")
            tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
            tenant_name = tenant["business_name"] if tenant else None
            tenant_logo = tenant.get("logo_url") if tenant else None
            
            if tenant and tenant.get("status") != "active":
                raise HTTPException(status_code=403, detail="Tu negocio está suspendido. Contacta al administrador.")
            
            # Log admin login for audit
            await log_audit_action(
                tenant_id=tenant_id,
                user_id=admin_from_slug["id"],
                user_name=admin_from_slug["name"],
                user_role="admin",
                action="login",
                entity_type="session",
                entity_name="Inicio de sesión"
            )
            
            token = create_token(admin_from_slug["id"], admin_from_slug["role"], tenant_id)
            return {
                "message": "Login exitoso",
                "token": token,
                "user_id": admin_from_slug["id"],
                "customer_id": admin_from_slug.get("customer_id"),
                "name": admin_from_slug["name"],
                "role": admin_from_slug["role"],
                "tenant_id": tenant_id,
                "tenant_name": tenant_name,
                "tenant_logo": tenant_logo,
                "email": admin_from_slug.get("email")
            }
    
    # Search in both collections simultaneously
    # 1. Search in users collection (admins, clients, superadmins)
    users_found = await db.users.find({
        "$or": [
            {"email": identifier},
            {"whatsapp": identifier},
            {"customer_id": identifier.upper()}
        ]
    }, {"_id": 0}).to_list(10)
    
    # 2. Search in employees collection
    employee = await db.employees.find_one({
        "$or": [
            {"email": identifier},
            {"whatsapp": identifier}
        ]
    }, {"_id": 0})
    
    # Sort users by role priority: superadmin > admin > client
    user = None
    role_priority = {"superadmin": 0, "admin": 1, "client": 2}
    if users_found:
        users_found.sort(key=lambda u: role_priority.get(u.get("role", "client"), 3))
        user = users_found[0]
    
    # PRIORITY: superadmin/admin FIRST, then employee, then client
    # Check if we have an admin-level user - they take priority over employee
    admin_user = None
    if user and user.get("role") in ["superadmin", "admin"]:
        admin_user = user
    
    # If admin exists and password matches, use admin login (skip employee)
    if admin_user and verify_password(login_data.password, admin_user["password_hash"]):
        tenant_id = admin_user.get("tenant_id")
        tenant_name = None
        tenant_logo = None
        if tenant_id:
            tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
            if tenant:
                if tenant.get("status") != "active":
                    raise HTTPException(status_code=403, detail="Tu negocio está suspendido. Contacta al administrador.")
                tenant_name = tenant["business_name"]
                tenant_logo = tenant.get("logo_url")
        
        # Log admin login for audit
        if admin_user["role"] == "admin":
            await log_audit_action(
                tenant_id=tenant_id,
                user_id=admin_user["id"],
                user_name=admin_user["name"],
                user_role="admin",
                action="login",
                entity_type="session",
                entity_name="Inicio de sesión"
            )
        
        token = create_token(admin_user["id"], admin_user["role"], tenant_id)
        return {
            "message": "Login exitoso",
            "token": token,
            "user_id": admin_user["id"],
            "customer_id": admin_user.get("customer_id"),
            "name": admin_user["name"],
            "role": admin_user["role"],
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "tenant_logo": tenant_logo,
            "email": admin_user.get("email")
        }
    
    # Try employee login second (after admin check)
    if employee:
        if verify_password(login_data.password, employee["password_hash"]):
            if employee.get("status") != "active":
                raise HTTPException(status_code=403, detail="Tu cuenta está inactiva. Contacta al administrador.")
            
            tenant_id = employee["tenant_id"]
            tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
            if not tenant or tenant.get("status") != "active":
                raise HTTPException(status_code=403, detail="El negocio está suspendido.")
            
            # Log employee login
            await log_audit_action(
                tenant_id=tenant_id,
                user_id=employee["id"],
                user_name=employee["name"],
                user_role="employee",
                action="login",
                entity_type="session",
                entity_name="Inicio de sesión"
            )
            
            token = create_token(employee["id"], "employee", tenant_id)
            return {
                "message": "Login exitoso",
                "token": token,
                "user_id": employee["id"],
                "customer_id": None,
                "name": employee["name"],
                "role": "employee",
                "tenant_id": tenant_id,
                "tenant_name": tenant["business_name"],
                "tenant_logo": tenant.get("logo_url"),
                "permissions": employee.get("permissions", {})
            }
    
    # Try user login for CLIENT only (admin/superadmin already handled above)
    if user and user.get("role") == "client" and verify_password(login_data.password, user["password_hash"]):
        tenant_id = user.get("tenant_id")
        tenant_name = None
        tenant_logo = None
        if tenant_id:
            tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
            if tenant:
                if tenant.get("status") != "active":
                    raise HTTPException(status_code=403, detail="Tu negocio está suspendido. Contacta al administrador.")
                tenant_name = tenant["business_name"]
                tenant_logo = tenant.get("logo_url")
        
        token = create_token(user["id"], user["role"], tenant_id)
        return {
            "message": "Login exitoso",
            "token": token,
            "user_id": user["id"],
            "customer_id": user["customer_id"],
            "name": user["name"],
            "role": user["role"],
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "tenant_logo": tenant_logo
        }
    
    # No valid credentials found
    raise HTTPException(status_code=401, detail="Credenciales inválidas")

@api_router.get("/auth/user/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    query = {"id": user_id}
    if current_user["role"] != "superadmin":
        query["tenant_id"] = current_user["tenant_id"]
    user = await db.users.find_one(query, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

# ==================== SUPERADMIN ENDPOINTS ====================

@api_router.post("/superadmin/seed")
async def seed_superadmin():
    existing = await db.users.find_one({"role": "superadmin"}, {"_id": 0})
    if existing:
        return {"message": "Superadmin ya existe", "email": existing.get("email")}
    sa = User(
        customer_id="SA0001",
        referral_code="SA0001",
        name="Super Administrador",
        country="Global",
        whatsapp="+0000000000",
        email="superadmin@outletsusaec.com",
        password_hash=hash_password("super123"),
        role="superadmin"
    )
    await db.users.insert_one(sa.model_dump())
    return {"message": "Superadmin creado", "email": "superadmin@outletsusaec.com", "password": "super123"}

@api_router.get("/superadmin/tenants")
async def list_tenants(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    result = []
    for t in tenants:
        admin_count = await db.users.count_documents({"tenant_id": t["id"], "role": "admin"})
        client_count = await db.users.count_documents({"tenant_id": t["id"], "role": "client"})
        result.append({**t, "admin_count": admin_count, "client_count": client_count})
    return result

@api_router.post("/superadmin/tenants")
async def create_tenant(data: CreateTenantRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    slug = data.slug.lower().strip().replace(" ", "-")
    existing = await db.tenants.find_one({"slug": slug}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Este slug ya está en uso")
    
    tenant = Tenant(
        business_name=data.business_name, 
        slug=slug, 
        owner_name=data.owner_name or "", 
        email=data.email or ""
    )
    await db.tenants.insert_one(tenant.model_dump())
    
    # Create a default admin user for this tenant
    admin_name = data.owner_name or "Administrador"
    admin_email = f"admin@{slug}.com"
    customer_id = generate_customer_id(admin_name)
    while await db.users.find_one({"customer_id": customer_id}, {"_id": 0}):
        customer_id = generate_customer_id(admin_name)
    
    # Check if email already exists, if so, append a number
    base_email = admin_email
    counter = 1
    while await db.users.find_one({"email": admin_email}, {"_id": 0}):
        admin_email = f"admin{counter}@{slug}.com"
        counter += 1
    
    admin = User(
        tenant_id=tenant.id, 
        customer_id=customer_id, 
        referral_code=customer_id,
        name=admin_name, 
        country="", 
        whatsapp="",
        email=admin_email, 
        password_hash=hash_password("temp123456"),  # Temporary password
        role="admin"
    )
    await db.users.insert_one(admin.model_dump())
    
    return {
        "message": "Tenant creado exitosamente",
        "tenant_id": tenant.id,
        "tenant_slug": slug,
        "admin_id": admin.id,
        "admin_email": admin_email,
        "note": "Usa el botón 'Password' para establecer la contraseña del admin"
    }

@api_router.put("/superadmin/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, status: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    if status not in ["active", "suspended"]:
        raise HTTPException(status_code=400, detail="Estado inválido")
    result = await db.tenants.update_one({"id": tenant_id}, {"$set": {"status": status}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return {"message": f"Tenant actualizado a {status}"}

@api_router.put("/superadmin/tenants/{tenant_id}/tax-options")
async def update_tenant_tax_options_superadmin(tenant_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Superadmin endpoint to update tax options for a specific tenant"""
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    tax_options = data.get("tax_options", [])
    if not tax_options:
        raise HTTPException(status_code=400, detail="Se requieren opciones de impuestos")
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"tax_options": tax_options}})
    return {"message": "Opciones de impuestos actualizadas para el tenant", "tax_options": tax_options}

@api_router.get("/superadmin/tenants/{tenant_id}/details")
async def get_tenant_details(tenant_id: str, current_user: dict = Depends(get_current_user)):
    """Get full tenant details including tax options"""
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    default_tax_options = [
        {"value": "8.25", "label": "8.25%"},
        {"value": "10", "label": "10%"},
        {"value": "15", "label": "15%"},
        {"value": "0", "label": "Sin Taxes"},
        {"value": "other", "label": "Otro"}
    ]
    tenant["tax_options"] = tenant.get("tax_options", default_tax_options)
    return tenant

@api_router.put("/superadmin/tenants/{tenant_id}/tracking-url")
async def update_tenant_tracking_url(tenant_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update the tracking URL template for a tenant"""
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    
    tracking_url = data.get("tracking_url_template", "")
    await db.tenants.update_one(
        {"id": tenant_id},
        {"$set": {"tracking_url_template": tracking_url}}
    )
    return {"message": "URL de tracking actualizado", "tracking_url_template": tracking_url}

@api_router.post("/superadmin/tenants/{tenant_id}/admin")
async def create_admin_for_tenant(tenant_id: str, data: CreateAdminRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")
    customer_id = generate_customer_id(data.name)
    while await db.users.find_one({"customer_id": customer_id}, {"_id": 0}):
        customer_id = generate_customer_id(data.name)
    admin = User(tenant_id=tenant_id, customer_id=customer_id, referral_code=customer_id,
        name=data.name, country=data.country, whatsapp=data.whatsapp, email=data.email,
        password_hash=hash_password(data.password), role="admin")
    await db.users.insert_one(admin.model_dump())
    return {"message": "Admin creado", "admin_id": admin.id, "customer_id": customer_id}

@api_router.put("/superadmin/tenants/{tenant_id}/reset-password")
async def reset_tenant_admin_password(tenant_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Reset the admin password for a tenant"""
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    
    new_password = data.get("new_password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    
    # Find the admin of this tenant
    admin = await db.users.find_one({"tenant_id": tenant_id, "role": "admin"}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin no encontrado para este tenant")
    
    # Update password
    hashed = hash_password(new_password)
    await db.users.update_one(
        {"id": admin["id"]},
        {"$set": {"password_hash": hashed, "password_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Contraseña actualizada exitosamente", "admin_email": admin["email"]}

@api_router.get("/superadmin/tenants/{tenant_id}/admin-info")
async def get_tenant_admin_info(tenant_id: str, current_user: dict = Depends(get_current_user)):
    """Get admin info for a tenant including last password update"""
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    
    admin = await db.users.find_one({"tenant_id": tenant_id, "role": "admin"}, {"_id": 0, "password_hash": 0})
    if not admin:
        return {"has_admin": False}
    
    return {
        "has_admin": True,
        "admin_id": admin["id"],
        "admin_name": admin["name"],
        "admin_email": admin["email"],
        "admin_whatsapp": admin.get("whatsapp", ""),
        "password_updated_at": admin.get("password_updated_at"),
        "created_at": admin.get("created_at")
    }

@api_router.put("/superadmin/tenants/{tenant_id}/settings")
async def update_tenant_settings(tenant_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update tenant invoice and shipment settings"""
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    
    # Prepare update fields
    update_fields = {}
    
    # Invoice settings
    if "invoice_show_tax_per_item" in data:
        update_fields["invoice_show_tax_per_item"] = bool(data["invoice_show_tax_per_item"])
    if "invoice_show_tax_summary" in data:
        update_fields["invoice_show_tax_summary"] = bool(data["invoice_show_tax_summary"])
    
    # Shipment settings
    if "shipment_show_product_list" in data:
        update_fields["shipment_show_product_list"] = bool(data["shipment_show_product_list"])
    
    # Client ID settings
    if "allow_custom_client_id" in data:
        update_fields["allow_custom_client_id"] = bool(data["allow_custom_client_id"])
    
    if update_fields:
        await db.tenants.update_one({"id": tenant_id}, {"$set": update_fields})
    
    # Return updated tenant
    updated_tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return updated_tenant

@api_router.get("/superadmin/stats")
async def get_superadmin_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant_count = await db.tenants.count_documents({})
    active_tenants = await db.tenants.count_documents({"status": "active"})
    total_admins = await db.users.count_documents({"role": "admin"})
    total_clients = await db.users.count_documents({"role": "client"})
    return {
        "tenant_count": tenant_count,
        "active_tenants": active_tenants,
        "total_admins": total_admins,
        "total_clients": total_clients
    }

# ==================== ADMIN TENANT ENDPOINTS ====================

@api_router.get("/admin/tenant")
async def get_my_tenant(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant = await db.tenants.find_one({"id": current_user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return tenant

@api_router.post("/admin/tenant/logo")
async def upload_tenant_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant_id = current_user["tenant_id"]
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    filename = f"{tenant_id}_logo.{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    logo_url = f"/api/uploads/{filename}"
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"logo_url": logo_url}})
    return {"logo_url": logo_url}

# ==================== ADMIN CLIENT ENDPOINTS ====================

@api_router.get("/admin/clients")
async def get_all_clients(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Build query based on status filter
    query = {"role": "client", "tenant_id": tid}
    if status == "active":
        query["$or"] = [{"is_active": True}, {"is_active": {"$exists": False}}]
    elif status == "inactive":
        query["is_active"] = False
    
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    
    if not users:
        return []
    
    # Batch fetch all related data in 3 queries instead of N*3
    user_ids = [u["id"] for u in users]
    
    # Fetch all wallets at once
    wallets_list = await db.wallets.find({"user_id": {"$in": user_ids}, "tenant_id": tid}, {"_id": 0}).to_list(len(user_ids))
    wallets_dict = {w["user_id"]: w for w in wallets_list}
    
    # Aggregate purchases per user
    purchases_agg = await db.purchases.aggregate([
        {"$match": {"user_id": {"$in": user_ids}, "tenant_id": tid}},
        {"$group": {"_id": "$user_id", "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
    ]).to_list(len(user_ids))
    purchases_dict = {p["_id"]: {"total": p["total"], "count": p["count"]} for p in purchases_agg}
    
    # Aggregate shipments per user
    shipments_agg = await db.shipments.aggregate([
        {"$match": {"user_id": {"$in": user_ids}, "tenant_id": tid}},
        {"$group": {"_id": "$user_id", "total_shipping": {"$sum": "$shipping_cost"}}}
    ]).to_list(len(user_ids))
    shipments_dict = {s["_id"]: s["total_shipping"] for s in shipments_agg}
    
    # Aggregate PENDING purchases (no invoice_id) per user - for "compras pendientes de facturar"
    pending_purchases_agg = await db.purchases.aggregate([
        {"$match": {
            "user_id": {"$in": user_ids}, 
            "tenant_id": tid,
            "$or": [
                {"invoice_id": None},
                {"invoice_id": {"$exists": False}}
            ]
        }},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}}
    ]).to_list(len(user_ids))
    pending_purchases_dict = {p["_id"]: p["count"] for p in pending_purchases_agg}
    
    result = []
    for user in users:
        uid = user["id"]
        wallet = wallets_dict.get(uid)
        wallet_balance = wallet["available"] if wallet else 0
        purch = purchases_dict.get(uid, {"total": 0, "count": 0})
        total_shipping = shipments_dict.get(uid, 0)
        pending_balance = wallet_balance - total_shipping
        pending_to_invoice = pending_purchases_dict.get(uid, 0)
        result.append({
            **user, 
            "wallet_balance": round(wallet_balance, 2),
            "total_purchases": round(purch["total"], 2),
            "total_shipping": round(total_shipping, 2),
            "pending_balance": round(pending_balance, 2),
            "purchase_count": purch["count"],
            "is_active": user.get("is_active", True),
            "pending_to_invoice": pending_to_invoice  # Compras pendientes de facturar
        })
    return result

@api_router.post("/admin/clients/create")
async def admin_create_client(data: AdminClientCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get tenant settings to check if custom client ID is allowed
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    allow_custom_id = tenant.get("allow_custom_client_id", False) if tenant else False
    
    # Check for existing client with same WhatsApp
    existing_whatsapp = await db.users.find_one({"whatsapp": data.whatsapp, "tenant_id": tid, "role": "client"}, {"_id": 0})
    if existing_whatsapp:
        raise HTTPException(status_code=400, detail=f"Ya existe un cliente con este WhatsApp: {existing_whatsapp['name']} ({existing_whatsapp['customer_id']})")
    
    # Check for existing client with same email
    if data.email:
        existing_email = await db.users.find_one({"email": data.email, "tenant_id": tid, "role": "client"}, {"_id": 0})
        if existing_email:
            raise HTTPException(status_code=400, detail=f"Ya existe un cliente con este email: {existing_email['name']} ({existing_email['customer_id']})")
        # Also check if email belongs to an admin or employee (prevent admin/client collision)
        existing_admin = await db.users.find_one({"email": data.email, "tenant_id": tid, "role": {"$in": ["admin", "superadmin"]}}, {"_id": 0})
        if existing_admin:
            raise HTTPException(status_code=400, detail=f"Este email ya está registrado como administrador. Use un email diferente para el cliente.")
        existing_employee = await db.employees.find_one({"email": data.email, "tenant_id": tid}, {"_id": 0})
        if existing_employee:
            raise HTTPException(status_code=400, detail=f"Este email ya está registrado como empleado. Use un email diferente para el cliente.")
    
    # Determine customer_id
    if data.custom_customer_id and allow_custom_id:
        # Validate custom ID format (alphanumeric, 3-20 chars)
        custom_id = data.custom_customer_id.strip().upper()
        if not custom_id or len(custom_id) < 2 or len(custom_id) > 20:
            raise HTTPException(status_code=400, detail="El código de cliente debe tener entre 2 y 20 caracteres")
        if not custom_id.replace("-", "").replace("_", "").isalnum():
            raise HTTPException(status_code=400, detail="El código de cliente solo puede contener letras, números, guiones y guiones bajos")
        # Check if custom ID already exists
        existing_id = await db.users.find_one({"customer_id": custom_id, "tenant_id": tid}, {"_id": 0})
        if existing_id:
            raise HTTPException(status_code=400, detail=f"Ya existe un cliente con este código: {existing_id['name']} ({custom_id})")
        customer_id = custom_id
    else:
        # Generate automatic customer_id
        customer_id = generate_customer_id(data.name)
        while await db.users.find_one({"customer_id": customer_id, "tenant_id": tid}, {"_id": 0}):
            customer_id = generate_customer_id(data.name)
    
    user = User(tenant_id=tid, customer_id=customer_id, referral_code=customer_id,
        commission_fee=data.commission_fee, name=data.name, country=data.country,
        whatsapp=data.whatsapp, email=data.email, whatsapp_consent=True,
        password_hash=hash_password(data.password), role="client", is_active=True)
    await db.users.insert_one(user.model_dump())
    wallet = Wallet(tenant_id=tid, user_id=user.id, customer_id=customer_id, available=data.initial_balance)
    await db.wallets.insert_one(wallet.model_dump())
    if data.initial_balance > 0:
        tx = WalletTransaction(tenant_id=tid, user_id=user.id, customer_id=customer_id,
            type="deposit", amount=data.initial_balance, balance_after=data.initial_balance,
            description="Saldo inicial (Admin)", status="approved",
            approved_at=datetime.now(timezone.utc).isoformat())
        await db.wallet_transactions.insert_one(tx.model_dump())
    return {"message": "Cliente creado exitosamente", "user_id": user.id, "customer_id": customer_id,
        "commission_fee": data.commission_fee, "initial_balance": data.initial_balance}

@api_router.post("/admin/clients/check-duplicate")
async def check_client_duplicate(data: dict, current_user: dict = Depends(get_current_user)):
    """Check if a similar client already exists"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    duplicates = []
    
    # Check by WhatsApp
    if data.get("whatsapp"):
        existing = await db.users.find_one(
            {"whatsapp": data["whatsapp"], "tenant_id": tid, "role": "client"}, 
            {"_id": 0, "password_hash": 0}
        )
        if existing:
            duplicates.append({"field": "whatsapp", "client": existing})
    
    # Check by email
    if data.get("email"):
        existing = await db.users.find_one(
            {"email": data["email"], "tenant_id": tid, "role": "client"}, 
            {"_id": 0, "password_hash": 0}
        )
        if existing:
            duplicates.append({"field": "email", "client": existing})
    
    # Check by similar name (case insensitive)
    if data.get("name"):
        name_lower = data["name"].lower().strip()
        all_clients = await db.users.find(
            {"tenant_id": tid, "role": "client"}, 
            {"_id": 0, "password_hash": 0}
        ).to_list(1000)
        for client in all_clients:
            if client["name"].lower().strip() == name_lower:
                duplicates.append({"field": "name", "client": client})
                break
    
    return {"has_duplicates": len(duplicates) > 0, "duplicates": duplicates}

@api_router.put("/admin/clients/{user_id}/toggle-status")
async def toggle_client_status(user_id: str, current_user: dict = Depends(get_current_user)):
    """Enable/disable a client"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    client = await db.users.find_one({"id": user_id, "tenant_id": tid, "role": "client"}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    new_status = not client.get("is_active", True)
    await db.users.update_one(
        {"id": user_id, "tenant_id": tid},
        {"$set": {"is_active": new_status}}
    )
    
    status_text = "habilitado" if new_status else "inhabilitado"
    return {"message": f"Cliente {status_text} exitosamente", "is_active": new_status}

@api_router.delete("/admin/clients/{user_id}")
async def delete_client(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a client - ONLY admin can delete, not employees"""
    # Only admin can delete clients, NOT employees
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo el administrador puede eliminar clientes")
    tid = current_user["tenant_id"]
    
    client = await db.users.find_one({"id": user_id, "tenant_id": tid, "role": "client"}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    # Only allow deletion of inactive clients
    if client.get("is_active", True):
        raise HTTPException(status_code=400, detail="Solo puedes eliminar clientes inhabilitados. Primero inhabilita al cliente.")
    
    # Delete client and related data
    await db.users.delete_one({"id": user_id, "tenant_id": tid})
    await db.wallets.delete_one({"user_id": user_id, "tenant_id": tid})
    await db.wallet_transactions.delete_many({"user_id": user_id, "tenant_id": tid})
    # Note: Purchases and shipments are kept for historical records
    
    return {"message": "Cliente eliminado exitosamente", "deleted_id": user_id}

@api_router.get("/admin/clients/active")
async def get_active_clients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    wallets = await db.wallets.find({"available": {"$gt": 0}, "tenant_id": tid}, {"_id": 0}).to_list(1000)
    result = []
    for wallet in wallets:
        user = await db.users.find_one({"id": wallet["user_id"], "tenant_id": tid}, {"_id": 0, "password_hash": 0})
        if user:
            result.append({**user, "wallet_balance": wallet["available"]})
    return sorted(result, key=lambda x: x["wallet_balance"], reverse=True)

@api_router.put("/admin/clients/{user_id}/commission")
async def update_client_commission(user_id: str, commission_fee: float, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if commission_fee < 0:
        raise HTTPException(status_code=400, detail="La comisión no puede ser negativa")
    result = await db.users.update_one({"id": user_id, "tenant_id": current_user["tenant_id"]},
        {"$set": {"commission_fee": commission_fee}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"message": f"Comisión actualizada a ${commission_fee:.2f}", "commission_fee": commission_fee}

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    whatsapp: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    new_password: Optional[str] = None
    commission_fee: Optional[float] = None

@api_router.put("/admin/clients/{user_id}")
async def update_client(user_id: str, data: ClientUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    updates = {}
    if data.name:
        updates["name"] = data.name
    if data.whatsapp:
        updates["whatsapp"] = data.whatsapp
    if data.country:
        updates["country"] = data.country
    if data.email is not None:
        updates["email"] = data.email
    if data.commission_fee is not None and data.commission_fee >= 0:
        updates["commission_fee"] = data.commission_fee
    if data.new_password:
        updates["password_hash"] = hash_password(data.new_password)
    
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": user_id, "tenant_id": tid}, {"$set": updates})
    
    updated_user = await db.users.find_one({"id": user_id, "tenant_id": tid}, {"_id": 0, "password_hash": 0})
    return {"message": "Cliente actualizado exitosamente", "user": updated_user}

@api_router.get("/admin/clients/{customer_id}/info")
async def get_client_info(customer_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    user = await db.users.find_one({"customer_id": customer_id.upper(), "tenant_id": tid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    wallet = await db.wallets.find_one({"user_id": user["id"], "tenant_id": tid}, {"_id": 0})
    return {**user, "wallet_balance": wallet["available"] if wallet else 0,
        "commission_fee": user.get("commission_fee", DEFAULT_COMMISSION_FEE)}

# ==================== WALLET ENDPOINTS ====================

@api_router.get("/wallet/pending-deposits")
async def get_pending_deposits(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    transactions = await db.wallet_transactions.find({"type": "deposit", "status": "pending", "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    result = []
    for t in transactions:
        user = await db.users.find_one({"id": t["user_id"]}, {"_id": 0, "name": 1, "customer_id": 1})
        result.append({**t, "user_name": user["name"] if user else "Unknown"})
    return result

@api_router.get("/wallet/all-deposits")
async def get_all_deposits(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    transactions = await db.wallet_transactions.find(
        {"type": "deposit", "tenant_id": tid}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    result = []
    for t in transactions:
        user = await db.users.find_one({"id": t["user_id"]}, {"_id": 0, "name": 1, "customer_id": 1})
        result.append({**t, "user_name": user["name"] if user else "Unknown"})
    return result

@api_router.get("/wallet/by-customer/{customer_id}")
async def get_wallet_by_customer_id(customer_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    wallet = await db.wallets.find_one({"customer_id": customer_id.upper(), "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    return wallet

@api_router.get("/wallet/recharge-report")
async def get_recharge_report(current_user: dict = Depends(get_current_user)):
    """
    Get a report of all recharges comparing admin-created vs client-requested deposits.
    """
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get all deposit transactions
    deposits = await db.wallet_transactions.find(
        {"tenant_id": tid, "type": "deposit"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Get users for names
    user_ids = list(set(d["user_id"] for d in deposits))
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "customer_id": 1}).to_list(None)
    users_dict = {u["id"]: u for u in users}
    
    # Categorize and enrich with user info
    admin_created = []
    client_requested = []
    
    totals = {
        "admin_created": {"count": 0, "total": 0, "approved": 0, "pending": 0},
        "client_requested": {"count": 0, "total": 0, "approved": 0, "pending": 0, "rejected": 0}
    }
    
    for dep in deposits:
        user = users_dict.get(dep["user_id"], {})
        dep["user_name"] = user.get("name", "Desconocido")
        dep["user_customer_id"] = user.get("customer_id", "N/A")
        
        if dep.get("created_by_admin"):
            admin_created.append(dep)
            totals["admin_created"]["count"] += 1
            totals["admin_created"]["total"] += dep["amount"]
            if dep["status"] == "approved":
                totals["admin_created"]["approved"] += 1
        else:
            client_requested.append(dep)
            totals["client_requested"]["count"] += 1
            totals["client_requested"]["total"] += dep["amount"]
            if dep["status"] == "approved":
                totals["client_requested"]["approved"] += 1
            elif dep["status"] == "pending":
                totals["client_requested"]["pending"] += 1
            elif dep["status"] == "rejected":
                totals["client_requested"]["rejected"] += 1
    
    return {
        "admin_created": admin_created,
        "client_requested": client_requested,
        "totals": totals
    }

@api_router.get("/wallet/transactions/{user_id}")
async def get_wallet_transactions(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    transactions = await db.wallet_transactions.find({"user_id": user_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return transactions

@api_router.get("/wallet/{user_id}")
async def get_wallet(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    wallet = await db.wallets.find_one({"user_id": user_id, "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    return wallet

@api_router.post("/wallet/deposit-request")
async def request_deposit(deposit: WalletDepositRequest, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    wallet = await db.wallets.find_one({"user_id": deposit.user_id, "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    transaction = WalletTransaction(tenant_id=tid, user_id=deposit.user_id, customer_id=wallet["customer_id"],
        type="deposit", amount=deposit.amount, balance_after=wallet["available"],
        description=deposit.description, status="pending")
    await db.wallet_transactions.insert_one(transaction.model_dump())
    return {"message": "Solicitud de recarga enviada. Pendiente de aprobación.", "transaction_id": transaction.id}

@api_router.post("/wallet/deposit-request-with-proof")
async def request_deposit_with_proof(
    user_id: str = FastAPIForm(...),
    amount: float = FastAPIForm(...),
    description: str = FastAPIForm("Solicitud de recarga"),
    file: UploadFile = File(None),
    current_user: dict = Depends(get_current_user)
):
    tid = current_user["tenant_id"]
    wallet = await db.wallets.find_one({"user_id": user_id, "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    proof_url = None
    if file and file.filename:
        ext = file.filename.split(".")[-1] if "." in file.filename else "png"
        filename = f"proof_{uuid.uuid4().hex[:8]}.{ext}"
        filepath = UPLOAD_DIR / filename
        with open(filepath, "wb") as f:
            shutil.copyfileobj(file.file, f)
        proof_url = f"/api/uploads/{filename}"
    transaction = WalletTransaction(tenant_id=tid, user_id=user_id, customer_id=wallet["customer_id"],
        type="deposit", amount=amount, balance_after=wallet["available"],
        description=description, status="pending")
    tx_dict = transaction.model_dump()
    tx_dict["proof_url"] = proof_url
    await db.wallet_transactions.insert_one(tx_dict)
    return {"message": "Solicitud de recarga enviada. Pendiente de aprobación.", "transaction_id": transaction.id}

@api_router.post("/wallet/approve-deposit/{transaction_id}")
async def approve_deposit(transaction_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Check employee permissions
    if current_user["role"] == "employee":
        employee = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not employee or not employee.get("permissions", {}).get("approve_recharges"):
            raise HTTPException(status_code=403, detail="No tienes permiso para aprobar recargas")
    
    transaction = await db.wallet_transactions.find_one({"id": transaction_id, "tenant_id": tid}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if transaction["status"] != "pending":
        raise HTTPException(status_code=400, detail="Transacción ya procesada")
    wallet = await db.wallets.find_one({"user_id": transaction["user_id"], "tenant_id": tid}, {"_id": 0})
    new_balance = wallet["available"] + transaction["amount"]
    await db.wallets.update_one({"user_id": transaction["user_id"], "tenant_id": tid},
        {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
    await db.wallet_transactions.update_one({"id": transaction_id, "tenant_id": tid},
        {"$set": {"status": "approved", "balance_after": new_balance, "approved_at": datetime.now(timezone.utc).isoformat()}})
    await create_notification(tid, transaction["user_id"], transaction["customer_id"], "wallet_credited",
        "Saldo Acreditado", f"Se han acreditado ${transaction['amount']:.2f} USD. Saldo actual: ${new_balance:.2f} USD")
    
    # Get user name for audit
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not user:
        user = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
    user_name = user["name"] if user else "Usuario"
    
    # Audit log
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=user_name,
        user_role=current_user["role"],
        action="approve_recharge",
        entity_type="wallet_transaction",
        entity_id=transaction_id,
        entity_name=f"${transaction['amount']:.2f} - {transaction['customer_id']}",
        details={"amount": transaction["amount"], "customer_id": transaction["customer_id"], "new_balance": new_balance}
    )
    
    return {"message": "Depósito aprobado", "new_balance": new_balance}

@api_router.post("/wallet/reject-deposit/{transaction_id}")
async def reject_deposit(transaction_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Check employee permissions
    if current_user["role"] == "employee":
        employee = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not employee or not employee.get("permissions", {}).get("approve_recharges"):
            raise HTTPException(status_code=403, detail="No tienes permiso para rechazar recargas")
    
    transaction = await db.wallet_transactions.find_one({"id": transaction_id, "tenant_id": tid}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if transaction["status"] != "pending":
        raise HTTPException(status_code=400, detail="Transacción ya procesada")
    await db.wallet_transactions.update_one({"id": transaction_id, "tenant_id": tid},
        {"$set": {"status": "rejected", "approved_at": datetime.now(timezone.utc).isoformat()}})
    await create_notification(tid, transaction["user_id"], transaction["customer_id"], "deposit_rejected",
        "Recarga Rechazada", f"Tu solicitud de recarga por ${transaction['amount']:.2f} USD ha sido rechazada. Contacta al administrador para más información.")
    
    # Get user name for audit
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not user:
        user = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
    user_name = user["name"] if user else "Usuario"
    
    # Audit log
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=user_name,
        user_role=current_user["role"],
        action="reject_recharge",
        entity_type="wallet_transaction",
        entity_id=transaction_id,
        entity_name=f"${transaction['amount']:.2f} - {transaction['customer_id']}",
        details={"amount": transaction["amount"], "customer_id": transaction["customer_id"]}
    )
    
    return {"message": "Depósito rechazado"}

class AdminBalanceAdjustment(BaseModel):
    user_id: str
    amount: float
    description: str

@api_router.post("/wallet/admin-adjustment")
async def admin_balance_adjustment(data: AdminBalanceAdjustment, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Check employee permissions
    if current_user["role"] == "employee":
        employee = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not employee or not employee.get("permissions", {}).get("adjust_wallet"):
            raise HTTPException(status_code=403, detail="No tienes permiso para ajustar saldos")
    
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    wallet = await db.wallets.find_one({"user_id": data.user_id, "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    user = await db.users.find_one({"id": data.user_id, "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    new_balance = wallet["available"] - data.amount
    await db.wallets.update_one({"user_id": data.user_id, "tenant_id": tid},
        {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
    tx = WalletTransaction(
        tenant_id=tid,
        user_id=data.user_id,
        customer_id=user["customer_id"],
        type="admin_adjustment",
        amount=-data.amount,
        balance_after=new_balance,
        description=data.description,
        status="approved",
        approved_at=datetime.now(timezone.utc).isoformat()
    )
    await db.wallet_transactions.insert_one(tx.model_dump())
    await create_notification(tid, data.user_id, user["customer_id"], "balance_adjustment",
        "Ajuste de Balance", f"Se ha realizado un ajuste de -${data.amount:.2f} USD en tu cuenta. Motivo: {data.description}")
    
    # Get actor name for audit
    actor = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not actor:
        actor = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
    actor_name = actor["name"] if actor else "Usuario"
    
    # Audit log
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=actor_name,
        user_role=current_user["role"],
        action="adjust_wallet",
        entity_type="wallet",
        entity_id=wallet["id"],
        entity_name=f"{user['name']} ({user['customer_id']})",
        details={"amount": -data.amount, "description": data.description, "new_balance": new_balance}
    )
    
    return {"message": "Ajuste realizado", "new_balance": new_balance, "amount_deducted": data.amount}

@api_router.post("/wallet/admin-recharge")
async def admin_create_recharge(
    user_id: str = FastAPIForm(...),
    amount: float = FastAPIForm(...),
    description: str = FastAPIForm(None),
    proof: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Admin creates a recharge directly for a client with mandatory proof screenshot.
    This immediately credits the client's wallet and logs to audit.
    """
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Check employee permissions
    if current_user["role"] == "employee":
        employee = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if not employee or not employee.get("permissions", {}).get("approve_recharges"):
            raise HTTPException(status_code=403, detail="No tienes permiso para crear recargas")
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    
    # Validate user exists
    user = await db.users.find_one({"id": user_id, "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    wallet = await db.wallets.find_one({"user_id": user_id, "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    
    # Save proof file (mandatory)
    if not proof or not proof.filename:
        raise HTTPException(status_code=400, detail="El comprobante es obligatorio")
    
    ext = proof.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "gif", "webp", "pdf"]:
        raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Use: jpg, jpeg, png, gif, webp, pdf")
    
    filename = f"proof_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(await proof.read())
    proof_url = f"/api/uploads/{filename}"
    
    # Update wallet balance immediately
    new_balance = wallet["available"] + amount
    await db.wallets.update_one(
        {"user_id": user_id, "tenant_id": tid},
        {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Create transaction with "approved" status directly
    tx = WalletTransaction(
        tenant_id=tid,
        user_id=user_id,
        customer_id=user["customer_id"],
        type="deposit",
        amount=amount,
        balance_after=new_balance,
        description=description or "Recarga creada por administrador",
        status="approved",
        approved_at=datetime.now(timezone.utc).isoformat()
    )
    tx_dict = tx.model_dump()
    tx_dict["proof_url"] = proof_url
    tx_dict["created_by_admin"] = True
    await db.wallet_transactions.insert_one(tx_dict)
    
    # Create notification for client
    await create_notification(
        tid, user_id, user["customer_id"], "wallet_credited",
        "Recarga Acreditada",
        f"Se ha acreditado ${amount:.2f} USD a tu cuenta. Nuevo saldo: ${new_balance:.2f} USD"
    )
    
    # Get actor name for audit
    actor = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not actor:
        actor = await db.employees.find_one({"id": current_user["user_id"]}, {"_id": 0})
    actor_name = actor["name"] if actor else "Administrador"
    
    # Audit log
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=actor_name,
        user_role=current_user["role"],
        action="create_recharge",
        entity_type="wallet_transaction",
        entity_id=tx.id,
        entity_name=f"{user['name']} ({user['customer_id']})",
        details={
            "amount": amount,
            "description": description or "Recarga creada por administrador",
            "new_balance": new_balance,
            "proof_url": proof_url
        }
    )
    
    return {
        "message": "Recarga creada exitosamente",
        "transaction_id": tx.id,
        "new_balance": new_balance,
        "amount_credited": amount
    }

# ==================== RECHARGE QR UPLOAD ENDPOINTS ====================

@api_router.post("/wallet/generate-upload-qr/{user_id}")
async def generate_recharge_upload_qr(user_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a temporary token for mobile upload of recharge proof via QR code"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tid = current_user["tenant_id"]
    
    # Verify user exists
    user = await db.users.find_one({"id": user_id, "tenant_id": tid}, {"_id": 0, "id": 1, "customer_id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Create a temporary upload token (expires in 10 minutes)
    upload_token = str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    
    # Store token in database
    await db.upload_tokens.insert_one({
        "token": upload_token,
        "user_id": user_id,
        "type": "recharge_proof",
        "tenant_id": tid,
        "expires_at": expires_at,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "upload_token": upload_token,
        "expires_in_minutes": 10
    }

@api_router.post("/wallet/mobile-upload/{upload_token}")
async def mobile_upload_recharge_proof(upload_token: str, file: UploadFile = File(...)):
    """Upload recharge proof from mobile device using temporary token (no auth required)"""
    # Find and validate token
    token_doc = await db.upload_tokens.find_one({"token": upload_token, "type": "recharge_proof"}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token inválido o expirado")
    
    if token_doc.get("used"):
        raise HTTPException(status_code=400, detail="Este token ya fue utilizado")
    
    # Check expiration
    expires_at = datetime.fromisoformat(token_doc["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Token expirado")
    
    # Save file
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    filename = f"recharge_proof_{upload_token[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOAD_DIR / filename
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)
    
    image_url = f"/api/uploads/{filename}"
    
    # Mark token as used and store image URL
    await db.upload_tokens.update_one(
        {"token": upload_token}, 
        {"$set": {"used": True, "image_url": image_url}}
    )
    
    return {"message": "Imagen subida exitosamente", "image_url": image_url}

@api_router.get("/wallet/check-upload/{upload_token}")
async def check_recharge_upload_status(upload_token: str):
    """Check if a recharge proof image was uploaded using the token (for polling from desktop)"""
    token_doc = await db.upload_tokens.find_one({"token": upload_token, "type": "recharge_proof"}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token no encontrado")
    
    return {
        "used": token_doc.get("used", False),
        "image_url": token_doc.get("image_url")
    }

# ==================== LIVE SHOPPING ENDPOINTS ====================

@api_router.post("/lives")
async def create_live(live_data: LiveCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    live = Live(tenant_id=current_user["tenant_id"], title=live_data.title, store=live_data.store)
    await db.lives.insert_one(live.model_dump())
    return {"message": "Live creado", "live_id": live.id}

@api_router.post("/lives/{live_id}/start")
async def start_live(live_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    result = await db.lives.update_one({"id": live_id, "tenant_id": current_user["tenant_id"]},
        {"$set": {"status": "active", "started_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return {"message": "Live iniciado"}

@api_router.post("/lives/{live_id}/end")
async def end_live(live_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    result = await db.lives.update_one({"id": live_id, "tenant_id": tid},
        {"$set": {"status": "completed", "ended_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return {"message": "Live finalizado"}

@api_router.put("/lives/{live_id}/store-invoice")
async def update_store_invoice(live_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update store invoice amount and calculate profit"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    store_amount = float(data.get("store_invoice_amount", 0))
    if store_amount < 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor o igual a 0")
    
    # Calculate profit: total_sales (includes taxes and commissions) - store_invoice_amount
    total_sales = live.get("total_sales", 0)
    profit = total_sales - store_amount
    
    await db.lives.update_one(
        {"id": live_id, "tenant_id": tid},
        {"$set": {
            "store_invoice_amount": store_amount,
            "store_profit": profit
        }}
    )
    
    return {
        "message": "Monto actualizado",
        "store_invoice_amount": store_amount,
        "total_sales": total_sales,
        "store_profit": profit
    }

@api_router.post("/lives/{live_id}/store-invoice/upload")
async def upload_store_invoice_image(
    live_id: str, 
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
):
    """Upload store invoice/receipt image"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    # Save file - use UPLOAD_DIR to ensure correct path
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    filename = f"store_invoice_{live_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOAD_DIR / filename
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)
    
    image_url = f"/api/uploads/{filename}"
    
    # Update live with image URL and recalculate profit if amount exists
    update_data = {"store_invoice_image": image_url}
    if live.get("store_invoice_amount") is not None:
        profit = live.get("total_sales", 0) - live.get("store_invoice_amount", 0)
        update_data["store_profit"] = profit
    
    await db.lives.update_one({"id": live_id, "tenant_id": tid}, {"$set": update_data})
    
    return {"message": "Imagen subida", "image_url": image_url}

@api_router.post("/lives/{live_id}/generate-upload-qr")
async def generate_upload_qr(live_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a temporary token for mobile upload via QR code"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    # Create a temporary upload token (expires in 10 minutes)
    upload_token = str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    
    # Store token in database
    await db.upload_tokens.insert_one({
        "token": upload_token,
        "live_id": live_id,
        "tenant_id": tid,
        "expires_at": expires_at,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "upload_token": upload_token,
        "expires_in_minutes": 10
    }

@api_router.post("/lives/mobile-upload/{upload_token}")
async def mobile_upload_store_invoice(upload_token: str, file: UploadFile = File(...)):
    """Upload store invoice from mobile device using temporary token (no auth required)"""
    # Find and validate token
    token_doc = await db.upload_tokens.find_one({"token": upload_token}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token inválido o expirado")
    
    if token_doc.get("used"):
        raise HTTPException(status_code=400, detail="Este token ya fue utilizado")
    
    # Check expiration
    expires_at = datetime.fromisoformat(token_doc["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Token expirado")
    
    live_id = token_doc["live_id"]
    tid = token_doc["tenant_id"]
    
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    # Save file - use UPLOAD_DIR to ensure correct path
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    filename = f"store_invoice_{live_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOAD_DIR / filename
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)
    
    image_url = f"/api/uploads/{filename}"
    
    # Update live with image URL
    update_data = {"store_invoice_image": image_url}
    if live.get("store_invoice_amount") is not None:
        profit = live.get("total_sales", 0) - live.get("store_invoice_amount", 0)
        update_data["store_profit"] = profit
    
    await db.lives.update_one({"id": live_id, "tenant_id": tid}, {"$set": update_data})
    
    # Mark token as used
    await db.upload_tokens.update_one({"token": upload_token}, {"$set": {"used": True}})
    
    return {"message": "Imagen subida exitosamente", "image_url": image_url}

@api_router.get("/lives/check-upload/{upload_token}")
async def check_upload_status(upload_token: str):
    """Check if an image was uploaded using the token (for polling from desktop)"""
    token_doc = await db.upload_tokens.find_one({"token": upload_token}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token no encontrado")
    
    live = await db.lives.find_one({"id": token_doc["live_id"]}, {"_id": 0})
    
    return {
        "used": token_doc.get("used", False),
        "image_url": live.get("store_invoice_image") if live else None
    }

@api_router.get("/lives")
async def get_lives(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    query = {"tenant_id": tid}
    if status:
        query["status"] = status
    lives = await db.lives.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return lives

@api_router.get("/lives/active")
async def get_active_live(current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"status": "active", "tenant_id": tid}, {"_id": 0})
    return live

@api_router.get("/lives/{live_id}")
async def get_live(live_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return live

@api_router.put("/lives/{live_id}")
async def update_live(live_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update live title and store - propagates changes to all purchases"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    update_fields = {}
    purchase_updates = {}
    
    # Track what fields changed
    if "title" in data and data["title"]:
        new_title = data["title"].strip()
        if new_title != live.get("title"):
            update_fields["title"] = new_title
            purchase_updates["live_title"] = new_title
    
    if "store" in data and data["store"]:
        new_store = data["store"].strip()
        if new_store != live.get("store"):
            update_fields["store"] = new_store
            purchase_updates["store"] = new_store
    
    if update_fields:
        # Update the live
        await db.lives.update_one({"id": live_id, "tenant_id": tid}, {"$set": update_fields})
        
        # Propagate changes to all purchases of this live
        if purchase_updates:
            result = await db.purchases.update_many(
                {"live_id": live_id, "tenant_id": tid},
                {"$set": purchase_updates}
            )
            print(f"Updated {result.modified_count} purchases with new live/store info")
    
    updated_live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    return updated_live

# ==================== PURCHASE ENDPOINTS ====================

CUSTOM_TAX_RATE = 0.15  # 15% custom tax

@api_router.post("/purchases")
async def create_purchase(purchase_data: PurchaseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    user = await db.users.find_one({"customer_id": purchase_data.customer_id.upper(), "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    wallet = await db.wallets.find_one({"user_id": user["id"], "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    
    # Calculate tax using the provided tax_rate
    tax_rate = purchase_data.tax_rate if purchase_data.apply_tax else 0
    tax = round(purchase_data.price * tax_rate, 2)
    
    commission_fee = purchase_data.commission_amount if purchase_data.apply_commission else 0
    price_with_tax = round(purchase_data.price + tax, 2)
    total = round(price_with_tax + commission_fee, 2)
    
    purchase_dict = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "user_id": user["id"],
        "customer_id": purchase_data.customer_id.upper(),
        "item_name": purchase_data.item_name,
        "store": purchase_data.store,
        "price": purchase_data.price,
        "tax": tax,
        "tax_rate": tax_rate,
        "apply_tax": purchase_data.apply_tax,
        "price_with_tax": price_with_tax,
        "commission": commission_fee,
        "apply_commission": purchase_data.apply_commission,
        "total": total,
        "status": "confirmed",
        "live_id": purchase_data.live_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.purchases.insert_one(purchase_dict)
    new_balance = wallet["available"] - total
    await db.wallets.update_one({"user_id": user["id"], "tenant_id": tid},
        {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
    transaction = WalletTransaction(tenant_id=tid, user_id=user["id"], customer_id=purchase_data.customer_id.upper(),
        type="purchase", amount=-total, balance_after=new_balance,
        description=f"Compra: {purchase_data.item_name} ({purchase_data.store}) - Total: ${total:.2f}", status="approved",
        approved_at=datetime.now(timezone.utc).isoformat(), purchase_id=purchase_dict["id"])
    await db.wallet_transactions.insert_one(transaction.model_dump())
    await db.lives.update_one({"id": purchase_data.live_id, "tenant_id": tid},
        {"$inc": {"total_sales": price_with_tax, "total_commissions": commission_fee, "purchase_count": 1}})
    await create_notification(tid, user["id"], purchase_data.customer_id.upper(), "purchase_created",
        "Compra Registrada",
        f"Compraste {purchase_data.item_name} - Precio: ${purchase_data.price:.2f} + Tax: ${tax:.2f} + Comisión: ${commission_fee:.2f} = Total: ${total:.2f}. Saldo: ${new_balance:.2f}")
    await check_low_balance(tid, user["id"], purchase_data.customer_id.upper(), new_balance)
    return {
        "message": "Compra registrada", "purchase_id": purchase_dict["id"], "price": purchase_data.price,
        "tax": tax, "price_with_tax": price_with_tax, "commission": commission_fee, "total": total,
        "amount_deducted": total, "new_balance": new_balance, "customer_name": user["name"]
    }

@api_router.get("/purchases/user/{user_id}")
async def get_user_purchases(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    purchases = await db.purchases.find({"user_id": user_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    # Return purchases with their original values (commission was set at purchase time)
    result = []
    for p in purchases:
        p_copy = dict(p)
        # Use the commission that was stored at purchase time, not the current client commission
        p_copy["total_price"] = p.get("total", 0)
        result.append(p_copy)
    return result

@api_router.get("/purchases/live/{live_id}")
async def get_live_purchases(live_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    purchases = await db.purchases.find({"live_id": live_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return purchases

@api_router.get("/purchases/pending-shipment/{user_id}")
async def get_pending_shipment_purchases(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    all_purchases = await db.purchases.find({"user_id": user_id, "status": "confirmed", "tenant_id": tid}, {"_id": 0}).to_list(500)
    shipments = await db.shipments.find({"user_id": user_id, "tenant_id": tid}, {"_id": 0, "purchase_ids": 1}).to_list(500)
    shipped_ids = set()
    for s in shipments:
        shipped_ids.update(s.get("purchase_ids", []))
    # Return purchases with their original values (commission was set at purchase time)
    result = []
    for p in all_purchases:
        if p["id"] not in shipped_ids:
            p_copy = dict(p)
            # Use the commission that was stored at purchase time
            p_copy["total_price"] = p.get("total", 0)
            result.append(p_copy)
    return result


class PurchaseUpdate(BaseModel):
    item_name: Optional[str] = None
    store: Optional[str] = None
    price: Optional[float] = None
    apply_tax: Optional[bool] = None
    tax_rate: Optional[float] = None
    apply_commission: Optional[bool] = None
    commission: Optional[float] = None
    customer_id: Optional[str] = None  # Allow changing the client

@api_router.put("/purchases/{purchase_id}")
async def update_purchase(purchase_id: str, data: PurchaseUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    purchase = await db.purchases.find_one({"id": purchase_id, "tenant_id": tid}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    
    updates = {}
    
    # Get current or new values
    new_price = data.price if data.price is not None else purchase["price"]
    new_apply_tax = data.apply_tax if data.apply_tax is not None else purchase.get("apply_tax", True)
    new_tax_rate = data.tax_rate if data.tax_rate is not None else purchase.get("tax_rate", ILLINOIS_TAX_RATE)
    new_apply_commission = data.apply_commission if data.apply_commission is not None else purchase.get("apply_commission", True)
    new_commission = data.commission if data.commission is not None else purchase.get("commission", 0)
    
    # Update basic fields
    if data.item_name is not None:
        updates["item_name"] = data.item_name
    if data.store is not None:
        updates["store"] = data.store
    
    # Handle customer change
    if data.customer_id is not None and data.customer_id != purchase["customer_id"]:
        # Verify the new customer exists
        new_customer = await db.users.find_one(
            {"customer_id": data.customer_id, "tenant_id": tid, "role": "client"},
            {"_id": 0, "id": 1, "customer_id": 1}
        )
        if not new_customer:
            raise HTTPException(status_code=400, detail=f"Cliente {data.customer_id} no encontrado")
        
        # Update purchase with new customer
        updates["customer_id"] = data.customer_id
        updates["user_id"] = new_customer["id"]
        
        # Move the amount from old wallet to new wallet
        old_wallet = await db.wallets.find_one({"user_id": purchase["user_id"], "tenant_id": tid})
        new_wallet = await db.wallets.find_one({"user_id": new_customer["id"], "tenant_id": tid})
        
        if old_wallet:
            # Refund to old wallet
            await db.wallets.update_one(
                {"user_id": purchase["user_id"], "tenant_id": tid},
                {"$inc": {"available": purchase["total"]}}
            )
        
        if new_wallet:
            # Charge new wallet
            await db.wallets.update_one(
                {"user_id": new_customer["id"], "tenant_id": tid},
                {"$inc": {"available": -purchase["total"]}}
            )
        else:
            # Create wallet for new customer if doesn't exist
            new_wallet_obj = Wallet(tenant_id=tid, user_id=new_customer["id"], available=-purchase["total"])
            await db.wallets.insert_one(new_wallet_obj.model_dump())
    
    # Recalculate totals if any financial field changed
    price_changed = data.price is not None
    tax_changed = data.apply_tax is not None or data.tax_rate is not None
    commission_changed = data.apply_commission is not None or data.commission is not None
    
    if price_changed or tax_changed or commission_changed:
        # Calculate new tax
        if new_apply_tax:
            new_tax = round(new_price * new_tax_rate, 2)
        else:
            new_tax = 0
        new_price_with_tax = round(new_price + new_tax, 2)
        
        # Calculate new commission
        if not new_apply_commission:
            new_commission = 0
        
        new_total = round(new_price_with_tax + new_commission, 2)
        old_total = purchase["total"]
        diff = new_total - old_total
        
        updates.update({
            "price": new_price,
            "tax": new_tax,
            "tax_rate": new_tax_rate if new_apply_tax else None,
            "apply_tax": new_apply_tax,
            "price_with_tax": new_price_with_tax,
            "commission": new_commission,
            "apply_commission": new_apply_commission,
            "total": new_total
        })
        
        # Adjust wallet balance
        wallet = await db.wallets.find_one({"user_id": purchase["user_id"], "tenant_id": tid}, {"_id": 0})
        if wallet:
            new_balance = wallet["available"] - diff
            await db.wallets.update_one({"user_id": purchase["user_id"], "tenant_id": tid},
                {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
        
        # Adjust live totals
        old_price_with_tax = purchase.get("price_with_tax", purchase["price"])
        old_commission = purchase.get("commission", 0)
        await db.lives.update_one({"id": purchase["live_id"], "tenant_id": tid},
            {"$inc": {
                "total_sales": round(new_price_with_tax - old_price_with_tax, 2),
                "total_commissions": round(new_commission - old_commission, 2)
            }})
    
    if updates:
        await db.purchases.update_one({"id": purchase_id, "tenant_id": tid}, {"$set": updates})
    updated = await db.purchases.find_one({"id": purchase_id, "tenant_id": tid}, {"_id": 0})
    return updated

@api_router.delete("/purchases/{purchase_id}")
async def delete_purchase(purchase_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    purchase = await db.purchases.find_one({"id": purchase_id, "tenant_id": tid}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    # Refund total to wallet
    wallet = await db.wallets.find_one({"user_id": purchase["user_id"], "tenant_id": tid}, {"_id": 0})
    if wallet:
        new_balance = wallet["available"] + purchase["total"]
        await db.wallets.update_one({"user_id": purchase["user_id"], "tenant_id": tid},
            {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
        tx = WalletTransaction(tenant_id=tid, user_id=purchase["user_id"], customer_id=purchase["customer_id"],
            type="refund", amount=purchase["total"], balance_after=new_balance,
            description=f"Reembolso: {purchase['item_name']} eliminado", status="approved",
            approved_at=datetime.now(timezone.utc).isoformat())
        await db.wallet_transactions.insert_one(tx.model_dump())
    # Adjust live totals
    await db.lives.update_one({"id": purchase["live_id"], "tenant_id": tid},
        {"$inc": {"total_sales": -purchase.get("price_with_tax", 0), "total_commissions": -purchase["commission"], "purchase_count": -1}})
    await db.purchases.delete_one({"id": purchase_id, "tenant_id": tid})
    return {"message": "Compra eliminada y saldo reembolsado"}

# ==================== SHIPMENT ENDPOINTS ====================

@api_router.post("/shipments")
async def create_shipment(shipment_data: ShipmentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    # Check employee permission
    if current_user["role"] == "employee":
        has_permission = await check_employee_permission(current_user["user_id"], "manage_shipments")
        if not has_permission:
            raise HTTPException(status_code=403, detail="No tienes permiso para gestionar envíos")
    tid = current_user["tenant_id"]
    user = await db.users.find_one({"id": shipment_data.user_id, "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    shipment = Shipment(tenant_id=tid, user_id=shipment_data.user_id, customer_id=user["customer_id"],
        purchase_ids=shipment_data.purchase_ids, shipping_type=shipment_data.shipping_type,
        shipping_cost=shipment_data.shipping_cost, weight_pounds=shipment_data.weight_pounds,
        address=shipment_data.address, country=shipment_data.country, phone=shipment_data.phone, 
        additional_info=shipment_data.additional_info, invoice_id=shipment_data.invoice_id)
    await db.shipments.insert_one(shipment.model_dump())
    
    # If linked to an invoice, update the invoice with the shipment
    if shipment_data.invoice_id:
        await db.invoices.update_one(
            {"id": shipment_data.invoice_id, "tenant_id": tid},
            {"$set": {"shipment_id": shipment.id, "shipping_cost": shipment_data.shipping_cost, "weight_pounds": shipment_data.weight_pounds}}
        )
    
    await create_notification(tid, shipment_data.user_id, user["customer_id"], "shipment_created",
        "Envío Creado", f"Tu envío ha sido creado. Peso: {shipment_data.weight_pounds} lbs. Costo: ${shipment_data.shipping_cost:.2f} USD")
    return {"message": "Envío creado", "shipment_id": shipment.id, "shipping_cost": shipment_data.shipping_cost, "weight_pounds": shipment_data.weight_pounds}

@api_router.put("/shipments/{shipment_id}/tracking")
async def update_tracking(shipment_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update tracking numbers for a shipment (supports multiple packages)"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    tid = current_user["tenant_id"]
    tracking_numbers = data.get("tracking_numbers", [])
    
    # Validate tracking numbers is a list
    if not isinstance(tracking_numbers, list):
        raise HTTPException(status_code=400, detail="tracking_numbers debe ser una lista")
    
    # Filter out empty strings
    tracking_numbers = [t.strip() for t in tracking_numbers if t and t.strip()]
    
    # Also set legacy tracking_number to first one for backwards compatibility
    tracking_number = tracking_numbers[0] if tracking_numbers else None
    
    result = await db.shipments.update_one(
        {"id": shipment_id, "tenant_id": tid},
        {"$set": {
            "tracking_numbers": tracking_numbers,
            "tracking_number": tracking_number,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    
    return {"message": "Tracking actualizado", "tracking_numbers": tracking_numbers}

@api_router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: str, status: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if status not in ["preparing", "in_transit", "delivered"]:
        raise HTTPException(status_code=400, detail="Estado inválido")
    tid = current_user["tenant_id"]
    shipment = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    await db.shipments.update_one({"id": shipment_id, "tenant_id": tid},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if status == "delivered":
        await create_notification(tid, shipment["user_id"], shipment["customer_id"], "shipment_delivered",
            "Envío Entregado!", "Tu pedido ha sido entregado. Gracias por tu compra!")
    return {"message": f"Estado actualizado a {status}"}

@api_router.post("/shipments/{shipment_id}/attachments")
async def upload_shipment_attachment(shipment_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    shipment = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    
    # Save file - use UPLOAD_DIR to ensure correct path
    shipments_upload_dir = UPLOAD_DIR / "shipments"
    shipments_upload_dir.mkdir(parents=True, exist_ok=True)
    file_ext = Path(file.filename).suffix
    filename = f"{shipment_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = shipments_upload_dir / filename
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # URL must include /api prefix for proper routing
    file_url = f"/api/uploads/shipments/{filename}"
    
    # Add to shipment attachments
    current_attachments = shipment.get("attachments", [])
    current_attachments.append(file_url)
    
    await db.shipments.update_one({"id": shipment_id, "tenant_id": tid},
        {"$set": {"attachments": current_attachments, "updated_at": datetime.now(timezone.utc).isoformat()}})
    
    return {"message": "Archivo adjuntado", "file_url": file_url, "attachments": current_attachments}

@api_router.get("/shipments/user/{user_id}")
async def get_user_shipments(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    shipments = await db.shipments.find({"user_id": user_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return shipments

@api_router.get("/shipments")
async def get_all_shipments(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    # Check employee permission
    if current_user["role"] == "employee":
        has_permission = await check_employee_permission(current_user["user_id"], "manage_shipments")
        if not has_permission:
            raise HTTPException(status_code=403, detail="No tienes permiso para ver envíos")
    tid = current_user["tenant_id"]
    query = {"tenant_id": tid}
    if status:
        query["status"] = status
    shipments = await db.shipments.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    if not shipments:
        return []
    
    # Batch fetch all users in one query instead of N queries
    user_ids = list(set(s["user_id"] for s in shipments))
    users_list = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(user_ids))
    users_dict = {u["id"]: u["name"] for u in users_list}
    
    result = []
    for s in shipments:
        result.append({**s, "user_name": users_dict.get(s["user_id"], "Unknown")})
    return result

class ShipmentUpdate(BaseModel):
    shipping_type: Optional[str] = None
    shipping_cost: Optional[float] = None
    weight_pounds: Optional[float] = None
    address: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    additional_info: Optional[str] = None
    tracking_number: Optional[str] = None

@api_router.put("/shipments/{shipment_id}")
async def update_shipment(shipment_id: str, data: ShipmentUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    shipment = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    updates = {}
    if data.shipping_type is not None:
        updates["shipping_type"] = data.shipping_type
    if data.shipping_cost is not None:
        updates["shipping_cost"] = data.shipping_cost
    if data.weight_pounds is not None:
        updates["weight_pounds"] = data.weight_pounds
    if data.address is not None:
        updates["address"] = data.address
    if data.country is not None:
        updates["country"] = data.country
    if data.phone is not None:
        updates["phone"] = data.phone
    if data.additional_info is not None:
        updates["additional_info"] = data.additional_info
    if data.tracking_number is not None:
        updates["tracking_number"] = data.tracking_number
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.shipments.update_one({"id": shipment_id, "tenant_id": tid}, {"$set": updates})
    updated = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    return updated

@api_router.delete("/shipments/{shipment_id}")
async def delete_shipment(shipment_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    shipment = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    await db.shipments.delete_one({"id": shipment_id, "tenant_id": tid})
    await create_notification(tid, shipment["user_id"], shipment["customer_id"], "shipment_deleted",
        "Envío Eliminado", "Un envío ha sido eliminado de tu cuenta.")
    return {"message": "Envío eliminado"}

# ==================== INVOICES ====================

@api_router.get("/invoices/client/{customer_id}/pending-purchases")
async def get_pending_purchases_for_invoice(customer_id: str, current_user: dict = Depends(get_current_user)):
    """Get all purchases not yet invoiced for a client"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get purchases without invoice_id
    purchases = await db.purchases.find({
        "customer_id": customer_id.upper(),
        "tenant_id": tid,
        "$or": [
            {"invoice_id": None},
            {"invoice_id": {"$exists": False}}
        ]
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    return purchases

@api_router.post("/invoices")
async def create_invoice(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new invoice for a client with pending purchases"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    customer_id = data.get("customer_id", "").upper()
    purchase_ids = data.get("purchase_ids", [])
    notes = data.get("notes", "")
    
    if not customer_id or not purchase_ids:
        raise HTTPException(status_code=400, detail="customer_id y purchase_ids son requeridos")
    
    # Get client info
    client = await db.users.find_one({"customer_id": customer_id, "tenant_id": tid}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    # Get purchases
    purchases = await db.purchases.find({
        "id": {"$in": purchase_ids},
        "customer_id": customer_id,
        "tenant_id": tid
    }, {"_id": 0}).to_list(len(purchase_ids))
    
    if len(purchases) != len(purchase_ids):
        raise HTTPException(status_code=400, detail="Algunas compras no fueron encontradas")
    
    # Calculate totals
    subtotal = sum(p["price"] for p in purchases)
    total_tax = sum(p.get("tax", 0) for p in purchases)
    total_commission = sum(p.get("commission", 0) for p in purchases)
    total = sum(p["total"] for p in purchases)
    
    # Generate invoice number using customer_id + sequential number
    # Count existing invoices for this customer to get the next number
    customer_invoice_count = await db.invoices.count_documents({"customer_id": customer_id, "tenant_id": tid})
    customer_seq = customer_invoice_count + 1
    invoice_number = f"{customer_id}-{customer_seq:03d}"
    
    invoice = Invoice(
        tenant_id=tid,
        user_id=client["id"],
        customer_id=customer_id,
        invoice_number=invoice_number,
        purchase_ids=purchase_ids,
        subtotal=round(subtotal, 2),
        total_tax=round(total_tax, 2),
        total_commission=round(total_commission, 2),
        total=round(total, 2),
        notes=notes
    )
    
    await db.invoices.insert_one(invoice.model_dump())
    
    # Mark purchases as invoiced
    now = datetime.now(timezone.utc).isoformat()
    await db.purchases.update_many(
        {"id": {"$in": purchase_ids}, "tenant_id": tid},
        {"$set": {"invoice_id": invoice.id, "invoiced_at": now}}
    )
    
    return {
        "message": "Factura creada",
        "invoice_id": invoice.id,
        "invoice_number": invoice_number,
        "total": invoice.total
    }

@api_router.get("/invoices/client/{customer_id}")
async def get_client_invoices(customer_id: str, include_annulled: bool = False, current_user: dict = Depends(get_current_user)):
    """Get all invoices for a client"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    query = {
        "customer_id": customer_id.upper(),
        "tenant_id": tid
    }
    
    # By default, exclude annulled invoices
    if not include_annulled:
        query["is_annulled"] = {"$ne": True}
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return invoices

@api_router.get("/invoices/client/{customer_id}/for-shipment")
async def get_client_invoices_for_shipment(customer_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoices for a client that don't have an associated shipment yet"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get all non-annulled invoices for this client
    invoices = await db.invoices.find({
        "customer_id": customer_id.upper(),
        "tenant_id": tid,
        "is_annulled": {"$ne": True}
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Get all shipment invoice_ids to filter out invoices that already have shipments
    shipments = await db.shipments.find(
        {"tenant_id": tid, "invoice_id": {"$ne": None}},
        {"invoice_id": 1, "_id": 0}
    ).to_list(1000)
    shipped_invoice_ids = {s["invoice_id"] for s in shipments if s.get("invoice_id")}
    
    # Filter out invoices that already have shipments
    result = []
    for inv in invoices:
        if inv["id"] not in shipped_invoice_ids:
            # Get purchase details for this invoice
            purchases = await db.purchases.find(
                {"id": {"$in": inv.get("purchase_ids", [])}},
                {"_id": 0}
            ).to_list(100)
            inv["purchases"] = purchases
            inv["purchase_count"] = len(purchases)
            result.append(inv)
    
    return result

@api_router.get("/invoices/search")
async def search_invoices(
    q: str = "",
    status_filter: str = "all",  # all, pending, approved, annulled, active
    current_user: dict = Depends(get_current_user)
):
    """Search invoices by any field (invoice number, client name, email, whatsapp, customer_id)"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Build base query
    base_query = {"tenant_id": tid}
    
    # Apply status filter
    if status_filter == "annulled":
        base_query["is_annulled"] = True
    elif status_filter == "pending":
        base_query["is_annulled"] = {"$ne": True}
        base_query["status"] = "pending"
    elif status_filter == "approved":
        base_query["is_annulled"] = {"$ne": True}
        base_query["status"] = "approved"
    elif status_filter == "active":
        # All non-annulled invoices
        base_query["is_annulled"] = {"$ne": True}
    # status_filter == "all" means no filter on status
    
    # Get all invoices first
    invoices = await db.invoices.find(base_query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get all customer_ids from invoices
    customer_ids = list(set(inv["customer_id"] for inv in invoices))
    
    # Get pending purchases count per customer (purchases without invoice_id)
    pending_purchases_by_customer = {}
    if customer_ids:
        # Get all users for these customer_ids to get their user ids
        clients = await db.users.find({"customer_id": {"$in": customer_ids}, "tenant_id": tid}, {"_id": 0}).to_list(len(customer_ids))
        client_map = {c["customer_id"]: c for c in clients}
        
        # Get pending purchases (no invoice_id) grouped by user
        user_ids = [c["id"] for c in clients]
        pending_purchases = await db.purchases.find({
            "user_id": {"$in": user_ids},
            "tenant_id": tid,
            "$or": [
                {"invoice_id": None},
                {"invoice_id": {"$exists": False}}
            ]
        }, {"user_id": 1, "_id": 0}).to_list(10000)
        
        # Count by user_id, then map to customer_id
        user_pending_count = {}
        for p in pending_purchases:
            uid = p["user_id"]
            user_pending_count[uid] = user_pending_count.get(uid, 0) + 1
        
        # Map user_id counts to customer_id
        for c in clients:
            pending_purchases_by_customer[c["customer_id"]] = user_pending_count.get(c["id"], 0)
    else:
        client_map = {}
    
    # Get all shipments for these invoices
    invoice_ids = [inv["id"] for inv in invoices]
    shipments_by_invoice = {}
    
    if invoice_ids:
        # First try to get shipments linked directly by invoice_id
        linked_shipments = await db.shipments.find(
            {"invoice_id": {"$in": invoice_ids}, "tenant_id": tid},
            {"_id": 0}
        ).to_list(1000)
        
        for s in linked_shipments:
            shipments_by_invoice[s["invoice_id"]] = s
        
        # For invoices without direct link, try to find by purchase_ids
        for inv in invoices:
            if inv["id"] not in shipments_by_invoice and inv.get("purchase_ids"):
                shipment = await db.shipments.find_one(
                    {
                        "tenant_id": tid,
                        "customer_id": inv.get("customer_id"),
                        "purchase_ids": {"$in": inv["purchase_ids"]}
                    },
                    {"_id": 0},
                    sort=[("created_at", -1)]
                )
                if shipment:
                    shipments_by_invoice[inv["id"]] = shipment
    
    # Helper function to enrich invoice with shipment
    def enrich_invoice(inv):
        inv["client"] = client_map.get(inv["customer_id"], {})
        inv["client_pending_purchases"] = pending_purchases_by_customer.get(inv["customer_id"], 0)
        inv["shipment"] = shipments_by_invoice.get(inv["id"])
        if inv["shipment"]:
            inv["shipping_cost"] = inv["shipment"].get("shipping_cost", 0)
        return inv
    
    # If no search query, return all filtered invoices
    if not q or q.strip() == "":
        for inv in invoices:
            enrich_invoice(inv)
        
        return invoices
    
    # Search query provided - search in invoices and clients
    q_lower = q.strip().lower()
    q_upper = q.strip().upper()
    
    # Get all clients for this tenant to search
    all_clients = await db.users.find({"tenant_id": tid, "role": "client"}, {"_id": 0}).to_list(5000)
    
    # Find matching client customer_ids
    matching_customer_ids = set()
    for client in all_clients:
        client_name = (client.get("name") or "").lower()
        client_email = (client.get("email") or "").lower()
        client_whatsapp = (client.get("whatsapp") or "").lower()
        client_customer_id = (client.get("customer_id") or "").upper()
        if (q_lower in client_name or
            q_lower in client_email or
            q_lower in client_whatsapp or
            q_upper in client_customer_id):
            matching_customer_ids.add(client["customer_id"])
    
    # Filter invoices
    filtered_invoices = []
    
    for inv in invoices:
        # Match by invoice number
        if q_lower in inv.get("invoice_number", "").lower():
            enrich_invoice(inv)
            filtered_invoices.append(inv)
        # Match by customer_id
        elif q_upper in inv.get("customer_id", "").upper():
            enrich_invoice(inv)
            filtered_invoices.append(inv)
        # Match by client info
        elif inv["customer_id"] in matching_customer_ids:
            enrich_invoice(inv)
            filtered_invoices.append(inv)
    
    return filtered_invoices

@api_router.get("/invoices/{invoice_id}")
async def get_invoice_detail(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoice with full details"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    invoice = await db.invoices.find_one({"id": invoice_id, "tenant_id": tid}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    # Get client info
    client = await db.users.find_one({"customer_id": invoice["customer_id"], "tenant_id": tid}, {"_id": 0})
    
    # Get client wallet for balance
    client_wallet = None
    if client:
        client_wallet = await db.wallets.find_one({"user_id": client["id"], "tenant_id": tid}, {"_id": 0})
    
    # Get purchases
    purchases = await db.purchases.find({
        "id": {"$in": invoice["purchase_ids"]},
        "tenant_id": tid
    }, {"_id": 0}).to_list(len(invoice["purchase_ids"]))
    
    # Get tenant info for Personal Shopper details
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    
    # Get shipment linked to this specific invoice first
    shipment = await db.shipments.find_one(
        {"invoice_id": invoice["id"], "tenant_id": tid},
        {"_id": 0}
    )
    
    # If no shipment by invoice_id, try to find one that contains the same purchases
    if not shipment and invoice.get("purchase_ids"):
        # Find shipment that contains any of the invoice's purchases
        shipment = await db.shipments.find_one(
            {
                "tenant_id": tid,
                "customer_id": invoice.get("customer_id"),
                "purchase_ids": {"$in": invoice["purchase_ids"]}
            },
            {"_id": 0},
            sort=[("created_at", -1)]  # Get the most recent one
        )
    
    # Get client's approved deposits (abonos) - only approved ones
    client_deposits = []
    if client:
        deposits = await db.wallet_transactions.find(
            {
                "user_id": client["id"],
                "tenant_id": tid,
                "type": "deposit",
                "status": "approved"
            },
            {"_id": 0, "amount": 1, "created_at": 1, "description": 1}
        ).sort("created_at", -1).limit(20).to_list(20)
        client_deposits = deposits
    
    return {
        **invoice,
        "client": client,
        "client_balance": client_wallet.get("available", 0) if client_wallet else 0,
        "purchases": purchases,
        "tenant": tenant,
        "shipment": shipment,
        "client_deposits": client_deposits
    }

@api_router.put("/invoices/{invoice_id}/remove-item")
async def remove_item_from_invoice(invoice_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Remove an item from an invoice (works for both pending and approved invoices)"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    purchase_id = data.get("purchase_id")
    
    if not purchase_id:
        raise HTTPException(status_code=400, detail="purchase_id es requerido")
    
    invoice = await db.invoices.find_one({"id": invoice_id, "tenant_id": tid}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if purchase_id not in invoice["purchase_ids"]:
        raise HTTPException(status_code=400, detail="El artículo no está en esta factura")
    
    if len(invoice["purchase_ids"]) <= 1:
        raise HTTPException(status_code=400, detail="No puedes quitar el último artículo. Elimina la factura en su lugar.")
    
    # Get the purchase to update totals
    purchase = await db.purchases.find_one({"id": purchase_id, "tenant_id": tid}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    
    # Remove from invoice
    new_purchase_ids = [pid for pid in invoice["purchase_ids"] if pid != purchase_id]
    
    # Recalculate totals
    remaining_purchases = await db.purchases.find({
        "id": {"$in": new_purchase_ids},
        "tenant_id": tid
    }, {"_id": 0}).to_list(len(new_purchase_ids))
    
    new_subtotal = sum(p["price"] for p in remaining_purchases)
    new_total_tax = sum(p.get("tax", 0) for p in remaining_purchases)
    new_total_commission = sum(p.get("commission", 0) for p in remaining_purchases)
    new_total = sum(p["total"] for p in remaining_purchases)
    
    # Update invoice
    await db.invoices.update_one(
        {"id": invoice_id, "tenant_id": tid},
        {"$set": {
            "purchase_ids": new_purchase_ids,
            "subtotal": round(new_subtotal, 2),
            "total_tax": round(new_total_tax, 2),
            "total_commission": round(new_total_commission, 2),
            "total": round(new_total, 2)
        }}
    )
    
    # Remove invoice reference from purchase and reset status if invoice was approved
    update_fields = {"invoice_id": None, "invoiced_at": None}
    if invoice["status"] == "approved":
        update_fields["status"] = "confirmed"
        update_fields["paid_at"] = None
    
    await db.purchases.update_one(
        {"id": purchase_id, "tenant_id": tid},
        {"$set": update_fields}
    )
    
    return {
        "message": "Artículo removido de la factura",
        "removed_purchase_id": purchase_id,
        "new_total": round(new_total, 2),
        "remaining_items": len(new_purchase_ids)
    }

@api_router.put("/invoices/{invoice_id}/reopen")
async def reopen_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Reopen an approved invoice for modifications"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    invoice = await db.invoices.find_one({"id": invoice_id, "tenant_id": tid}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if invoice["status"] != "approved":
        raise HTTPException(status_code=400, detail="La factura no está aprobada")
    
    # Reopen invoice
    await db.invoices.update_one(
        {"id": invoice_id, "tenant_id": tid},
        {"$set": {"status": "pending", "approved_at": None}}
    )
    
    # Reset all purchases to confirmed status (not paid)
    await db.purchases.update_many(
        {"id": {"$in": invoice["purchase_ids"]}, "tenant_id": tid},
        {"$set": {"status": "confirmed", "paid_at": None}}
    )
    
    return {"message": "Factura reabierta para modificaciones"}

@api_router.put("/invoices/{invoice_id}/approve")
async def approve_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Approve an invoice - moves purchases to paid history"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    invoice = await db.invoices.find_one({"id": invoice_id, "tenant_id": tid}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if invoice["status"] == "approved":
        raise HTTPException(status_code=400, detail="La factura ya está aprobada")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update invoice status
    await db.invoices.update_one(
        {"id": invoice_id, "tenant_id": tid},
        {"$set": {"status": "approved", "approved_at": now}}
    )
    
    # Mark all purchases as paid/archived
    await db.purchases.update_many(
        {"id": {"$in": invoice["purchase_ids"]}, "tenant_id": tid},
        {"$set": {"status": "paid", "paid_at": now}}
    )
    
    # Create notification for client
    await create_notification(
        tid, invoice["user_id"], invoice["customer_id"],
        "invoice_approved",
        "Factura Aprobada",
        f"Tu factura {invoice['invoice_number']} por ${invoice['total']:.2f} ha sido aprobada."
    )
    
    return {"message": "Factura aprobada", "invoice_number": invoice["invoice_number"]}

@api_router.get("/invoices/client/{customer_id}/history")
async def get_client_purchase_history(customer_id: str, current_user: dict = Depends(get_current_user)):
    """Get purchase history (paid purchases from approved invoices)"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    purchases = await db.purchases.find({
        "customer_id": customer_id.upper(),
        "tenant_id": tid,
        "status": "paid"
    }, {"_id": 0}).sort("paid_at", -1).to_list(500)
    
    return purchases

@api_router.put("/invoices/{invoice_id}/annul")
async def annul_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Annul an invoice (soft delete) - only admins can do this"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden anular facturas")
    tid = current_user["tenant_id"]
    user_id = current_user["user_id"]
    
    # Get admin user info for audit
    admin_user = await db.users.find_one({"id": user_id, "tenant_id": tid}, {"_id": 0})
    admin_name = admin_user.get("name", admin_user.get("email", "Admin")) if admin_user else "Admin"
    
    invoice = await db.invoices.find_one({"id": invoice_id, "tenant_id": tid}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if invoice.get("is_annulled"):
        raise HTTPException(status_code=400, detail="La factura ya está anulada")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update invoice to annulled
    await db.invoices.update_one(
        {"id": invoice_id, "tenant_id": tid},
        {"$set": {
            "is_annulled": True,
            "annulled_at": now,
            "annulled_by": user_id,
            "annulled_by_name": admin_name
        }}
    )
    
    # If invoice was approved, revert purchase statuses back to pending
    if invoice.get("status") == "approved":
        await db.purchases.update_many(
            {"id": {"$in": invoice["purchase_ids"]}, "tenant_id": tid},
            {"$set": {"status": "pending", "paid_at": None, "invoice_id": None, "invoiced_at": None}}
        )
    else:
        # If pending, just remove invoice reference
        await db.purchases.update_many(
            {"id": {"$in": invoice["purchase_ids"]}, "tenant_id": tid},
            {"$set": {"invoice_id": None, "invoiced_at": None}}
        )
    
    # Log audit
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "action": "invoice_annulled",
        "entity_type": "invoice",
        "entity_id": invoice_id,
        "user_id": user_id,
        "user_name": admin_name,
        "details": f"Factura {invoice['invoice_number']} anulada",
        "created_at": now
    })
    
    return {"message": "Factura anulada exitosamente", "invoice_number": invoice["invoice_number"]}

# ==================== NOTIFICATIONS ====================

@api_router.get("/notifications/{user_id}")
async def get_user_notifications(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    notifications = await db.notifications.find({"user_id": user_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return notifications

# ==================== REPORTS ====================

@api_router.get("/admin/reports/live/{live_id}")
async def get_live_report(live_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    live = await db.lives.find_one({"id": live_id, "tenant_id": tid}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    purchases = await db.purchases.find({"live_id": live_id, "tenant_id": tid}, {"_id": 0}).to_list(500)
    customer_totals = {}
    for p in purchases:
        cid = p["customer_id"]
        if cid not in customer_totals:
            customer_totals[cid] = {"count": 0, "total": 0}
        customer_totals[cid]["count"] += 1
        customer_totals[cid]["total"] += p["total"]
    return {"live": live, "purchases": purchases, "customer_summary": customer_totals,
        "total_sales": live.get("total_sales", 0), "total_commissions": live.get("total_commissions", 0),
        "purchase_count": live.get("purchase_count", 0)}

@api_router.get("/admin/reports/summary")
async def get_reports_summary(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    total_sales = await db.purchases.aggregate([
        {"$match": {"tenant_id": tid}}, {"$group": {"_id": None, "total": {"$sum": "$price"}}}
    ]).to_list(1)
    total_commissions = await db.purchases.aggregate([
        {"$match": {"tenant_id": tid}}, {"$group": {"_id": None, "total": {"$sum": "$commission"}}}
    ]).to_list(1)
    client_count = await db.users.count_documents({"role": "client", "tenant_id": tid})
    live_count = await db.lives.count_documents({"tenant_id": tid})
    pending_shipments = await db.shipments.count_documents({"status": {"$ne": "delivered"}, "tenant_id": tid})
    top_customers = await db.purchases.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$customer_id", "user_id": {"$first": "$user_id"}, "total_spent": {"$sum": "$total"}, "purchase_count": {"$sum": 1}}},
        {"$sort": {"total_spent": -1}}, {"$limit": 10}
    ]).to_list(10)
    # Add client names to top customers
    for customer in top_customers:
        user = await db.users.find_one({"customer_id": customer["_id"], "tenant_id": tid}, {"_id": 0, "name": 1})
        customer["name"] = user["name"] if user else "Sin nombre"
    return {
        "total_sales": total_sales[0]["total"] if total_sales else 0,
        "total_commissions": total_commissions[0]["total"] if total_commissions else 0,
        "client_count": client_count, "live_count": live_count,
        "pending_shipments": pending_shipments, "top_customers": top_customers
    }

@api_router.get("/admin/reports/business-stats")
async def get_business_stats(current_user: dict = Depends(get_current_user)):
    """Get detailed business statistics including sales by store, time-based trends, and profit analysis"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Total revenue, taxes, commissions, and profit
    revenue_stats = await db.purchases.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {
            "_id": None,
            "total_price": {"$sum": "$price"},
            "total_tax": {"$sum": "$tax"},
            "total_commission": {"$sum": "$commission"},
            "total_revenue": {"$sum": "$total"},
            "purchase_count": {"$sum": 1}
        }}
    ]).to_list(1)
    
    # Shipping revenue
    shipping_stats = await db.shipments.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {
            "_id": None,
            "total_shipping": {"$sum": "$shipping_cost"},
            "total_weight": {"$sum": "$weight_pounds"},
            "shipment_count": {"$sum": 1}
        }}
    ]).to_list(1)
    
    # Sales by store
    sales_by_store = await db.purchases.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {
            "_id": "$store",
            "total_sales": {"$sum": "$price"},
            "total_commission": {"$sum": "$commission"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"total_sales": -1}},
        {"$limit": 10}
    ]).to_list(10)
    
    # Sales by live
    sales_by_live = await db.lives.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$project": {
            "title": 1,
            "store": 1,
            "total_sales": 1,
            "total_commissions": 1,
            "purchase_count": 1,
            "status": 1,
            "created_at": 1
        }},
        {"$sort": {"created_at": -1}},
        {"$limit": 15}
    ]).to_list(15)
    
    # Sales trend by date (last 30 days)
    from datetime import timedelta
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    sales_by_date = await db.purchases.aggregate([
        {"$match": {"tenant_id": tid, "created_at": {"$gte": thirty_days_ago}}},
        {"$project": {
            "date": {"$substr": ["$created_at", 0, 10]},
            "price": 1,
            "commission": 1,
            "total": 1
        }},
        {"$group": {
            "_id": "$date",
            "sales": {"$sum": "$price"},
            "commissions": {"$sum": "$commission"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]).to_list(30)
    
    # Wallet deposits (approved) - total recharges received
    deposits_stats = await db.wallet_transactions.aggregate([
        {"$match": {"tenant_id": tid, "type": "deposit", "status": "approved"}},
        {"$group": {
            "_id": None,
            "total_deposits": {"$sum": "$amount"},
            "deposit_count": {"$sum": 1}
        }}
    ]).to_list(1)
    
    # Current wallet balances (money in the system)
    wallet_stats = await db.wallets.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {
            "_id": None,
            "total_balance": {"$sum": "$available"},
            "wallet_count": {"$sum": 1}
        }}
    ]).to_list(1)
    
    revenue = revenue_stats[0] if revenue_stats else {"total_price": 0, "total_tax": 0, "total_commission": 0, "total_revenue": 0, "purchase_count": 0}
    shipping = shipping_stats[0] if shipping_stats else {"total_shipping": 0, "total_weight": 0, "shipment_count": 0}
    deposits = deposits_stats[0] if deposits_stats else {"total_deposits": 0, "deposit_count": 0}
    wallets = wallet_stats[0] if wallet_stats else {"total_balance": 0, "wallet_count": 0}
    
    # Calculate profit (commissions + shipping = gross profit for the business)
    gross_profit = revenue["total_commission"] + shipping["total_shipping"]
    
    return {
        "revenue": {
            "total_product_sales": round(revenue["total_price"], 2),
            "total_tax_collected": round(revenue["total_tax"], 2),
            "total_commissions": round(revenue["total_commission"], 2),
            "total_charged_to_clients": round(revenue["total_revenue"], 2),
            "total_shipping": round(shipping["total_shipping"], 2),
            "gross_profit": round(gross_profit, 2),
            "purchase_count": revenue["purchase_count"],
            "shipment_count": shipping["shipment_count"],
            "total_weight_shipped": round(shipping["total_weight"], 2)
        },
        "wallets": {
            "total_deposits_received": round(deposits["total_deposits"], 2),
            "total_client_balance": round(wallets["total_balance"], 2),
            "client_count": wallets["wallet_count"]
        },
        "sales_by_store": [
            {"name": s["_id"] or "Sin tienda", "ventas": round(s["total_sales"], 2), "comisiones": round(s["total_commission"], 2), "cantidad": s["count"]}
            for s in sales_by_store
        ],
        "sales_by_live": [
            {"name": l.get("title", "N/A"), "store": l.get("store", "N/A"), "ventas": round(l.get("total_sales", 0), 2), "comisiones": round(l.get("total_commissions", 0), 2), "compras": l.get("purchase_count", 0), "status": l.get("status", "inactive")}
            for l in sales_by_live
        ],
        "sales_trend": [
            {"date": d["_id"], "ventas": round(d["sales"], 2), "comisiones": round(d["commissions"], 2), "cantidad": d["count"]}
            for d in sales_by_date
        ]
    }

@api_router.get("/admin/reports/clients-purchases")
async def get_all_clients_purchases_report(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    clients = await db.users.find({"role": "client", "tenant_id": tid}, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    if not clients:
        return []
    
    # Batch fetch all related data
    user_ids = [c["id"] for c in clients]
    
    # Fetch all wallets at once
    wallets_list = await db.wallets.find({"user_id": {"$in": user_ids}, "tenant_id": tid}, {"_id": 0}).to_list(len(user_ids))
    wallets_dict = {w["user_id"]: w for w in wallets_list}
    
    # Fetch all purchases at once (with limited fields for aggregation, full data separately)
    all_purchases = await db.purchases.find({"user_id": {"$in": user_ids}, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    purchases_by_user = {}
    for p in all_purchases:
        uid = p["user_id"]
        if uid not in purchases_by_user:
            purchases_by_user[uid] = []
        purchases_by_user[uid].append(p)
    
    # Fetch all shipments at once
    all_shipments = await db.shipments.find({"user_id": {"$in": user_ids}, "tenant_id": tid}, {"_id": 0}).to_list(5000)
    shipments_by_user = {}
    for s in all_shipments:
        uid = s["user_id"]
        if uid not in shipments_by_user:
            shipments_by_user[uid] = []
        shipments_by_user[uid].append(s)
    
    result = []
    for client in clients:
        uid = client["id"]
        wallet = wallets_dict.get(uid)
        wallet_balance = wallet["available"] if wallet else 0
        purchases = purchases_by_user.get(uid, [])
        shipments = shipments_by_user.get(uid, [])
        
        total_purchases = sum(p.get("total", 0) for p in purchases)
        total_commission = sum(p.get("commission", 0) for p in purchases)
        total_shipping = sum(s.get("shipping_cost", 0) for s in shipments)
        total_weight = sum(s.get("weight_pounds", 0) for s in shipments)
        pending_balance = wallet_balance - total_shipping
        
        result.append({
            "client": {
                "id": client["id"], "customer_id": client["customer_id"],
                "name": client["name"], "whatsapp": client["whatsapp"],
                "country": client["country"], "commission_fee": client.get("commission_fee", DEFAULT_COMMISSION_FEE)
            },
            "wallet_balance": round(wallet_balance, 2),
            "purchases": purchases[:500],  # Limit per client for response size
            "shipments": shipments,
            "purchase_count": len(purchases),
            "total_spent": round(total_purchases, 2),
            "total_commission": round(total_commission, 2),
            "total_shipping": round(total_shipping, 2),
            "total_weight_pounds": round(total_weight, 2),
            "pending_balance": round(pending_balance, 2)
        })
    return sorted(result, key=lambda x: x["pending_balance"])

@api_router.get("/admin/reports/all-purchases")
async def get_all_purchases_report(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    purchases = await db.purchases.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    
    if not purchases:
        return []
    
    # Batch fetch all users and lives in 2 queries instead of N*2
    user_ids = list(set(p["user_id"] for p in purchases))
    live_ids = list(set(p.get("live_id") for p in purchases if p.get("live_id")))
    
    users_list = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "customer_id": 1}).to_list(len(user_ids))
    users_dict = {u["id"]: u for u in users_list}
    
    lives_list = await db.lives.find({"id": {"$in": live_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(len(live_ids)) if live_ids else []
    lives_dict = {l["id"]: l["title"] for l in lives_list}
    
    for p in purchases:
        user = users_dict.get(p["user_id"])
        p["client_name"] = user["name"] if user else "Unknown"
        p["live_title"] = lives_dict.get(p.get("live_id"), "N/A")
    return purchases

# ==================== CLIENT DEBTS REPORT ====================

@api_router.get("/admin/reports/clients-debts")
async def get_clients_debts_report(current_user: dict = Depends(get_current_user)):
    """Get detailed report of client debts including creation date and pending balance"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get all clients
    clients = await db.users.find(
        {"role": "client", "tenant_id": tid}, 
        {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    
    if not clients:
        return {"clients": [], "summary": {"total_clients": 0, "clients_with_debt": 0, "total_debt": 0}}
    
    user_ids = [c["id"] for c in clients]
    
    # Batch fetch wallets
    wallets_list = await db.wallets.find(
        {"user_id": {"$in": user_ids}, "tenant_id": tid}, 
        {"_id": 0}
    ).to_list(len(user_ids))
    wallets_dict = {w["user_id"]: w for w in wallets_list}
    
    # Aggregate total purchases per client
    purchases_agg = await db.purchases.aggregate([
        {"$match": {"user_id": {"$in": user_ids}, "tenant_id": tid}},
        {"$group": {
            "_id": "$user_id", 
            "total_spent": {"$sum": "$total"}, 
            "purchase_count": {"$sum": 1}
        }}
    ]).to_list(len(user_ids))
    purchases_dict = {p["_id"]: p for p in purchases_agg}
    
    # Aggregate shipments per client
    shipments_agg = await db.shipments.aggregate([
        {"$match": {"user_id": {"$in": user_ids}, "tenant_id": tid}},
        {"$group": {
            "_id": "$user_id", 
            "total_shipping": {"$sum": "$shipping_cost"},
            "shipment_count": {"$sum": 1}
        }}
    ]).to_list(len(user_ids))
    shipments_dict = {s["_id"]: s for s in shipments_agg}
    
    result = []
    total_debt = 0
    clients_with_debt = 0
    
    for client in clients:
        uid = client["id"]
        wallet = wallets_dict.get(uid)
        wallet_balance = wallet["available"] if wallet else 0
        
        purch = purchases_dict.get(uid, {"total_spent": 0, "purchase_count": 0})
        ship = shipments_dict.get(uid, {"total_shipping": 0, "shipment_count": 0})
        
        # Pending balance = what client still owes (wallet balance - shipping costs)
        # Negative means they owe money
        pending_balance = round(wallet_balance - ship["total_shipping"], 2)
        
        # If pending_balance is negative, the client has debt
        debt_amount = abs(pending_balance) if pending_balance < 0 else 0
        
        if debt_amount > 0:
            total_debt += debt_amount
            clients_with_debt += 1
        
        result.append({
            "id": client["id"],
            "customer_id": client["customer_id"],
            "name": client["name"],
            "whatsapp": client.get("whatsapp", ""),
            "country": client.get("country", ""),
            "created_at": client.get("created_at", ""),
            "wallet_balance": round(wallet_balance, 2),
            "total_spent": round(purch["total_spent"], 2),
            "total_shipping": round(ship["total_shipping"], 2),
            "pending_balance": pending_balance,
            "debt_amount": debt_amount,
            "purchase_count": purch["purchase_count"],
            "shipment_count": ship["shipment_count"]
        })
    
    # Sort by debt amount (highest first), then by pending_balance (most negative first)
    result.sort(key=lambda x: (-x["debt_amount"], x["pending_balance"]))
    
    return {
        "clients": result,
        "summary": {
            "total_clients": len(clients),
            "clients_with_debt": clients_with_debt,
            "total_debt": round(total_debt, 2),
            "clients_positive_balance": len(clients) - clients_with_debt
        }
    }

@api_router.get("/admin/reports/store-profits")
async def get_store_profits_report(current_user: dict = Depends(get_current_user)):
    """Get profit report by store from completed lives"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get all completed lives with store invoice data
    lives = await db.lives.find(
        {"tenant_id": tid, "status": "completed"},
        {"_id": 0}
    ).sort("ended_at", -1).to_list(500)
    
    store_profits = []
    total_sales = 0
    total_store_cost = 0
    total_profit = 0
    
    for live in lives:
        store_amount = live.get("store_invoice_amount")
        store_image = live.get("store_invoice_image")
        live_total = live.get("total_sales", 0)
        live_commissions = live.get("total_commissions", 0)
        
        # Calculate profit if store amount exists
        profit = None
        if store_amount is not None:
            profit = live_total - store_amount
            total_store_cost += store_amount
            total_profit += profit
        
        total_sales += live_total
        
        store_profits.append({
            "live_id": live["id"],
            "live_title": live.get("title", "Sin título"),
            "store": live.get("store", "Sin tienda"),
            "date": live.get("ended_at") or live.get("started_at") or live.get("created_at"),
            "total_sales": round(live_total, 2),
            "total_commissions": round(live_commissions, 2),
            "purchase_count": live.get("purchase_count", 0),
            "store_invoice_amount": round(store_amount, 2) if store_amount else None,
            "store_invoice_image": store_image,
            "profit": round(profit, 2) if profit is not None else None,
            "profit_margin": round((profit / live_total * 100), 1) if profit is not None and live_total > 0 else None
        })
    
    return {
        "stores": store_profits,
        "summary": {
            "total_lives": len(lives),
            "lives_with_invoice": len([l for l in store_profits if l["store_invoice_amount"] is not None]),
            "total_sales": round(total_sales, 2),
            "total_store_cost": round(total_store_cost, 2),
            "total_profit": round(total_profit, 2),
            "avg_profit_margin": round((total_profit / total_store_cost * 100), 1) if total_store_cost > 0 else 0
        }
    }

# ==================== SETTINGS ====================

@api_router.get("/admin/settings/referral-bonus")
async def get_referral_bonus_setting(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    bonus = await get_referral_bonus(current_user["tenant_id"])
    return {"referral_bonus": bonus}

@api_router.put("/admin/settings/referral-bonus")
async def set_referral_bonus_setting(amount: float, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if amount < 0:
        raise HTTPException(status_code=400, detail="El bono no puede ser negativo")
    tid = current_user["tenant_id"]
    await db.settings.update_one({"key": "referral_bonus", "tenant_id": tid},
        {"$set": {"key": "referral_bonus", "tenant_id": tid, "value": amount}}, upsert=True)
    return {"message": f"Bono de referido actualizado a ${amount:.2f}", "referral_bonus": amount}

@api_router.get("/admin/settings")
async def get_tenant_settings(current_user: dict = Depends(get_current_user)):
    """Get all tenant settings including tax options and client ID settings"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    default_tax_options = [
        {"value": "8.25", "label": "8.25%"},
        {"value": "10", "label": "10%"},
        {"value": "15", "label": "15%"},
        {"value": "0", "label": "Sin Taxes"},
        {"value": "other", "label": "Otro"}
    ]
    return {
        "tax_options": tenant.get("tax_options", default_tax_options) if tenant else default_tax_options,
        "referral_bonus": await get_referral_bonus(tid),
        "allow_custom_client_id": tenant.get("allow_custom_client_id", False) if tenant else False,
        "shipment_show_product_list": tenant.get("shipment_show_product_list", True) if tenant else True,
        "invoice_show_tax_per_item": tenant.get("invoice_show_tax_per_item", True) if tenant else True,
        "invoice_show_tax_summary": tenant.get("invoice_show_tax_summary", True) if tenant else True
    }

@api_router.put("/admin/settings/tax-options")
async def update_tenant_tax_options(data: dict, current_user: dict = Depends(get_current_user)):
    """Update tax options for the tenant"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    tax_options = data.get("tax_options", [])
    if not tax_options:
        raise HTTPException(status_code=400, detail="Se requieren opciones de impuestos")
    await db.tenants.update_one({"id": tid}, {"$set": {"tax_options": tax_options}})
    return {"message": "Opciones de impuestos actualizadas", "tax_options": tax_options}

@api_router.get("/admin/referrals")
async def get_referral_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    top_referrers = await db.users.find({"referral_count": {"$gt": 0}, "tenant_id": tid},
        {"_id": 0, "customer_id": 1, "name": 1, "referral_count": 1}).sort("referral_count", -1).limit(20).to_list(20)
    referral_bonuses = await db.wallet_transactions.aggregate([
        {"$match": {"type": "referral_bonus", "tenant_id": tid}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    return {"top_referrers": top_referrers, "total_bonus_paid": referral_bonuses[0]["total"] if referral_bonuses else 0,
        "current_bonus": await get_referral_bonus(tid)}

# ==================== TEMPORARY ACCESS TOKENS ====================

@api_router.post("/auth/generate-access-token")
async def generate_temporary_access_token(data: dict, current_user: dict = Depends(get_current_user)):
    """Generate a temporary access token for QR code access to client dashboard"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    customer_id = data.get("customer_id")
    invoice_id = data.get("invoice_id")
    
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id es requerido")
    
    tid = current_user["tenant_id"]
    
    # Find the user
    user = await db.users.find_one({"customer_id": customer_id, "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    # Create temporary token
    token_data = TemporaryAccessToken(
        tenant_id=tid,
        user_id=user["id"],
        customer_id=customer_id,
        invoice_id=invoice_id
    )
    
    await db.temp_access_tokens.insert_one(token_data.model_dump())
    
    return {"token": token_data.token, "expires_at": token_data.expires_at}

@api_router.get("/auth/verify-access-token/{token}")
async def verify_temporary_access_token(token: str):
    """Verify and use a temporary access token - returns JWT for client dashboard access"""
    
    # Find the token
    token_doc = await db.temp_access_tokens.find_one({"token": token}, {"_id": 0})
    
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token inválido o expirado")
    
    # Check if already used - but allow grace period of 30 seconds for duplicate requests
    if token_doc.get("used"):
        used_at = token_doc.get("used_at")
        if used_at:
            used_time = datetime.fromisoformat(used_at.replace("Z", "+00:00"))
            grace_period = timedelta(seconds=30)
            if datetime.now(timezone.utc) - used_time > grace_period:
                raise HTTPException(status_code=400, detail="Este enlace ya fue utilizado")
            # Within grace period - allow the request but don't update anything
        else:
            raise HTTPException(status_code=400, detail="Este enlace ya fue utilizado")
    else:
        # Mark as used (first time)
        await db.temp_access_tokens.update_one(
            {"token": token},
            {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    # Check expiration
    expires_at = datetime.fromisoformat(token_doc["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Este enlace ha expirado")
    
    # Get user and tenant info
    user = await db.users.find_one({"id": token_doc["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    tenant = await db.tenants.find_one({"id": token_doc["tenant_id"]}, {"_id": 0})
    
    # Generate JWT token for the client
    jwt_token = create_token(user["id"], user["role"], token_doc["tenant_id"])
    
    return {
        "token": jwt_token,
        "user_id": user["id"],
        "customer_id": user["customer_id"],
        "name": user["name"],
        "role": user["role"],
        "tenant_id": token_doc["tenant_id"],
        "tenant_name": tenant["business_name"] if tenant else None,
        "tenant_logo": tenant.get("logo_url") if tenant else None,
        "invoice_id": token_doc.get("invoice_id"),
        "message": "Acceso temporal verificado"
    }

# ==================== EMPLOYEE MANAGEMENT ====================

@api_router.get("/admin/employees")
async def get_employees(current_user: dict = Depends(get_current_user)):
    """Get all employees for the tenant"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    employees = await db.employees.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    return employees

@api_router.post("/admin/employees")
async def create_employee(data: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    """Create a new employee"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Check if email already exists
    existing = await db.employees.find_one({"email": data.email, "tenant_id": tid}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un empleado con este email")
    
    # Also check in users collection
    existing_user = await db.users.find_one({"email": data.email, "tenant_id": tid}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este email")
    
    # Create permissions object
    permissions = EmployeePermissions(**data.permissions)
    
    employee = Employee(
        tenant_id=tid,
        name=data.name,
        email=data.email,
        whatsapp=data.whatsapp,
        password_plain=data.password,  # Store plain text for admin viewing
        password_hash=hash_password(data.password),
        permissions=permissions,
        created_by=current_user["user_id"]
    )
    
    await db.employees.insert_one(employee.model_dump())
    
    # Get admin name for audit
    admin = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    admin_name = admin["name"] if admin else "Admin"
    
    # Log audit
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=admin_name,
        user_role="admin",
        action="create_employee",
        entity_type="employee",
        entity_id=employee.id,
        entity_name=data.name,
        details={"email": data.email, "permissions": data.permissions}
    )
    
    return {"message": "Empleado creado exitosamente", "employee_id": employee.id}

@api_router.get("/admin/employees/{employee_id}")
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """Get employee details including password"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    employee = await db.employees.find_one({"id": employee_id, "tenant_id": tid}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    
    return employee

@api_router.put("/admin/employees/{employee_id}")
async def update_employee(employee_id: str, data: EmployeeUpdate, current_user: dict = Depends(get_current_user)):
    """Update employee information"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    employee = await db.employees.find_one({"id": employee_id, "tenant_id": tid}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    changes = {}
    
    if data.name is not None:
        update_data["name"] = data.name
        changes["name"] = data.name
    if data.email is not None:
        # Check if new email is already in use
        existing = await db.employees.find_one({
            "email": data.email, 
            "tenant_id": tid, 
            "id": {"$ne": employee_id}
        }, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Email ya está en uso")
        update_data["email"] = data.email
        changes["email"] = data.email
    if data.whatsapp is not None:
        update_data["whatsapp"] = data.whatsapp
        changes["whatsapp"] = data.whatsapp
    if data.password is not None:
        update_data["password_plain"] = data.password
        update_data["password_hash"] = hash_password(data.password)
        changes["password"] = "***changed***"
    if data.permissions is not None:
        update_data["permissions"] = data.permissions
        changes["permissions"] = data.permissions
    if data.status is not None:
        update_data["status"] = data.status
        changes["status"] = data.status
    
    await db.employees.update_one({"id": employee_id}, {"$set": update_data})
    
    # Get admin name for audit
    admin = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    admin_name = admin["name"] if admin else "Admin"
    
    # Log audit
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=admin_name,
        user_role="admin",
        action="update_employee",
        entity_type="employee",
        entity_id=employee_id,
        entity_name=employee["name"],
        details=changes
    )
    
    return {"message": "Empleado actualizado exitosamente"}

@api_router.delete("/admin/employees/{employee_id}")
async def delete_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an employee"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    employee = await db.employees.find_one({"id": employee_id, "tenant_id": tid}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    
    await db.employees.delete_one({"id": employee_id})
    
    # Get admin name for audit
    admin = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    admin_name = admin["name"] if admin else "Admin"
    
    # Log audit
    await log_audit_action(
        tenant_id=tid,
        user_id=current_user["user_id"],
        user_name=admin_name,
        user_role="admin",
        action="delete_employee",
        entity_type="employee",
        entity_id=employee_id,
        entity_name=employee["name"]
    )
    
    return {"message": "Empleado eliminado exitosamente"}

# ==================== AUDIT LOG ====================

@api_router.get("/admin/audit-logs")
async def get_audit_logs(
    current_user: dict = Depends(get_current_user),
    user_id: str = None,
    action: str = None,
    entity_type: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 100,
    skip: int = 0
):
    """Get audit logs with filtering options"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    query = {"tenant_id": tid}
    
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    total = await db.audit_logs.count_documents(query)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "total": total,
        "logs": logs,
        "limit": limit,
        "skip": skip
    }

@api_router.get("/admin/audit-logs/users")
async def get_audit_users(current_user: dict = Depends(get_current_user)):
    """Get list of users who have audit logs"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    
    # Get unique users from audit logs
    pipeline = [
        {"$match": {"tenant_id": tid}},
        {"$group": {
            "_id": {"user_id": "$user_id", "user_name": "$user_name", "user_role": "$user_role"}
        }},
        {"$project": {
            "_id": 0,
            "user_id": "$_id.user_id",
            "user_name": "$_id.user_name",
            "user_role": "$_id.user_role"
        }}
    ]
    users = await db.audit_logs.aggregate(pipeline).to_list(100)
    return users

@api_router.get("/admin/audit-logs/actions")
async def get_audit_actions(current_user: dict = Depends(get_current_user)):
    """Get list of action types"""
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    # Return predefined action types
    return [
        {"value": "login", "label": "Inicio de sesión"},
        {"value": "create_client", "label": "Crear cliente"},
        {"value": "update_client", "label": "Editar cliente"},
        {"value": "delete_client", "label": "Eliminar cliente"},
        {"value": "create_purchase", "label": "Crear compra"},
        {"value": "update_purchase", "label": "Editar compra"},
        {"value": "delete_purchase", "label": "Eliminar compra"},
        {"value": "approve_recharge", "label": "Aprobar recarga"},
        {"value": "reject_recharge", "label": "Rechazar recarga"},
        {"value": "adjust_wallet", "label": "Ajustar saldo"},
        {"value": "create_shipment", "label": "Crear envío"},
        {"value": "update_shipment", "label": "Editar envío"},
        {"value": "delete_shipment", "label": "Eliminar envío"},
        {"value": "create_invoice", "label": "Crear factura"},
        {"value": "approve_invoice", "label": "Aprobar factura"},
        {"value": "reopen_invoice", "label": "Reabrir factura"},
        {"value": "create_live", "label": "Crear live"},
        {"value": "start_live", "label": "Iniciar live"},
        {"value": "end_live", "label": "Finalizar live"},
        {"value": "create_employee", "label": "Crear empleado"},
        {"value": "update_employee", "label": "Editar empleado"},
        {"value": "delete_employee", "label": "Eliminar empleado"}
    ]

# ==================== HEALTH ====================

@api_router.get("/")
async def root():
    return {"message": "OUTLETS USA EC SaaS API - Multi-Tenant Live Shopping Platform"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# ==================== APP SETUP ====================

app.include_router(api_router)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
