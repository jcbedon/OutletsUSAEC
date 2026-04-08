import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { verifyAccessToken } from "@/lib/api";
import { useAuth } from "../App";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AccessPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [status, setStatus] = useState("verifying"); // verifying, success, error
  const [message, setMessage] = useState("Verificando acceso...");
  const hasVerified = useRef(false);

  useEffect(() => {
    const verifyToken = async () => {
      // Prevent double verification (React Strict Mode or re-renders)
      if (hasVerified.current) return;
      hasVerified.current = true;
      
      try {
        const response = await verifyAccessToken(token);
        const data = response.data;
        
        // Login the user with the returned JWT
        login({
          token: data.token,
          user_id: data.user_id,
          customer_id: data.customer_id,
          name: data.name,
          role: data.role,
          tenant_id: data.tenant_id,
          tenant_name: data.tenant_name,
          tenant_logo: data.tenant_logo
        });
        
        setStatus("success");
        setMessage(`¡Bienvenido ${data.name}!`);
        
        // Redirect to dashboard after a brief delay
        setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 1500);
        
      } catch (error) {
        setStatus("error");
        const errorMessage = error.response?.data?.detail || "Enlace inválido o expirado";
        setMessage(errorMessage);
        
        // Redirect to login after showing error
        setTimeout(() => {
          navigate("/login", { replace: true });
        }, 3000);
      }
    };

    if (token) {
      verifyToken();
    } else {
      setStatus("error");
      setMessage("Token no proporcionado");
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    }
  }, [token, login, navigate]);

  return (
    <div className="app-bg min-h-screen flex items-center justify-center">
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-xl max-w-md w-full mx-4 text-center">
        {status === "verifying" && (
          <>
            <Loader2 className="h-16 w-16 text-blue-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Verificando acceso...</h2>
            <p className="text-slate-500">Por favor espera un momento</p>
          </>
        )}
        
        {status === "success" && (
          <>
            <div className="bg-green-100 rounded-full p-4 w-fit mx-auto mb-4">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-green-800 mb-2">{message}</h2>
            <p className="text-slate-500">Redirigiendo a tu dashboard...</p>
          </>
        )}
        
        {status === "error" && (
          <>
            <div className="bg-red-100 rounded-full p-4 w-fit mx-auto mb-4">
              <XCircle className="h-12 w-12 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-red-800 mb-2">Acceso Denegado</h2>
            <p className="text-slate-500">{message}</p>
            <p className="text-sm text-slate-400 mt-4">Redirigiendo al inicio de sesión...</p>
          </>
        )}
      </div>
    </div>
  );
}
