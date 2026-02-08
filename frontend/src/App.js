import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect, createContext, useContext } from "react";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ClientDashboard from "@/pages/ClientDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminLive from "@/pages/AdminLive";
import AdminClients from "@/pages/AdminClients";
import AdminWallet from "@/pages/AdminWallet";
import AdminShipments from "@/pages/AdminShipments";
import AdminReports from "@/pages/AdminReports";
import AdminReferrals from "@/pages/AdminReferrals";
import SuperadminDashboard from "@/pages/SuperadminDashboard";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("outletsusa_user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem("outletsusa_user", JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("outletsusa_user");
  };

  const updateTenantLogo = (logoUrl) => {
    if (user) {
      const updated = { ...user, tenant_logo: logoUrl };
      setUser(updated);
      localStorage.setItem("outletsusa_user", JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateTenantLogo }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === "superadmin") return <Navigate to="/superadmin" replace />;
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["client"]}><ClientDashboard /></ProtectedRoute>} />

          <Route path="/superadmin" element={<ProtectedRoute allowedRoles={["superadmin"]}><SuperadminDashboard /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/live" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLive /></ProtectedRoute>} />
          <Route path="/admin/clients" element={<ProtectedRoute allowedRoles={["admin"]}><AdminClients /></ProtectedRoute>} />
          <Route path="/admin/wallet" element={<ProtectedRoute allowedRoles={["admin"]}><AdminWallet /></ProtectedRoute>} />
          <Route path="/admin/shipments" element={<ProtectedRoute allowedRoles={["admin"]}><AdminShipments /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={["admin"]}><AdminReports /></ProtectedRoute>} />
          <Route path="/admin/referrals" element={<ProtectedRoute allowedRoles={["admin"]}><AdminReferrals /></ProtectedRoute>} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
