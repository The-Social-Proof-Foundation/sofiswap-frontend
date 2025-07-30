import './globals.css';
import type { Metadata } from 'next';
import GoogleAnalytics from '@/lib/googleAnalytics'
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from '@/components/theme-provider';
import { ApolloWrapper } from '@/lib/apollo-provider';
import { CookieConsent } from '@/components/cookie-consent';
import ThemeFavicon from '@/components/theme-favicon';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Coming Soon - Revolutionary Experience Awaits',
  description: 'Something amazing is coming. Be the first to know when we launch.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* <ApolloWrapper> */}
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange={false}
            >
              {children}
              <Toaster />
              <CookieConsent/>
              <ThemeFavicon/>
            </ThemeProvider>
          <GoogleAnalytics />
        {/* </ApolloWrapper> */}
      </body>
    </html>
  );
}