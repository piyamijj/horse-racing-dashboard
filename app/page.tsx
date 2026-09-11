import RaceList from "@/components/RaceList";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">
          At Yarışı Tahmin Panosu
        </h1>
        <p className="text-sm text-muted mt-1">
          Günün koşularını görüntüleyin; bir koşuya tıklayarak yapay zeka
          destekli olasılık ve değerli bahis analizini inceleyin.
        </p>
      </section>

      <RaceList />
    </div>
  );
}