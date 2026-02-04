import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  headers: {
    "Content-Type": "application/json",
  },
});

// Auth
export const registerUser = (data) => api.post("/auth/register", data);
export const loginUser = (data) => api.post("/auth/login", data);
export const getUser = (userId) => api.get(`/auth/user/${userId}`);

// Wallet
export const getWallet = (userId) => api.get(`/wallet/${userId}`);
export const getWalletByCustomerId = (customerId) => api.get(`/wallet/by-customer/${customerId}`);
export const requestDeposit = (data) => api.post("/wallet/deposit-request", data);
export const approveDeposit = (transactionId) => api.post(`/wallet/approve-deposit/${transactionId}`);
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
export const getLivePurchases = (liveId) => api.get(`/purchases/live/${liveId}`);
export const getPendingShipmentPurchases = (userId) => api.get(`/purchases/pending-shipment/${userId}`);

// Shipments
export const createShipment = (data) => api.post("/shipments", data);
export const updateTracking = (shipmentId, trackingNumber) => 
  api.put(`/shipments/${shipmentId}/tracking`, null, { params: { tracking_number: trackingNumber } });
export const updateShipmentStatus = (shipmentId, status) => 
  api.put(`/shipments/${shipmentId}/status`, null, { params: { status } });
export const getUserShipments = (userId) => api.get(`/shipments/user/${userId}`);
export const getAllShipments = (status) => api.get("/shipments", { params: { status } });

// Notifications
export const getUserNotifications = (userId) => api.get(`/notifications/${userId}`);

// Admin
export const getAllClients = () => api.get("/admin/clients");
export const getActiveClients = () => api.get("/admin/clients/active");
export const getLiveReport = (liveId) => api.get(`/admin/reports/live/${liveId}`);
export const getReportsSummary = () => api.get("/admin/reports/summary");
export const seedAdmin = () => api.post("/admin/seed");

// Settings - Referrals
export const getReferralBonus = () => api.get("/admin/settings/referral-bonus");
export const setReferralBonus = (amount) => api.put(`/admin/settings/referral-bonus?amount=${amount}`);
export const getReferralStats = () => api.get("/admin/referrals");

export default api;
