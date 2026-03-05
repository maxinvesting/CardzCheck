import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#ebefff",
          200: "#d6ddff",
          500: "#4557d4",
          700: "#2c3ba8",
          900: "#101649"
        }
      }
    }
  },
  plugins: [],
};

export default config;
