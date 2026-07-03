/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          50: "#f4f8f7",
          100: "#dce9e6",
          500: "#3c7a73",
          700: "#285852",
          900: "#163533"
        }
      }
    }
  },
  plugins: []
};
