import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "./components/navigatino";

export default function CustomerSatisfactionSurveysPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to template view by default
    navigate("/customer-satisfaction-survey/template", { replace: true });
  }, [navigate]);

  return (
    <div className="space-y-6">
      <Navigation basePath="/customer-satisfaction-survey" />
    </div>
  );
}
