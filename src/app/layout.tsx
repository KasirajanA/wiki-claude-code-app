import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wiki",
  description: "Full-featured wiki with search, versioning, and role-based permissions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
