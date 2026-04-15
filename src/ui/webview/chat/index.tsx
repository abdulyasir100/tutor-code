import React from 'react'
import { createRoot } from 'react-dom/client'

function ChatPanel() {
  return <div>Chat Panel — Phase 1 Scaffold</div>
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<ChatPanel />)
}
