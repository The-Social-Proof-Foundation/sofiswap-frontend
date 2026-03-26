import './globals.css';
import type { Metadata } from 'next';
import GoogleAnalytics from '@/lib/googleAnalytics'
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from '@/components/theme-provider';
import { NetworkProvider } from '@/lib/network-provider';
import { CookieConsent } from '@/components/cookie-consent';
import { MySocialAuthBroadcastListener } from '@/components/providers/mysocial-auth-broadcast-listener';
import ThemeFavicon from '@/components/theme-favicon';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SofiSwap - Coming Soon',
  description: 'SofiSwap is a decentralized exchange on MySocial. Be the first to know when we launch.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <NetworkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange={false}
          >
            <MySocialAuthBroadcastListener />
            {children}
            <Toaster />
            <CookieConsent />
            <ThemeFavicon />
          </ThemeProvider>
        </NetworkProvider>
        <GoogleAnalytics />
      </body>
    </html>
  );
}