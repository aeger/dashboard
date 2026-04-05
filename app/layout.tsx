import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import ThemeProvider from '@/components/shared/ThemeProvider'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'AZ-Lab Home',
  description: 'Home dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} font-sans bg-zinc-950 text-zinc-100 antialiased min-h-screen`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
