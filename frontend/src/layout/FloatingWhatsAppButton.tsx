import { MessageCircle } from "lucide-react";

export default function FloatingWhatsAppButton() {
  const handleWhatsAppClick = () => {
    window.open(
      "https://api.whatsapp.com/send/?phone=%2B56940589151&text&type=phone_number&app_absent=0&message=Hola, quiero hablar con ventas",
    );
  };

  return (
    <button
      onClick={handleWhatsAppClick}
      className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 z-50 flex items-center justify-center group"
      title="Contactar por WhatsApp"
    >
      <MessageCircle size={28} className="fill-white" />
      <span className="absolute right-full mr-3 bg-gray-900 text-white text-sm px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
        ¿Necesitas ayuda? Contáctanos
      </span>
    </button>
  );
}
