import RegistroServiceWorker from "@/components/RegistroServiceWorker";
import "./globals.css";

export const metadata = {
  title: "Rebanho - Acompanhamento Individual",
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
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
