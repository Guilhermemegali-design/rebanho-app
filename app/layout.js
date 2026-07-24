import RegistroServiceWorker from "@/components/RegistroServiceWorker";
import "./globals.css";

export const metadata = {
  title: "RASTRO - Gestão Individual do Rebanho",
  description: "Cadastro individual, localização, lotes, pesagens e sanidade do rebanho",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#1F4D45",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icon-192.png?v=2" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <RegistroServiceWorker />
        {children}
      </body>
    </html>
  );
}
