import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Analytics } from "@vercel/analytics/next"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpeedInsights />
    <Analytics />
    <App />
  </StrictMode>
)
