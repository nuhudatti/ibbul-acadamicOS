'use client'

import { useEffect } from 'react'

export function useSecureInput(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const blockPaste = (e: ClipboardEvent) => e.preventDefault()
    const blockCopy = (e: ClipboardEvent) => e.preventDefault()
    const blockContext = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('paste', blockPaste, true)
    document.addEventListener('copy', blockCopy, true)
    document.addEventListener('contextmenu', blockContext, true)
    return () => {
      document.removeEventListener('paste', blockPaste, true)
      document.removeEventListener('copy', blockCopy, true)
      document.removeEventListener('contextmenu', blockContext, true)
    }
  }, [enabled])
}

export function secureInputProps(enabled: boolean) {
  if (!enabled) return {}
  return {
    onPaste: (e: React.ClipboardEvent) => e.preventDefault(),
    onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
    onCut: (e: React.ClipboardEvent) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    autoComplete: 'off' as const,
    spellCheck: false,
  }
}
