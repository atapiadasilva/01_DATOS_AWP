import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          deep:     '#0C1E4F', // Azul Profundo
          electric: '#00BFFF', // Azul Eléctrico (Acentos)
          slate:    '#3C4A57', // Gris Pizarra
          cloud:    '#F0F4F7', // Gris Claro (Fondo)
          orange:   '#FF9800', // Acento Naranja
          DEFAULT:  '#0C1E4F',
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
