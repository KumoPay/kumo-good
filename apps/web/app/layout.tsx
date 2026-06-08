import type { Metadata, Viewport } from "next"
import { Inter, Nunito_Sans } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
})
const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Kumo — Pay when the signal disappears",
  description: "Speak a G$ payment offline. It settles itself when you're back online. No gas token, ever.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kumo" },
}

export const viewport: Viewport = {
  themeColor: "#FAFCFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  )
}
