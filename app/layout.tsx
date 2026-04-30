import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FlowFi — Agentic invoice finance",
  description: "Real-time underwriting for B2B invoices, with the human kept in the loop where it counts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
