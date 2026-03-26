import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Loader2 } from "lucide-react";
import ManagerDashboard from "./ManagerDashboard";
import EmployeeDashboard from "./EmployeeDashboard";
import AdminDashboard from "./AdminDashboard";

export default function Dashboard() {
  const navigate = useNavigate();
  const { role, loading } = useAuth();

  useEffect(() => {
    if (!loading && !role) navigate("/");
  }, [loading, role, navigate]);

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "#fafaf9" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#b91c1c" }} />
      </div>
    );
  }

  switch (role) {
    case "manager":  return <ManagerDashboard />;
    case "employee": return <EmployeeDashboard />;
    case "admin":    return <AdminDashboard />;
    default:         return null;
  }
}