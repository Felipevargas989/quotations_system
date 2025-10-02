import { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { updateCompany } from "../../../services/companies.service";
import { uploadCompanyLogo } from "../../../services/storage.service";

export default function CompanyConfiguration() {
  const { company, loadUserProfile } = useAuth();

  const [name, setName] = useState(company?.name || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    company?.logo_url || null,
  );
  const [primaryColor, setPrimaryColor] = useState(
    company?.colors?.primary || "#667eea",
  );
  const [secondaryColor, setSecondaryColor] = useState(
    company?.colors?.secondary || "#059669",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Update local state when auth context changes
  useEffect(() => {
    setName(company?.name || "");
    setLogoPreview(company?.logo_url || null);
    setPrimaryColor(company?.colors?.primary || "#667eea");
    setSecondaryColor(company?.colors?.secondary || "#059669");
  }, [company]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        setErrorMessage(
          "Tipo de archivo no válido. Solo se permiten imágenes (JPG, PNG, WebP)",
        );
        return;
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        setErrorMessage("El archivo es demasiado grande. Máximo 5MB");
        return;
      }

      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
      setErrorMessage("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    // Validate colors
    if (!primaryColor || !secondaryColor) {
      setErrorMessage("Ambos colores (primario y secundario) son requeridos");
      setIsLoading(false);
      return;
    }

    try {
      let logoUrl = company?.logo_url;

      // Upload logo if a new file is selected
      if (logoFile && company?.id) {
        const uploadResult = await uploadCompanyLogo(
          company?.id.toString(),
          logoFile,
        );
        if (uploadResult.success && uploadResult.url) {
          logoUrl = uploadResult.url;
        } else {
          throw new Error(uploadResult.error || "Error al subir el logo");
        }
      }

      // Prepare colors object
      const colors = {
        primary: primaryColor,
        secondary: secondaryColor,
      };

      // Update company name, logo URL, and colors
      await updateCompany(name, logoUrl || undefined, colors);

      // Refresh user profile to get updated data
      await loadUserProfile();

      setSuccessMessage("Información de la empresa actualizada exitosamente");
      setLogoFile(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al actualizar la empresa",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Configuración de la Empresa</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Name */}
        <div>
          <label
            htmlFor="companyName"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Nombre de la Empresa
          </label>
          <input
            type="text"
            id="companyName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Company Logo */}
        <div>
          <label
            htmlFor="companyLogo"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Logo de la Empresa
          </label>

          {logoPreview && (
            <div className="mb-4">
              <img
                src={logoPreview}
                alt="Company Logo Preview"
                className="w-32 h-32 object-contain border border-gray-300 rounded-md"
              />
            </div>
          )}

          <input
            id="companyLogo"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleLogoChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">
            Formatos permitidos: JPG, PNG, WebP. Tamaño máximo: 5MB
          </p>
        </div>

        {/* Brand Colors */}
        <div>
          <div className="block text-sm font-medium text-gray-700 mb-3">
            Colores de Marca
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Color */}
            <div>
              <label
                htmlFor="primaryColor"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                Color Primario
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="primaryColor"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-12 w-20 border border-gray-300 rounded-md cursor-pointer"
                  required
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="#667eea"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Usado en encabezados y elementos principales
              </p>
            </div>

            {/* Secondary Color */}
            <div>
              <label
                htmlFor="secondaryColor"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                Color Secundario
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="secondaryColor"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-12 w-20 border border-gray-300 rounded-md cursor-pointer"
                  required
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="#059669"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Usado en secciones de servicios y detalles
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Estos colores se aplicarán automáticamente en las cotizaciones
            generadas en PDF
          </p>
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="p-3 bg-green-100 text-green-700 rounded-md">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-red-100 text-red-700 rounded-md">
            {errorMessage}
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
