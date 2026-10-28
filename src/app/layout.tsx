import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draftly — a quieter place to write",
  description: "A thoughtful workspace for your documents and ideas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>
    <Script id="draftly-theme-bootstrap" strategy="beforeInteractive">
      {`try{document.documentElement.dataset.theme=localStorage.getItem("draftly-theme")==="dark"?"dark":"light"}catch{}`}
    </Script>
    {children}
  </body></html>;
}
