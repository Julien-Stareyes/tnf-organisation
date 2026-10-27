import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion · Organisation TNF" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center bg-rail px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-sidebar p-8 shadow-2xl">
        <div className="mb-8 space-y-3 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-sm font-black text-accent-fg">
            TNF
          </div>
          <h1 className="text-xl font-semibold">Organisation TNF</h1>
          <p className="text-sm text-muted">Accès réservé aux équipes The New Face, sur invitation.</p>
        </div>
        <LoginForm next={next} linkError={error === "lien"} />
      </div>
    </main>
  );
}
