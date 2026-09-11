import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SesionProvider } from "@/lib/sesion";
import RegistrarSW from "@/components/RegistrarSW";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Cuadre",
  description: "Software operativo para negocios de remesas",
  applicationName: "Cuadre",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180" }],
  },
  // En iPhone no hay manifiesto que valga: la pantalla completa se pide con
  // estas etiquetas y no con `display: standalone`.
  appleWebApp: {
    capable: true,
    title: "Cuadre",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom le quita la lupa a quien la necesita.
  // Azul oficio: es el color del PRODUCTO, no el del operador. La marca del
  // cliente sigue mandando dentro de la app, en --marca.
  themeColor: "#2457D6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RegistrarSW />
        <SesionProvider>{children}</SesionProvider>
      </body>
    </html>
  );
}
