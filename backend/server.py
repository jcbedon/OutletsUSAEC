from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import random
import string
import hashlib

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="OUTLETS USA EC - Live Shopping API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
COMMISSION_FEE = 3.0  # USD
LOW_BALANCE_THRESHOLD = 9.0  # USD
DEFAULT_REFERRAL_BONUS = 5.0  # USD - Configurable by admin

# ==================== MODELS ====================

class UserCreate(BaseModel):
    name: str
    country: str
    whatsapp: str
    email: Optional[str] = None
    whatsapp_consent: bool = False
    password: str
    referral_code: Optional[str] = None  # Code of who referred this user

class UserLogin(BaseModel):
    identifier: str  # Can be email, whatsapp, or customer_id
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str  # Format: X1234 (letter + 4 digits)
    referral_code: str = ""  # Unique code for sharing (same as customer_id)
    referred_by: Optional[str] = None  # customer_id of referrer
    referral_count: int = 0  # Number of successful referrals
    name: str
    country: str
    whatsapp: str
    email: Optional[str] = None
    whatsapp_consent: bool = False
    password_hash: str
    role: str = "client"  # client or admin
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Wallet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    customer_id: str
    available: float = 0.0
    reserved: float = 0.0
    pending_adjustment: float = 0.0
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WalletTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    customer_id: str
    type: str  # deposit, purchase, adjustment, refund
    amount: float
    balance_after: float
    description: str
    status: str = "pending"  # pending, approved, rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_at: Optional[str] = None

class WalletDepositRequest(BaseModel):
    user_id: str
    amount: float
    description: Optional[str] = "Recarga de saldo"

class Live(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    status: str = "inactive"  # active, inactive, completed
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    total_sales: float = 0.0
    total_commissions: float = 0.0
    purchase_count: int = 0

class LiveCreate(BaseModel):
    title: str

class PurchaseCreate(BaseModel):
    customer_id: str
    item_name: str
    store: str
    price: float
    live_id: str

class Purchase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    customer_id: str
    item_name: str
    store: str
    price: float
    commission: float = COMMISSION_FEE
    total: float = 0.0  # price + commission
    status: str = "confirmed"  # confirmed, adjusted, cancelled
    live_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ShipmentCreate(BaseModel):
    user_id: str
    purchase_ids: List[str]
    shipping_type: str  # with_family, without_family, custom
    shipping_cost: float  # Admin defines the price
    address: str
    country: str
    phone: str
    additional_info: Optional[str] = None

class Shipment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    customer_id: str
    purchase_ids: List[str]
    shipping_type: str
    shipping_cost: float
    address: str
    country: str
    phone: str
    additional_info: Optional[str] = None
    tracking_number: Optional[str] = None
    status: str = "preparing"  # preparing, in_transit, delivered
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    customer_id: str
    type: str  # wallet_credited, purchase_created, low_balance, shipment_created, shipment_delivered
    title: str
    message: str
    whatsapp_sent: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ==================== HELPER FUNCTIONS ====================

def generate_customer_id(name: str) -> str:
    """Generate unique customer ID: first letter of name + 4 random digits"""
    letter = name[0].upper() if name else 'X'
    digits = ''.join(random.choices(string.digits, k=4))
    return f"{letter}{digits}"

def hash_password(password: str) -> str:
    """Simple password hashing"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    return hash_password(password) == password_hash

async def create_notification(user_id: str, customer_id: str, notif_type: str, title: str, message: str):
    """Create a notification and optionally send via WhatsApp"""
    notification = Notification(
        user_id=user_id,
        customer_id=customer_id,
        type=notif_type,
        title=title,
        message=message
    )
    await db.notifications.insert_one(notification.model_dump())
    # WhatsApp integration placeholder - will be configured later
    logger.info(f"Notification created: {notif_type} for {customer_id}")
    return notification

async def check_low_balance(user_id: str, customer_id: str, balance: float):
    """Check if balance is low and create notification"""
    if balance < LOW_BALANCE_THRESHOLD:
        await create_notification(
            user_id=user_id,
            customer_id=customer_id,
            notif_type="low_balance",
            title="Saldo Bajo",
            message=f"Tu saldo actual es ${balance:.2f} USD. Recarga para seguir comprando."
        )

async def get_referral_bonus():
    """Get current referral bonus from settings"""
    settings = await db.settings.find_one({"key": "referral_bonus"}, {"_id": 0})
    if settings:
        return settings.get("value", DEFAULT_REFERRAL_BONUS)
    return DEFAULT_REFERRAL_BONUS

async def process_referral(referrer_customer_id: str, new_user_id: str, new_customer_id: str):
    """Process referral bonus for both users"""
    referrer = await db.users.find_one({"customer_id": referrer_customer_id.upper()}, {"_id": 0})
    if not referrer:
        return False
    
    bonus = await get_referral_bonus()
    if bonus <= 0:
        return False
    
    # Credit bonus to referrer
    referrer_wallet = await db.wallets.find_one({"user_id": referrer["id"]}, {"_id": 0})
    if referrer_wallet:
        new_balance = referrer_wallet["available"] + bonus
        await db.wallets.update_one(
            {"user_id": referrer["id"]},
            {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        # Record transaction
        tx = WalletTransaction(
            user_id=referrer["id"],
            customer_id=referrer_customer_id.upper(),
            type="referral_bonus",
            amount=bonus,
            balance_after=new_balance,
            description=f"Bono por referir a #{new_customer_id}",
            status="approved",
            approved_at=datetime.now(timezone.utc).isoformat()
        )
        await db.wallet_transactions.insert_one(tx.model_dump())
        await create_notification(
            user_id=referrer["id"],
            customer_id=referrer_customer_id.upper(),
            notif_type="referral_bonus",
            title="¡Bono de Referido!",
            message=f"Recibiste ${bonus:.2f} USD por referir a un nuevo cliente. ¡Gracias!"
        )
        # Update referral count
        await db.users.update_one(
            {"id": referrer["id"]},
            {"$inc": {"referral_count": 1}}
        )
    
    # Credit bonus to new user
    new_wallet = await db.wallets.find_one({"user_id": new_user_id}, {"_id": 0})
    if new_wallet:
        new_balance = new_wallet["available"] + bonus
        await db.wallets.update_one(
            {"user_id": new_user_id},
            {"$set": {"available": new_balance, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        tx = WalletTransaction(
            user_id=new_user_id,
            customer_id=new_customer_id,
            type="referral_bonus",
            amount=bonus,
            balance_after=new_balance,
            description=f"Bono de bienvenida por código de #{referrer_customer_id.upper()}",
            status="approved",
            approved_at=datetime.now(timezone.utc).isoformat()
        )
        await db.wallet_transactions.insert_one(tx.model_dump())
        await create_notification(
            user_id=new_user_id,
            customer_id=new_customer_id,
            notif_type="referral_bonus",
            title="¡Bono de Bienvenida!",
            message=f"Recibiste ${bonus:.2f} USD por usar un código de referido. ¡Disfruta!"
        )
    
    return True

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    """Register a new client"""
    # Check if whatsapp or email already exists
    existing = await db.users.find_one({
        "$or": [
            {"whatsapp": user_data.whatsapp},
            {"email": user_data.email} if user_data.email else {"_id": None}
        ]
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail="Usuario ya registrado con este WhatsApp o email")
    
    # Validate referral code if provided
    referred_by = None
    if user_data.referral_code:
        referrer = await db.users.find_one({"customer_id": user_data.referral_code.upper()}, {"_id": 0})
        if referrer:
            referred_by = user_data.referral_code.upper()
    
    # Generate unique customer_id
    customer_id = generate_customer_id(user_data.name)
    while await db.users.find_one({"customer_id": customer_id}, {"_id": 0}):
        customer_id = generate_customer_id(user_data.name)
    
    user = User(
        customer_id=customer_id,
        referral_code=customer_id,  # Same as customer_id for sharing
        referred_by=referred_by,
        name=user_data.name,
        country=user_data.country,
        whatsapp=user_data.whatsapp,
        email=user_data.email,
        whatsapp_consent=user_data.whatsapp_consent,
        password_hash=hash_password(user_data.password),
        role="client"
    )
    
    await db.users.insert_one(user.model_dump())
    
    # Create wallet for the user
    wallet = Wallet(
        user_id=user.id,
        customer_id=customer_id
    )
    await db.wallets.insert_one(wallet.model_dump())
    
    # Create welcome notification
    await create_notification(
        user_id=user.id,
        customer_id=customer_id,
        notif_type="welcome",
        title="¡Bienvenido a OUTLETS USA EC!",
        message=f"Tu ID de cliente es #{customer_id}. Usa este ID para tus compras en vivo."
    )
    
    # Process referral bonus if applicable
    if referred_by:
        await process_referral(referred_by, user.id, customer_id)
    
    return {
        "message": "Usuario registrado exitosamente",
        "user_id": user.id,
        "customer_id": customer_id,
        "referral_code": customer_id
    }

@api_router.post("/auth/login")
async def login_user(login_data: UserLogin):
    """Login with email, whatsapp, or customer_id"""
    user = await db.users.find_one({
        "$or": [
            {"email": login_data.identifier},
            {"whatsapp": login_data.identifier},
            {"customer_id": login_data.identifier.upper()}
        ]
    }, {"_id": 0})
    
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    return {
        "message": "Login exitoso",
        "user_id": user["id"],
        "customer_id": user["customer_id"],
        "name": user["name"],
        "role": user["role"]
    }

@api_router.get("/auth/user/{user_id}")
async def get_user(user_id: str):
    """Get user details"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

# ==================== WALLET ENDPOINTS ====================

@api_router.get("/wallet/{user_id}")
async def get_wallet(user_id: str):
    """Get wallet balance for a user"""
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    return wallet

@api_router.get("/wallet/by-customer/{customer_id}")
async def get_wallet_by_customer_id(customer_id: str):
    """Get wallet by customer ID"""
    wallet = await db.wallets.find_one({"customer_id": customer_id.upper()}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    return wallet

@api_router.post("/wallet/deposit-request")
async def request_deposit(deposit: WalletDepositRequest):
    """Client requests a deposit (pending admin approval)"""
    wallet = await db.wallets.find_one({"user_id": deposit.user_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    
    transaction = WalletTransaction(
        user_id=deposit.user_id,
        customer_id=wallet["customer_id"],
        type="deposit",
        amount=deposit.amount,
        balance_after=wallet["available"],  # Will be updated on approval
        description=deposit.description,
        status="pending"
    )
    
    await db.wallet_transactions.insert_one(transaction.model_dump())
    
    return {
        "message": "Solicitud de recarga enviada. Pendiente de aprobación.",
        "transaction_id": transaction.id
    }

@api_router.post("/wallet/approve-deposit/{transaction_id}")
async def approve_deposit(transaction_id: str):
    """Admin approves a deposit request"""
    transaction = await db.wallet_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    
    if transaction["status"] != "pending":
        raise HTTPException(status_code=400, detail="Transacción ya procesada")
    
    # Update wallet balance
    wallet = await db.wallets.find_one({"user_id": transaction["user_id"]}, {"_id": 0})
    new_balance = wallet["available"] + transaction["amount"]
    
    await db.wallets.update_one(
        {"user_id": transaction["user_id"]},
        {"$set": {
            "available": new_balance,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update transaction
    await db.wallet_transactions.update_one(
        {"id": transaction_id},
        {"$set": {
            "status": "approved",
            "balance_after": new_balance,
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create notification
    await create_notification(
        user_id=transaction["user_id"],
        customer_id=transaction["customer_id"],
        notif_type="wallet_credited",
        title="Saldo Acreditado",
        message=f"Se han acreditado ${transaction['amount']:.2f} USD a tu wallet. Saldo actual: ${new_balance:.2f} USD"
    )
    
    return {
        "message": "Depósito aprobado",
        "new_balance": new_balance
    }

@api_router.get("/wallet/transactions/{user_id}")
async def get_wallet_transactions(user_id: str, limit: int = 50):
    """Get wallet transaction history"""
    transactions = await db.wallet_transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return transactions

@api_router.get("/wallet/pending-deposits")
async def get_pending_deposits():
    """Admin: Get all pending deposit requests"""
    transactions = await db.wallet_transactions.find(
        {"type": "deposit", "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with user data
    result = []
    for t in transactions:
        user = await db.users.find_one({"id": t["user_id"]}, {"_id": 0, "name": 1, "customer_id": 1})
        result.append({**t, "user_name": user["name"] if user else "Unknown"})
    
    return result

# ==================== LIVE SHOPPING ENDPOINTS ====================

@api_router.post("/lives")
async def create_live(live_data: LiveCreate):
    """Admin: Create a new live session"""
    live = Live(title=live_data.title)
    await db.lives.insert_one(live.model_dump())
    return {"message": "Live creado", "live_id": live.id}

@api_router.post("/lives/{live_id}/start")
async def start_live(live_id: str):
    """Admin: Start a live session"""
    result = await db.lives.update_one(
        {"id": live_id},
        {"$set": {
            "status": "active",
            "started_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return {"message": "Live iniciado"}

@api_router.post("/lives/{live_id}/end")
async def end_live(live_id: str):
    """Admin: End a live session"""
    result = await db.lives.update_one(
        {"id": live_id},
        {"$set": {
            "status": "completed",
            "ended_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return {"message": "Live finalizado"}

@api_router.get("/lives")
async def get_lives(status: Optional[str] = None):
    """Get all lives, optionally filtered by status"""
    query = {}
    if status:
        query["status"] = status
    lives = await db.lives.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return lives

@api_router.get("/lives/active")
async def get_active_live():
    """Get currently active live"""
    live = await db.lives.find_one({"status": "active"}, {"_id": 0})
    return live

@api_router.get("/lives/{live_id}")
async def get_live(live_id: str):
    """Get live details"""
    live = await db.lives.find_one({"id": live_id}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    return live

# ==================== PURCHASE ENDPOINTS (LIVE SHOPPING) ====================

@api_router.post("/purchases")
async def create_purchase(purchase_data: PurchaseCreate):
    """Admin: Register a purchase during live (FAST - < 10 seconds)"""
    # Find user by customer_id
    user = await db.users.find_one({"customer_id": purchase_data.customer_id.upper()}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet no encontrada")
    
    total = purchase_data.price + COMMISSION_FEE
    
    if wallet["available"] < total:
        raise HTTPException(
            status_code=400, 
            detail=f"Saldo insuficiente. Disponible: ${wallet['available']:.2f}, Requerido: ${total:.2f}"
        )
    
    # Create purchase
    purchase = Purchase(
        user_id=user["id"],
        customer_id=purchase_data.customer_id.upper(),
        item_name=purchase_data.item_name,
        store=purchase_data.store,
        price=purchase_data.price,
        commission=COMMISSION_FEE,
        total=total,
        live_id=purchase_data.live_id
    )
    
    await db.purchases.insert_one(purchase.model_dump())
    
    # Deduct from wallet
    new_balance = wallet["available"] - total
    await db.wallets.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "available": new_balance,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Record transaction
    transaction = WalletTransaction(
        user_id=user["id"],
        customer_id=purchase_data.customer_id.upper(),
        type="purchase",
        amount=-total,
        balance_after=new_balance,
        description=f"Compra: {purchase_data.item_name} ({purchase_data.store})",
        status="approved",
        approved_at=datetime.now(timezone.utc).isoformat()
    )
    await db.wallet_transactions.insert_one(transaction.model_dump())
    
    # Update live stats
    await db.lives.update_one(
        {"id": purchase_data.live_id},
        {"$inc": {
            "total_sales": purchase_data.price,
            "total_commissions": COMMISSION_FEE,
            "purchase_count": 1
        }}
    )
    
    # Create notification
    await create_notification(
        user_id=user["id"],
        customer_id=purchase_data.customer_id.upper(),
        notif_type="purchase_created",
        title="Compra Registrada",
        message=f"Compraste {purchase_data.item_name} por ${purchase_data.price:.2f} + ${COMMISSION_FEE:.2f} comisión. Saldo restante: ${new_balance:.2f}"
    )
    
    # Check low balance
    await check_low_balance(user["id"], purchase_data.customer_id.upper(), new_balance)
    
    return {
        "message": "Compra registrada",
        "purchase_id": purchase.id,
        "total": total,
        "new_balance": new_balance,
        "customer_name": user["name"]
    }

@api_router.get("/purchases/user/{user_id}")
async def get_user_purchases(user_id: str, limit: int = 50):
    """Get purchase history for a user"""
    purchases = await db.purchases.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return purchases

@api_router.get("/purchases/live/{live_id}")
async def get_live_purchases(live_id: str):
    """Get all purchases for a live session"""
    purchases = await db.purchases.find(
        {"live_id": live_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return purchases

@api_router.get("/purchases/pending-shipment/{user_id}")
async def get_pending_shipment_purchases(user_id: str):
    """Get purchases that haven't been shipped yet"""
    # Get all purchases for user
    all_purchases = await db.purchases.find(
        {"user_id": user_id, "status": "confirmed"},
        {"_id": 0}
    ).to_list(500)
    
    # Get all shipments for user
    shipments = await db.shipments.find(
        {"user_id": user_id},
        {"_id": 0, "purchase_ids": 1}
    ).to_list(500)
    
    # Get shipped purchase IDs
    shipped_ids = set()
    for s in shipments:
        shipped_ids.update(s.get("purchase_ids", []))
    
    # Filter unshipped purchases
    pending = [p for p in all_purchases if p["id"] not in shipped_ids]
    return pending

# ==================== SHIPMENT ENDPOINTS ====================

@api_router.post("/shipments")
async def create_shipment(shipment_data: ShipmentCreate):
    """Admin: Create a shipment with custom price"""
    user = await db.users.find_one({"id": shipment_data.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Use the price provided by admin
    shipping_cost = shipment_data.shipping_cost
    
    shipment = Shipment(
        user_id=shipment_data.user_id,
        customer_id=user["customer_id"],
        purchase_ids=shipment_data.purchase_ids,
        shipping_type=shipment_data.shipping_type,
        shipping_cost=shipping_cost,
        address=shipment_data.address,
        country=shipment_data.country,
        phone=shipment_data.phone,
        additional_info=shipment_data.additional_info
    )
    
    await db.shipments.insert_one(shipment.model_dump())
    
    # Create notification
    await create_notification(
        user_id=shipment_data.user_id,
        customer_id=user["customer_id"],
        notif_type="shipment_created",
        title="Envío Creado",
        message=f"Tu envío ha sido creado. Costo de envío: ${shipping_cost:.2f} USD"
    )
    
    return {
        "message": "Envío creado",
        "shipment_id": shipment.id,
        "shipping_cost": shipping_cost
    }

@api_router.put("/shipments/{shipment_id}/tracking")
async def update_tracking(shipment_id: str, tracking_number: str):
    """Admin: Update tracking number"""
    result = await db.shipments.update_one(
        {"id": shipment_id},
        {"$set": {
            "tracking_number": tracking_number,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    return {"message": "Tracking actualizado"}

@api_router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: str, status: str):
    """Admin: Update shipment status"""
    if status not in ["preparing", "in_transit", "delivered"]:
        raise HTTPException(status_code=400, detail="Estado inválido")
    
    shipment = await db.shipments.find_one({"id": shipment_id}, {"_id": 0})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    
    await db.shipments.update_one(
        {"id": shipment_id},
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create notification for delivered status
    if status == "delivered":
        await create_notification(
            user_id=shipment["user_id"],
            customer_id=shipment["customer_id"],
            notif_type="shipment_delivered",
            title="¡Envío Entregado!",
            message="Tu pedido ha sido entregado. ¡Gracias por tu compra!"
        )
    
    return {"message": f"Estado actualizado a {status}"}

@api_router.get("/shipments/user/{user_id}")
async def get_user_shipments(user_id: str):
    """Get all shipments for a user"""
    shipments = await db.shipments.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return shipments

@api_router.get("/shipments")
async def get_all_shipments(status: Optional[str] = None):
    """Admin: Get all shipments"""
    query = {}
    if status:
        query["status"] = status
    shipments = await db.shipments.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Enrich with user data
    result = []
    for s in shipments:
        user = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "name": 1})
        result.append({**s, "user_name": user["name"] if user else "Unknown"})
    
    return result

# ==================== NOTIFICATIONS ENDPOINTS ====================

@api_router.get("/notifications/{user_id}")
async def get_user_notifications(user_id: str, limit: int = 50):
    """Get notifications for a user"""
    notifications = await db.notifications.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return notifications

# ==================== ADMIN/REPORTS ENDPOINTS ====================

@api_router.get("/admin/clients")
async def get_all_clients():
    """Admin: Get all clients with wallet info"""
    users = await db.users.find(
        {"role": "client"},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(1000)
    
    result = []
    for user in users:
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        result.append({
            **user,
            "wallet_balance": wallet["available"] if wallet else 0
        })
    
    return result

@api_router.get("/admin/clients/active")
async def get_active_clients():
    """Admin: Get clients with positive wallet balance"""
    wallets = await db.wallets.find(
        {"available": {"$gt": 0}},
        {"_id": 0}
    ).to_list(1000)
    
    result = []
    for wallet in wallets:
        user = await db.users.find_one(
            {"id": wallet["user_id"]},
            {"_id": 0, "password_hash": 0}
        )
        if user:
            result.append({
                **user,
                "wallet_balance": wallet["available"]
            })
    
    return sorted(result, key=lambda x: x["wallet_balance"], reverse=True)

@api_router.get("/admin/reports/live/{live_id}")
async def get_live_report(live_id: str):
    """Admin: Get detailed report for a live session"""
    live = await db.lives.find_one({"id": live_id}, {"_id": 0})
    if not live:
        raise HTTPException(status_code=404, detail="Live no encontrado")
    
    purchases = await db.purchases.find(
        {"live_id": live_id},
        {"_id": 0}
    ).to_list(500)
    
    # Group by customer
    customer_totals = {}
    for p in purchases:
        cid = p["customer_id"]
        if cid not in customer_totals:
            customer_totals[cid] = {"count": 0, "total": 0}
        customer_totals[cid]["count"] += 1
        customer_totals[cid]["total"] += p["total"]
    
    return {
        "live": live,
        "purchases": purchases,
        "customer_summary": customer_totals,
        "total_sales": live.get("total_sales", 0),
        "total_commissions": live.get("total_commissions", 0),
        "purchase_count": live.get("purchase_count", 0)
    }

@api_router.get("/admin/reports/summary")
async def get_reports_summary():
    """Admin: Get overall business summary"""
    # Total sales
    total_sales = await db.purchases.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$price"}}}
    ]).to_list(1)
    
    # Total commissions
    total_commissions = await db.purchases.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$commission"}}}
    ]).to_list(1)
    
    # Client count
    client_count = await db.users.count_documents({"role": "client"})
    
    # Live count
    live_count = await db.lives.count_documents({})
    
    # Pending shipments
    pending_shipments = await db.shipments.count_documents({"status": {"$ne": "delivered"}})
    
    # Top customers
    top_customers = await db.purchases.aggregate([
        {"$group": {"_id": "$customer_id", "total_spent": {"$sum": "$total"}, "purchase_count": {"$sum": 1}}},
        {"$sort": {"total_spent": -1}},
        {"$limit": 10}
    ]).to_list(10)
    
    return {
        "total_sales": total_sales[0]["total"] if total_sales else 0,
        "total_commissions": total_commissions[0]["total"] if total_commissions else 0,
        "client_count": client_count,
        "live_count": live_count,
        "pending_shipments": pending_shipments,
        "top_customers": top_customers
    }

# ==================== SETTINGS ENDPOINTS ====================

@api_router.get("/admin/settings/referral-bonus")
async def get_referral_bonus_setting():
    """Admin: Get current referral bonus"""
    bonus = await get_referral_bonus()
    return {"referral_bonus": bonus}

@api_router.put("/admin/settings/referral-bonus")
async def set_referral_bonus_setting(amount: float):
    """Admin: Set referral bonus amount"""
    if amount < 0:
        raise HTTPException(status_code=400, detail="El bono no puede ser negativo")
    
    await db.settings.update_one(
        {"key": "referral_bonus"},
        {"$set": {"key": "referral_bonus", "value": amount}},
        upsert=True
    )
    
    return {"message": f"Bono de referido actualizado a ${amount:.2f}", "referral_bonus": amount}

@api_router.get("/admin/referrals")
async def get_referral_stats():
    """Admin: Get referral statistics"""
    # Users with referrals
    top_referrers = await db.users.find(
        {"referral_count": {"$gt": 0}},
        {"_id": 0, "customer_id": 1, "name": 1, "referral_count": 1}
    ).sort("referral_count", -1).limit(20).to_list(20)
    
    # Total referral bonuses paid
    referral_bonuses = await db.wallet_transactions.aggregate([
        {"$match": {"type": "referral_bonus"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    total_bonus_paid = referral_bonuses[0]["total"] if referral_bonuses else 0
    
    return {
        "top_referrers": top_referrers,
        "total_bonus_paid": total_bonus_paid,
        "current_bonus": await get_referral_bonus()
    }

# ==================== SEED ADMIN ====================

@api_router.post("/admin/seed")
async def seed_admin():
    """Create default admin user if not exists"""
    existing = await db.users.find_one({"role": "admin"}, {"_id": 0})
    if existing:
        return {"message": "Admin ya existe", "customer_id": existing["customer_id"]}
    
    admin = User(
        customer_id="ADMIN",
        name="Administrador",
        country="Ecuador",
        whatsapp="+593000000000",
        email="admin@outletsusaec.com",
        password_hash=hash_password("admin123"),
        role="admin"
    )
    
    await db.users.insert_one(admin.model_dump())
    
    return {
        "message": "Admin creado",
        "customer_id": "ADMIN",
        "email": "admin@outletsusaec.com",
        "password": "admin123"
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "OUTLETS USA EC API - Live Shopping Platform"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

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
