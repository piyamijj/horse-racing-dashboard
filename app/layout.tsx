import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "At Yarışı Tahmin Panosu",
  description:
    "Yapay zeka destekli at yarışı analiz ve tahmin panosu — günün koşuları, değerli bahis fırsatları ve güven skoruna göre sıralanmış analizler.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="dark">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold">
                  A
                </span>
                <div>
                  <h1 className="text-base font-semibold leading-tight">
                    At Yarışı Tahmin Panosu
                  </h1>
                  <p className="text-xs text-muted leading-tight">
                    Yapay zeka destekli değerli bahis analizi
                  </p>
                </div>
              </div>
              <nav className="flex items-center gap-4">
                <Link
                  href="/altili-ganyan"
                  className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Altılı Ganyan
                </Link>
                <span className="text-xs text-muted hidden sm:block">
                  Veri kaynağı: TJK · Analiz: Gemini / Groq
                </span>
              </nav>
            </div>
          </header>

          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>

          <footer className="border-t border-border py-4">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>
                Bu pano yalnızca bilgilendirme amaçlıdır; yatırım/bahis tavsiyesi
                değildir.
              </span>
              <span>© {new Date().getFullYear()} At Yarışı Tahmin Panosu</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}