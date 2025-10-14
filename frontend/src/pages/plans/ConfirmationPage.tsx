import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { confirmPlan } from "../../services/plans.service";

export default function ConfirmationPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const fetchData = async () => {
      const resp = await confirmPlan();
      if (resp.error) {
        alert(
          "Error al confirmar el plan. Contacta a nuestro soporte al cliente.",
        );
      }
      navigate("/dashboard");
    };
    fetchData();
  }, []);

  return <div>Cargando...</div>;
}
