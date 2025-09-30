import { useAuth } from "../../../contexts/AuthContext";

export default function CompanyConfiguration() {
  const { companyName, companyLogoUrl } = useAuth();
  console.log(companyLogoUrl);

  return (
    <div>
      <div>{companyName}</div>
      <div>{companyLogoUrl}</div>
      <img src={companyLogoUrl} alt="Company Logo" />
    </div>
  );
}
