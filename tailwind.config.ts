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
          DEFAULT: '#1E3A8A',
          dark:    '#0F2544',
          hover:   '#1E40AF',
          light:   '#3B82F6',
          50:      '#EFF6FF',
          100:     '#DBEAFE',
          200:     '#BFDBFE',
        },
        banana: {
          DEFAULT: '#F5C518',
          light:   '#FEF9C3',
          dark:    '#D97706',
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
