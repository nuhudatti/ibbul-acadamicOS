import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

const uploadBackend = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

export const   metadata: Metadata = {
  title: {
    default: 'IBBUL Academic Platform',
    template: '%s | IBBUL',
  },
  description: 'Ibrahim Badamasi Babangida University Lapai — Academic Operating System',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a35af',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {uploadBackend ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__IBBUL_UPLOAD_API__=${JSON.stringify(uploadBackend)};`,
            }}
          />
        ) : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          richColors
          expand={false}
          closeButton
          toastOptions={{
            style: {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}
