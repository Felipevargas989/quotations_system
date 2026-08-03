import { useEffect } from "react";
import { toast } from "../../components/toast/Toast";
import { useNavigate } from "react-router-dom";
import { confirmPlan } from "../../services/plans.service";

export default function ConfirmationPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const fetchData = async () => {
      const resp = await confirmPlan();
      if (resp.error) {
        toast.error(
          "No se pudo confirmar el plan. Contacta a nuestro soporte al cliente.",
          { sticky: true },
        );
      }
      navigate("/dashboard");
    };
    fetchData();
  }, []);

  return <div>Cargando...</div>;
}
