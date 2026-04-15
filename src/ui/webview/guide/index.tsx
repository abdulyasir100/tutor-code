import React from 'react'
import { createRoot } from 'react-dom/client'

function GuidePanel() {
  return <div>Guide Panel — Phase 1 Scaffold</div>
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<GuidePanel />)
}
