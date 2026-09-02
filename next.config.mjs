/** @type {import('next').NextConfig} */
const nextConfig = {
  // O RASTRO é uma aplicação cliente. A exportação estática permite que o
  // Capacitor leve a interface inteira dentro do APK e abra sem internet.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
