import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import { TrpcProvider } from "@/lib/trpc/Provider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RSVP Manager",
  description: "Group event RSVPs and payments.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <TrpcProvider>
          <ToastProvider>{children}</ToastProvider>
        </TrpcProvider>
      </body>
    </html>
  );
}
