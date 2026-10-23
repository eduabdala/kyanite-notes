import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LucideProvider } from 'lucide-react'
import './index.css'
import './i18n'
import './store/preferencesSync'
import './store/autoSync'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* classe comum a todos os ícones, usada para escalá-los via --icon-scale (Configurações > Aparência) */}
    <LucideProvider className="app-icon">
      <App />
    </LucideProvider>
  </StrictMode>,
)
