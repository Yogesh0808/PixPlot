import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { FormatProvider } from "@/components/ui/format-selector";

createRoot(document.getElementById("root")!).render(
  <FormatProvider>
    <App />
  </FormatProvider>
);
