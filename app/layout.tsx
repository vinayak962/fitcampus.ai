import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FitCampus AI", description: "Train for what you love." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
