import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import "../style.css";
export const metadata: Metadata = {
  title: "Customer Investor Map",
  description:
    "Research the investors behind your customers and find possible warm introduction paths.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
