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
      },
      animation: {
        // Tres veces y para: una animación infinita en una pestaña que
        // uno mira todo el día terminaría siendo ruido que se ignora.
        vibrar: "vibrar 0.45s ease-in-out 3",
      },
    },
  },
  plugins: [],
};
