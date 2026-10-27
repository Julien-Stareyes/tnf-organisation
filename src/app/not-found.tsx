import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh flex-1 place-items-center bg-main p-8">
      <div className="space-y-3 text-center">
        <p className="text-5xl font-black text-accent">404</p>
        <h1 className="text-lg font-semibold">Introuvable</h1>
        <p className="text-sm text-muted">Cette page n&apos;existe pas, ou tu n&apos;y as pas accès.</p>
        <Link href="/" className="inline-block text-sm text-fg underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
