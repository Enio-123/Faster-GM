// Ícones de traço simples (24x24), desenhados para o app.
import type { ReactNode } from 'react'

function I({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} aria-label={label}>
      {children}
    </svg>
  )
}

export const IconToday = () => (
  <I>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    <path d="M8.5 14.5l2.2 2.2 4.8-4.8" />
  </I>
)
export const IconTrain = () => (
  <I>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </I>
)
export const IconPlay = () => (
  <I>
    <rect x="2.5" y="7" width="19" height="12" rx="2.5" />
    <path d="M12 7v12M7 4.5h3M14 4.5h3" />
    <path d="M7.2 13l1.3-2M16.8 13l-1.3-2" />
  </I>
)
export const IconProgress = () => (
  <I>
    <path d="M3 20h18" />
    <path d="M4 16l5-5 4 3 7-8" />
    <path d="M15 6h5v5" />
  </I>
)
export const IconSettings = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </I>
)
export const IconLock = () => (
  <I>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </I>
)
export const IconCheck = () => (
  <I>
    <path d="M4.5 12.5l5 5 10-11" />
  </I>
)
export const IconX = () => (
  <I>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
)
export const IconArrowRight = () => (
  <I>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </I>
)
export const IconArrowLeft = () => (
  <I>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </I>
)
export const IconRetry = () => (
  <I>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4v5h5" />
  </I>
)
export const IconEye = () => (
  <I>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </I>
)
export const IconUndo = () => (
  <I>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </I>
)
export const IconFlag = () => (
  <I>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </I>
)
export const IconBolt = () => (
  <I>
    <path d="M13 2L4.5 13.5H12L11 22l8.5-11.5H12L13 2z" />
  </I>
)
export const IconFlip = () => (
  <I>
    <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
  </I>
)
