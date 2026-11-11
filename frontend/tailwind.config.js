/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        // Un temblorcito corto para llamar la atención sin marear
        // (07-08, pedido de Felipe para la pestaña Seguimiento cuando
        // hay un compromiso pendiente). Amplitud de 2px: se nota y no
        // parece que la pantalla estuviera fallando.
        vibrar: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-2px)" },
          "40%": { transform: "translateX(2px)" },
          "60%": { transform: "translateX(-2px)" },
          "80%": { transform: "translateX(2px)" },
        },
        // BelIA (doc 20 §8b). Con la misma regla de «vibrar»: todo termina,
        // salvo la respiración y las «z» de cuando duerme.
        "belia-saltito": {
          "0%, 100%": { transform: "translateY(0)" },
          "40%": { transform: "translateY(-7px)" },
          "70%": { transform: "translateY(-2px)" },
        },
        "belia-sacudida": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-7deg)" },
          "75%": { transform: "rotate(7deg)" },
        },
        "belia-respirar": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        "belia-zzz": {
          "0%": { transform: "translate(0, 0)", opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { transform: "translate(8px, -16px)", opacity: "0" },
        },
        // El check de la caja cerrada (doc 19 §9.47): el círculo y el visto
        // se dibujan una sola vez y quedan puestos. Parten sin trazo
        // (`backwards`) y terminan en el estado normal del dibujo, así que
        // sin animación (movimiento reducido) el check se ve completo.
        "caja-aparece": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "caja-trazo": {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
        "caja-texto": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        // Tres veces y para: una animación infinita en una pestaña que
        // uno mira todo el día terminaría siendo ruido que se ignora.
        vibrar: "vibrar 0.45s ease-in-out 3",
        "belia-saltito": "belia-saltito 0.7s ease-out 3",
        "belia-sacudida": "belia-sacudida 0.35s ease-in-out 3",
        "belia-respirar": "belia-respirar 4s ease-in-out infinite",
        "belia-zzz": "belia-zzz 2.6s ease-in-out infinite",
        "caja-aparece": "caja-aparece 0.45s ease-out both",
        "caja-circulo": "caja-trazo 0.6s ease-out 0.1s both",
        "caja-visto": "caja-trazo 0.35s ease-out 0.65s both",
        "caja-texto": "caja-texto 0.4s ease-out 0.9s both",
      },
    },
  },
  plugins: [],
};
