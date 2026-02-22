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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"

UPLOAD_DIR = ROOT_DIR / "uploads"
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
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

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
    address: str
    country: str
    phone: str
    additional_info: Optional[str] = None
    tracking_number: Optional[str] = None
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
    tax_type: str = "illinois"  # "none", "illinois" (8.25%), "custom" (15%)
    apply_commission: bool = True
    commission_amount: float = 0

class ShipmentCreate(BaseModel):
    user_id: str
    purchase_ids: List[str]
    shipping_type: str
    shipping_cost: float
    weight_pounds: float = 0
    address: str
    country: str
    phone: str
    additional_info: Optional[str] = None

class WalletDepositRequest(BaseModel):
    user_id: str
    amount: float
    description: Optional[str] = "Recarga de saldo"

class CreateTenantRequest(BaseModel):
    business_name: str
    slug: str
    owner_name: str
    email: str
    admin_name: str
    admin_email: str
    admin_password: str
    admin_whatsapp: str
    admin_country: str

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

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register_user(data: UserRegister):
    tenant = await db.tenants.find_one({"slug": data.tenant_slug.lower(), "status": "active"}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Código de negocio no encontrado")
    tenant_id = tenant["id"]
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
    user = await db.users.find_one({
        "$or": [
            {"email": login_data.identifier},
            {"whatsapp": login_data.identifier},
            {"customer_id": login_data.identifier.upper()}
        ]
    }, {"_id": 0})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
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
    existing_email = await db.users.find_one({"email": data.admin_email}, {"_id": 0})
    if existing_email:
        raise HTTPException(status_code=400, detail="Este email de admin ya está registrado")
    tenant = Tenant(business_name=data.business_name, slug=slug, owner_name=data.owner_name, email=data.email)
    await db.tenants.insert_one(tenant.model_dump())
    customer_id = generate_customer_id(data.admin_name)
    while await db.users.find_one({"customer_id": customer_id}, {"_id": 0}):
        customer_id = generate_customer_id(data.admin_name)
    admin = User(tenant_id=tenant.id, customer_id=customer_id, referral_code=customer_id,
        name=data.admin_name, country=data.admin_country, whatsapp=data.admin_whatsapp,
        email=data.admin_email, password_hash=hash_password(data.admin_password), role="admin")
    await db.users.insert_one(admin.model_dump())
    return {
        "message": "Tenant y admin creados",
        "tenant_id": tenant.id,
        "tenant_slug": slug,
        "admin_id": admin.id,
        "admin_email": data.admin_email
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
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    tenant = await db.tenants.find_one({"id": current_user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return tenant

@api_router.post("/admin/tenant/logo")
async def upload_tenant_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
async def get_all_clients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    users = await db.users.find({"role": "client", "tenant_id": tid}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    
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
    
    result = []
    for user in users:
        uid = user["id"]
        wallet = wallets_dict.get(uid)
        wallet_balance = wallet["available"] if wallet else 0
        purch = purchases_dict.get(uid, {"total": 0, "count": 0})
        total_shipping = shipments_dict.get(uid, 0)
        pending_balance = wallet_balance - total_shipping
        result.append({
            **user, 
            "wallet_balance": round(wallet_balance, 2),
            "total_purchases": round(purch["total"], 2),
            "total_shipping": round(total_shipping, 2),
            "pending_balance": round(pending_balance, 2),
            "purchase_count": purch["count"]
        })
    return result

@api_router.post("/admin/clients/create")
async def admin_create_client(data: AdminClientCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    existing = await db.users.find_one({"whatsapp": data.whatsapp, "tenant_id": tid}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este WhatsApp")
    customer_id = generate_customer_id(data.name)
    while await db.users.find_one({"customer_id": customer_id, "tenant_id": tid}, {"_id": 0}):
        customer_id = generate_customer_id(data.name)
    user = User(tenant_id=tid, customer_id=customer_id, referral_code=customer_id,
        commission_fee=data.commission_fee, name=data.name, country=data.country,
        whatsapp=data.whatsapp, email=data.email, whatsapp_consent=True,
        password_hash=hash_password(data.password), role="client")
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

@api_router.get("/admin/clients/active")
async def get_active_clients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
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
    return {"message": "Depósito aprobado", "new_balance": new_balance}

@api_router.post("/wallet/reject-deposit/{transaction_id}")
async def reject_deposit(transaction_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    transaction = await db.wallet_transactions.find_one({"id": transaction_id, "tenant_id": tid}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if transaction["status"] != "pending":
        raise HTTPException(status_code=400, detail="Transacción ya procesada")
    await db.wallet_transactions.update_one({"id": transaction_id, "tenant_id": tid},
        {"$set": {"status": "rejected", "approved_at": datetime.now(timezone.utc).isoformat()}})
    await create_notification(tid, transaction["user_id"], transaction["customer_id"], "deposit_rejected",
        "Recarga Rechazada", f"Tu solicitud de recarga por ${transaction['amount']:.2f} USD ha sido rechazada. Contacta al administrador para más información.")
    return {"message": "Depósito rechazado"}

class AdminBalanceAdjustment(BaseModel):
    user_id: str
    amount: float
    description: str

@api_router.post("/wallet/admin-adjustment")
async def admin_balance_adjustment(data: AdminBalanceAdjustment, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
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
    return {"message": "Ajuste realizado", "new_balance": new_balance, "amount_deducted": data.amount}

# ==================== LIVE SHOPPING ENDPOINTS ====================

@api_router.post("/lives")
async def create_live(live_data: LiveCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    live = Live(tenant_id=current_user["tenant_id"], title=live_data.title, store=live_data.store)
    await db.lives.insert_one(live.model_dump())
    return {"message": "Live creado", "live_id": live.id}

@api_router.post("/lives/{live_id}/start")
async def start_live(live_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    result = await db.lives.update_one({"id": live_id, "tenant_id": current_user["tenant_id"]},
        {"$set": {"status": "active", "started_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return {"message": "Live iniciado"}

@api_router.post("/lives/{live_id}/end")
async def end_live(live_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    result = await db.lives.update_one({"id": live_id, "tenant_id": current_user["tenant_id"]},
        {"$set": {"status": "completed", "ended_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return {"message": "Live finalizado"}

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

# ==================== PURCHASE ENDPOINTS ====================

CUSTOM_TAX_RATE = 0.15  # 15% custom tax

@api_router.post("/purchases")
async def create_purchase(purchase_data: PurchaseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    user = await db.users.find_one({"customer_id": purchase_data.customer_id.upper(), "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    wallet = await db.wallets.find_one({"user_id": user["id"], "tenant_id": tid}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    # Calculate tax based on tax_type
    if purchase_data.tax_type == "illinois":
        tax = round(purchase_data.price * ILLINOIS_TAX_RATE, 2)
    elif purchase_data.tax_type == "custom":
        tax = round(purchase_data.price * CUSTOM_TAX_RATE, 2)
    else:
        tax = 0
    commission_fee = purchase_data.commission_amount if purchase_data.apply_commission else 0
    price_with_tax = round(purchase_data.price + tax, 2)
    total = round(price_with_tax + commission_fee, 2)
    purchase = Purchase(tenant_id=tid, user_id=user["id"], customer_id=purchase_data.customer_id.upper(),
        item_name=purchase_data.item_name, store=purchase_data.store, price=purchase_data.price,
        tax=tax, price_with_tax=price_with_tax, commission=commission_fee, total=total, live_id=purchase_data.live_id)
    await db.purchases.insert_one(purchase.model_dump())
    new_balance = wallet["available"] - total
    await db.wallets.update_one({"user_id": user["id"], "tenant_id": tid},
        {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}})
    transaction = WalletTransaction(tenant_id=tid, user_id=user["id"], customer_id=purchase_data.customer_id.upper(),
        type="purchase", amount=-total, balance_after=new_balance,
        description=f"Compra: {purchase_data.item_name} ({purchase_data.store}) - Total: ${total:.2f}", status="approved",
        approved_at=datetime.now(timezone.utc).isoformat(), purchase_id=purchase.id)
    await db.wallet_transactions.insert_one(transaction.model_dump())
    await db.lives.update_one({"id": purchase_data.live_id, "tenant_id": tid},
        {"$inc": {"total_sales": price_with_tax, "total_commissions": commission_fee, "purchase_count": 1}})
    await create_notification(tid, user["id"], purchase_data.customer_id.upper(), "purchase_created",
        "Compra Registrada",
        f"Compraste {purchase_data.item_name} - Precio: ${purchase_data.price:.2f} + Tax: ${tax:.2f} + Comisión: ${commission_fee:.2f} = Total: ${total:.2f}. Saldo: ${new_balance:.2f}")
    await check_low_balance(tid, user["id"], purchase_data.customer_id.upper(), new_balance)
    return {
        "message": "Compra registrada", "purchase_id": purchase.id, "price": purchase_data.price,
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

@api_router.put("/purchases/{purchase_id}")
async def update_purchase(purchase_id: str, data: PurchaseUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    user = await db.users.find_one({"id": shipment_data.user_id, "tenant_id": tid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    shipment = Shipment(tenant_id=tid, user_id=shipment_data.user_id, customer_id=user["customer_id"],
        purchase_ids=shipment_data.purchase_ids, shipping_type=shipment_data.shipping_type,
        shipping_cost=shipment_data.shipping_cost, weight_pounds=shipment_data.weight_pounds,
        address=shipment_data.address, country=shipment_data.country, phone=shipment_data.phone, 
        additional_info=shipment_data.additional_info)
    await db.shipments.insert_one(shipment.model_dump())
    await create_notification(tid, shipment_data.user_id, user["customer_id"], "shipment_created",
        "Envío Creado", f"Tu envío ha sido creado. Peso: {shipment_data.weight_pounds} lbs. Costo: ${shipment_data.shipping_cost:.2f} USD")
    return {"message": "Envío creado", "shipment_id": shipment.id, "shipping_cost": shipment_data.shipping_cost, "weight_pounds": shipment_data.weight_pounds}

@api_router.put("/shipments/{shipment_id}/tracking")
async def update_tracking(shipment_id: str, tracking_number: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    result = await db.shipments.update_one({"id": shipment_id, "tenant_id": current_user["tenant_id"]},
        {"$set": {"tracking_number": tracking_number, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    return {"message": "Tracking actualizado"}

@api_router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: str, status: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    shipment = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    
    # Save file
    upload_dir = Path("uploads/shipments")
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_ext = Path(file.filename).suffix
    filename = f"{shipment_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = upload_dir / filename
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    file_url = f"/uploads/shipments/{filename}"
    
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
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    shipment = await db.shipments.find_one({"id": shipment_id, "tenant_id": tid}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    await db.shipments.delete_one({"id": shipment_id, "tenant_id": tid})
    await create_notification(tid, shipment["user_id"], shipment["customer_id"], "shipment_deleted",
        "Envío Eliminado", "Un envío ha sido eliminado de tu cuenta.")
    return {"message": "Envío eliminado"}

# ==================== NOTIFICATIONS ====================

@api_router.get("/notifications/{user_id}")
async def get_user_notifications(user_id: str, current_user: dict = Depends(get_current_user)):
    tid = current_user["tenant_id"]
    notifications = await db.notifications.find({"user_id": user_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return notifications

# ==================== REPORTS ====================

@api_router.get("/admin/reports/live/{live_id}")
async def get_live_report(live_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
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
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    tid = current_user["tenant_id"]
    purchases = await db.purchases.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    for p in purchases:
        user = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "name": 1, "customer_id": 1})
        p["client_name"] = user["name"] if user else "Unknown"
        live = await db.lives.find_one({"id": p.get("live_id")}, {"_id": 0, "title": 1})
        p["live_title"] = live["title"] if live else "N/A"
    return purchases

# ==================== SETTINGS ====================

@api_router.get("/admin/settings/referral-bonus")
async def get_referral_bonus_setting(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    bonus = await get_referral_bonus(current_user["tenant_id"])
    return {"referral_bonus": bonus}

@api_router.put("/admin/settings/referral-bonus")
async def set_referral_bonus_setting(amount: float, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    if amount < 0:
        raise HTTPException(status_code=400, detail="El bono no puede ser negativo")
    tid = current_user["tenant_id"]
    await db.settings.update_one({"key": "referral_bonus", "tenant_id": tid},
        {"$set": {"key": "referral_bonus", "tenant_id": tid, "value": amount}}, upsert=True)
    return {"message": f"Bono de referido actualizado a ${amount:.2f}", "referral_bonus": amount}

@api_router.get("/admin/referrals")
async def get_referral_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
