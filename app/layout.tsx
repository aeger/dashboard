import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import ThemeProvider from '@/components/shared/ThemeProvider'
import SiteHeader from '@/components/shared/SiteHeader'
import ScrollToTop from '@/components/shared/ScrollToTop'
import ColorThemeSwitcher from '@/components/shared/ColorThemeSwitcher'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'AZ-Lab Home',
  description: 'Home dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-color-theme="graphite">
      <head>
        {/* Apply the saved color theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('az-color-theme');if(t)document.documentElement.setAttribute('data-color-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans text-zinc-100 antialiased min-h-screen`}>
        <ThemeProvider>
          <SiteHeader />
          {children}
          <ScrollToTop />
          <ColorThemeSwitcher />
        </ThemeProvider>
      </body>
    </html>
  )
}
