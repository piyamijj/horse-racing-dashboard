# At Yarışı Tahmin Panosu

Yapay zeka destekli, otomatik At Yarışı Tahmin ve Analiz Panosu. Türkiye Jokey Kulübü (TJK) verilerini kaynak alarak günün koşularını listeler, her koşu için yapay zeka tabanlı olasılık ve "değerli bahis" (value bet) analizi üretir ve bunları güven skoruna göre sıralı biçimde gösterir.

Bu pano yalnızca bilgilendirme ve gösterim amaçlıdır; bahis/yatırım tavsiyesi değildir.

## Özellikler

- Günün koşularını listeleyen ana pano (karanlık tema, mobil uyumlu).
- Koşu detay sayfası: at bazında kazanma olasılığı, güven skoru, hız reytingi, kilo dezavantajı ve form skoru grafikleri.
- "Değerli Bahis" tespiti: modelin hesapladığı kazanma olasılığı ile güncel oranların ima ettiği olasılık karşılaştırılarak matematiksel bir fark (edge) hesaplanır.
- Veri çekme (scrape) ve yapay zeka analizi (predict) birbirinden ayrı iki API rotasına bölünmüştür; böylece Vercel'in sunucusuz fonksiyon zaman aşımı sınırına takılmadan çalışır.
- Birincil veri kaynağı: TJK. TJK erişilemediğinde (yetkilendirme anahtarı yok veya siteye bot koruması engel oluyorsa) sistem otomatik olarak açıkça etiketlenmiş bir örnek (demo) veri setine düşer; pano her zaman uçtan uca çalışır durumda kalır.
- Yapay zeka sağlayıcısı olarak öncelikli Gemini (gemini-flash-latest), hata durumunda otomatik yedek olarak Groq (openai/gpt-oss-120b) kullanılır.
- Veri deposu olarak Supabase (varsa) veya yerel JSON önbellek (yoksa) kullanılır; kod her iki durumda da aynı şekilde çalışır.

## Teknoloji Yığını

- Next.js 14+ (App Router), React, TypeScript
- Tailwind CSS (varsayılan karanlık tema)
- Vercel (Node.js çalışma zamanı üzerinde sunucusuz fonksiyonlar)
- Veri çekme: yerli `fetch` + Cheerio (Puppeteer kullanılmamıştır — Vercel boyut/süre sınırlarını aşmaması için)
- Yapay zeka: `@google/generative-ai` (Gemini) ve `groq-sdk` (Groq), her ikisi de katı şema tabanlı (structured output) yanıt zorunluluğu ile
- Veritabanı: `@supabase/supabase-js` (opsiyonel; yoksa yerel JSON önbellek)

## Klasör Yapısı

```
app/
  layout.tsx              Kök yerleşim, karanlık tema, üst menü
  page.tsx                Ana sayfa: günün koşuları
  globals.css             Tailwind temel stiller + tema
  race/[raceId]/page.tsx  Koşu detay sayfası (AI analizi)
  api/
    scrape/route.ts       Veri çekme uç noktası (Node runtime)
    predict/route.ts      Yapay zeka analiz uç noktası (Node runtime)
    races/route.ts        Depolanan koşuları okuyan salt-okunur uç nokta
components/
  ui/                     Card, ProgressBar, Badge gibi temel bileşenler
  RaceList.tsx            Koşu listesi (veri çekme, yenileme, boş/hata durumları)
  RaceCard.tsx            Tekil koşu kartı
  HorseAnalysisTable.tsx  Güven skoruna göre sıralı at analizi
  ValueBetChart.tsx       Model olasılığı vs. oran bazlı olasılık karşılaştırması
lib/
  scraper.ts              TJK API → TJK HTML → örnek veri sırasıyla veri çekme
  ai.ts                   Gemini/Groq ile katı JSON şemalı analiz üretimi
  supabase.ts             Supabase istemcisi ve tipli sorgular
  cache.ts                Yerel JSON önbellek (Supabase yoksa yedek depo)
  store.ts                Supabase/önbellek arasında otomatik seçim yapan katman
  types.ts                Paylaşılan TypeScript tipleri
supabase/
  schema.sql              Supabase için gerekli tablo şeması
```

## Ortam Değişkenleri (.env.local)

| Değişken | Açıklama |
|---|---|
| `AI_PROVIDER` | `gemini` veya `groq` — birincil sağlayıcıyı belirler (varsayılan: gemini) |
| `GEMINI_API_KEY` | Google Gemini API anahtarı (ücretsiz katman) |
| `GEMINI_MODEL` | Kullanılacak Gemini modeli (varsayılan: `gemini-flash-latest`) |
| `GROQ_API_KEY` | Groq API anahtarı (ücretsiz katman, Gemini başarısız olursa yedek) |
| `GROQ_MODEL` | Kullanılacak Groq modeli (varsayılan: `openai/gpt-oss-120b`) |
| `SUPABASE_URL` | Supabase proje URL'si |
| `SUPABASE_ANON_KEY` | Supabase herkese açık (anon) anahtarı |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase servis rolü anahtarı — sunucu tarafı yazma işlemleri için |
| `USE_LOCAL_CACHE_FALLBACK` | Supabase yapılandırılmamışsa yerel JSON önbelleğin kullanılacağını belirtir |
| `TJK_API_AUTH_KEY` | TJK'nin resmi veri API'si için gereken yetkilendirme anahtarı (TJK tarafından verilir; herkese açık değildir) |
| `TJK_API_BASE_URL` | TJK API taban adresi (varsayılan: `https://vhs.tjk.org/vss/data`) |
| `TJK_PROGRAM_PAGE_URL` | TJK'nin genel yarış programı sayfası (HTML kazıma yedeği için) |
| `RACING_SOURCE_BASE_URL` | Genel amaçlı yarış veri kaynağı taban adresi |
| `SCRAPER_USER_AGENT` | Kazıma isteklerinde kullanılacak User-Agent başlığı |
| `CRON_SECRET` | Zamanlanmış `/api/scrape` çağrılarını doğrulamak için paylaşılan gizli anahtar |
| `NEXT_PUBLIC_APP_URL` | Uygulamanın herkese açık adresi |

## Supabase Şeması

Supabase kullanmak isterseniz, `supabase/schema.sql` dosyasını Supabase projenizin SQL editöründe bir kez çalıştırın. Bu, `races` ve `predictions` tablolarını oluşturur ve okuma için herkese açık (RLS) politikaları ekler.

Supabase yapılandırılmamışsa (yalnızca `SUPABASE_SERVICE_ROLE_KEY` var, `SUPABASE_URL` eksikse) sistem otomatik olarak yerel JSON önbelleğe döner; uygulama yine de tam olarak çalışır.

## Kurulum

```bash
npm install
cp .env.example .env.local   # sonra kendi değerlerinizi girin
npm run dev
```

Ardından:

1. `http://localhost:3000/api/scrape` adresini ziyaret ederek (veya POST isteği göndererek) ilk veri çekmeyi tetikleyin.
2. Ana sayfada listelenen bir koşuya tıklayın; `/api/predict` otomatik olarak tetiklenip yapay zeka analizini üretecektir.

## Veri Kaynağı Notu (TJK)

Bu proje, birincil veri kaynağı olarak TJK'yi (tjk.org) hedefler:

1. **TJK Resmi API** (`vhs.tjk.org/vss/data`) — TJK tarafından verilen bir yetkilendirme anahtarı (`TJK_API_AUTH_KEY`) gerektirir. Bu anahtar herkese açık/ücretsiz olarak dağıtılmamaktadır; TJK ile iletişime geçilerek temin edilmelidir.
2. **TJK Genel Sayfası (HTML kazıma)** — anahtar yoksa devreye girer. TJK, veri merkezi/bulut IP adreslerinden gelen otomatik istekleri bir güvenlik duvarıyla engelleyebilir; bu adım "en iyi çaba" (best-effort) niteliğindedir.
3. **Örnek (Demo) Veri** — her iki kaynak da erişilemezse, sistem açıkça `"demo"` olarak etiketlenmiş, gerçekçi ama sentetik bir veri seti üretir. Böylece boru hattı (scrape → depolama → analiz → arayüz) her zaman uçtan uca test edilebilir ve gösterilebilir durumda kalır.

Gerçek canlı veri için TJK'den bir API anahtarı temin edilmesi veya HTML seçicilerinin (selectors) güncel TJK sayfa yapısına göre doğrulanması/güncellenmesi önerilir.

## Vercel Dağıtımı

`vercel.json`, `/api/scrape` ve `/api/predict` rotalarını Node.js çalışma zamanında ve 60 saniyelik zaman aşımı ile çalıştıracak şekilde yapılandırılmıştır (Cheerio Edge runtime ile uyumlu değildir). Ayrıca `/api/scrape` için 6 saatte bir çalışan bir zamanlanmış görev (cron) tanımlıdır.

Dağıtımdan önce yukarıdaki tüm ortam değişkenlerini Vercel proje ayarlarına eklemeyi unutmayın.