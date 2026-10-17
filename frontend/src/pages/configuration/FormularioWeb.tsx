import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";

// EL ENLACE PÚBLICO DEL FORMULARIO (Mi empresa → Formulario web).
//
// Vivía como botón «Enlace Público» en Requerimientos. Felipe, 17-10-2026:
// "me choca que está ahí (…) es algo como de configuración, quizá eso
// podríamos llevarlo a mi empresa", solo para el administrador. En su
// lugar, arriba de Requerimientos, quedó «✨ Generar todas».
export default function FormularioWeb() {
  const { company } = useAuth();
  const [copiado, setCopiado] = useState(false);

  // SIEMPRE el dominio productivo (Felipe, 23-07): aunque el equipo
  // entre por el alias de Netlify o localhost, el enlace que se
  // comparte con clientes lleva la marca eventi-app.com.
  const enlace = company?.id
    ? `https://www.eventi-app.com/public-quotation/${company.id}`
    : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  };

  return (
    <div className="max-w-2xl space-y-6 rounded-lg bg-white p-6 shadow">
      <div className="flex items-center gap-2">
        <Share2 className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">
          Enlace público de cotización
        </h2>
      </div>

      <div className="rounded border-l-4 border-blue-500 bg-blue-50 p-4">
        <p className="mb-2 text-sm text-blue-900">
          <strong>📢 Comparte este enlace con tus clientes</strong>
        </p>
        <ul className="ml-4 list-disc space-y-1 text-sm text-blue-800">
          <li>Los clientes envían su solicitud de cotización directamente.</li>
          <li>
            Puedes compartirlo por WhatsApp, redes sociales o tu sitio web.
          </li>
          <li>
            Cada solicitud llega como un requerimiento nuevo, o como consulta si
            su tipo de evento va al embudo.
          </li>
          <li>Recibes un aviso de cada solicitud.</li>
        </ul>
      </div>

      <div>
        <label
          htmlFor="enlace-publico"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Tu enlace público:
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-gray-300 bg-gray-100 px-4 py-3">
            <code
              id="enlace-publico"
              className="break-all text-sm text-gray-800"
            >
              {enlace}
            </code>
          </div>
          <button
            type="button"
            onClick={copiar}
            disabled={!enlace}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-white transition-all ${
              copiado ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {copiado ? <Check size={20} /> : <Copy size={20} />}
            <span>{copiado ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      </div>

      {enlace && (
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          <ExternalLink size={16} />
          <span>Abrir el formulario en otra pestaña (vista previa)</span>
        </a>
      )}

      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-medium text-gray-700">
          💡 Formas de compartirlo:
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-3">
            <p className="mb-1 text-xs font-semibold text-green-800">
              WhatsApp
            </p>
            <p className="text-xs text-green-700">En chats o estados</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="mb-1 text-xs font-semibold text-blue-800">
              Redes sociales
            </p>
            <p className="text-xs text-blue-700">Facebook, Instagram…</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-3">
            <p className="mb-1 text-xs font-semibold text-purple-800">
              Sitio web
            </p>
            <p className="text-xs text-purple-700">Como botón en tu página</p>
          </div>
        </div>
      </div>
    </div>
  );
}
