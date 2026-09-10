import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SesionProvider } from "@/lib/sesion";

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
  description: "Gestión de operaciones de remesas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom le quita la lupa a quien la necesita.
  themeColor: "#1f1b1d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SesionProvider>{children}</SesionProvider>
      </body>
    </html>
  );
}
