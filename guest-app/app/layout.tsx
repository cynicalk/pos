import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { FlowProvider } from "@/hooks/use-flow";
import { MenuProvider } from "@/hooks/use-menu";
import { LangProvider } from "@/hooks/use-lang";
import { ToastProvider } from "@/components/ui/toast";
import TableSync from "@/hooks/use-table-sync";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Cooklyt · Amber & Vine",
  description:
    "Order smarter at the table — recommendations tuned to your group.",
};

export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        <LangProvider>
          <FlowProvider>
            <MenuProvider>
              <TableSync />
              <ToastProvider>{children}</ToastProvider>
            </MenuProvider>
          </FlowProvider>
        </LangProvider>
      </body>
    </html>
  );
}
