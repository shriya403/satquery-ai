import type { Metadata } from "next";
import { ThemeProvider } from "../components/ThemeProvider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoNexus - SatQuery AI",
  description: "Evidence-grounded remote sensing assistant for SIH26167"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    try {
      var theme = localStorage.getItem("satquery-theme") || "space";
      if (!["space", "natural", "minimal", "analyst"].includes(theme)) theme = "space";
      document.documentElement.dataset.theme = theme;
    } catch (error) {
      document.documentElement.dataset.theme = "space";
    }
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
