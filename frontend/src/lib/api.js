import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem("outletsusa_user");
  if (stored) {
    const user = JSON.parse(stored);
    if (user.token) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
  }
  return config;
});

// Auth
export const registerUser = (data) => api.post("/auth/register", data);
export const loginUser = (data) => api.post("/auth/login", data);
export const getUser = (userId) => api.get(`/auth/user/${userId}`);

// Superadmin
export const seedSuperadmin = () => api.post("/superadmin/seed");
export const getSuperadminStats = () => api.get("/superadmin/stats");
export const listTenants = () => api.get("/superadmin/tenants");
export const createTenant = (data) => api.post("/superadmin/tenants", data);
export const updateTenantStatus = (tenantId, status) => api.put(`/superadmin/tenants/${tenantId}?status=${status}`);
export const createAdminForTenant = (tenantId, data) => api.post(`/superadmin/tenants/${tenantId}/admin`, data);

// Admin Tenant
export const getMyTenant = () => api.get("/admin/tenant");
export const uploadTenantLogo = (formData) => api.post("/admin/tenant/logo", formData, { headers: { "Content-Type": "multipart/form-data" } });

// Wallet
export const getWallet = (userId) => api.get(`/wallet/${userId}`);
export const getWalletByCustomerId = (customerId) => api.get(`/wallet/by-customer/${customerId}`);
export const requestDeposit = (data) => api.post("/wallet/deposit-request", data);
export const requestDepositWithProof = (formData) => api.post("/wallet/deposit-request-with-proof", formData, { headers: { "Content-Type": "multipart/form-data" } });
export const approveDeposit = (transactionId) => api.post(`/wallet/approve-deposit/${transactionId}`);
export const rejectDeposit = (transactionId) => api.post(`/wallet/reject-deposit/${transactionId}`);
export const getAllDeposits = () => api.get("/wallet/all-deposits");
export const adminBalanceAdjustment = (data) => api.post("/wallet/admin-adjustment", data);
export const getWalletTransactions = (userId) => api.get(`/wallet/transactions/${userId}`);
export const getPendingDeposits = () => api.get("/wallet/pending-deposits");

// Lives
export const createLive = (data) => api.post("/lives", data);
export const startLive = (liveId) => api.post(`/lives/${liveId}/start`);
export const endLive = (liveId) => api.post(`/lives/${liveId}/end`);
export const getLives = (status) => api.get("/lives", { params: { status } });
export const getActiveLive = () => api.get("/lives/active");
export const getLive = (liveId) => api.get(`/lives/${liveId}`);

// Purchases
export const createPurchase = (data) => api.post("/purchases", data);
export const getUserPurchases = (userId) => api.get(`/purchases/user/${userId}`);
export const updatePurchase = (purchaseId, data) => api.put(`/purchases/${purchaseId}`, data);
export const deletePurchase = (purchaseId) => api.delete(`/purchases/${purchaseId}`);
export const getLivePurchases = (liveId) => api.get(`/purchases/live/${liveId}`);
export const getPendingShipmentPurchases = (userId) => api.get(`/purchases/pending-shipment/${userId}`);

// Shipments
export const createShipment = (data) => api.post("/shipments", data);
export const updateTracking = (shipmentId, trackingNumber) =>
  api.put(`/shipments/${shipmentId}/tracking`, null, { params: { tracking_number: trackingNumber } });
export const updateShipmentStatus = (shipmentId, status) =>
  api.put(`/shipments/${shipmentId}/status`, null, { params: { status } });
export const updateShipment = (shipmentId, data) => api.put(`/shipments/${shipmentId}`, data);
export const deleteShipment = (shipmentId) => api.delete(`/shipments/${shipmentId}`);
export const getUserShipments = (userId) => api.get(`/shipments/user/${userId}`);
export const getAllShipments = (status) => api.get("/shipments", { params: { status } });
export const uploadShipmentAttachment = (shipmentId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post(`/shipments/${shipmentId}/attachments`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
};

// Notifications
export const getUserNotifications = (userId) => api.get(`/notifications/${userId}`);

// Admin
export const getAllClients = () => api.get("/admin/clients");
export const getActiveClients = () => api.get("/admin/clients/active");
export const createClient = (data) => api.post("/admin/clients/create", data);
export const updateClientCommission = (userId, commissionFee) =>
  api.put(`/admin/clients/${userId}/commission?commission_fee=${commissionFee}`);
export const updateClient = (userId, data) => api.put(`/admin/clients/${userId}`, data);
export const getClientInfo = (customerId) => api.get(`/admin/clients/${customerId}/info`);
export const getLiveReport = (liveId) => api.get(`/admin/reports/live/${liveId}`);
export const getReportsSummary = () => api.get("/admin/reports/summary");
export const getClientsPurchasesReport = () => api.get("/admin/reports/clients-purchases");
export const getAllPurchasesReport = () => api.get("/admin/reports/all-purchases");

// Settings - Referrals
export const getReferralBonus = () => api.get("/admin/settings/referral-bonus");
export const setReferralBonus = (amount) => api.put(`/admin/settings/referral-bonus?amount=${amount}`);
export const getReferralStats = () => api.get("/admin/referrals");

export default api;
