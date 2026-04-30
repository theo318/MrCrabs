import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mr Crabs — agentic underwriting",
  description: "Making B2B payments instant with agentic underwriting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
