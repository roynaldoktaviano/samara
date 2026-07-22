import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from 'sonner'
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Samara Liveaboard ERP",
  description: "Internal operations and fleet management system",
  authors: [{ name: "Samara Liveaboard" }],
  icons: {
    icon: "https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png",
  },
 openGraph: {
    title: "Samara Liveaboard ERP",
    description: "Internal operations and fleet management system",
    url: "https://erp.samarayachting.com",
    siteName: "Samara ERP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Samara Liveaboard ERP",
    description: "Internal operations and fleet management system",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
          <Sonner position="top-right" richColors expand closeButton duration={5000} />
        </Providers>
      </body>
    </html>
  );
}
