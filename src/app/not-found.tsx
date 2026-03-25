import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold tracking-tighter text-foreground">404</h1>
        <p className="text-lg text-muted-foreground italic">This sector has not been charted.</p>
      </div>
      <Link
        href="/dashboard"
        className="text-sm text-sky-400 hover:text-sky-300 transition-colors"
      >
        Return to The Bridge
      </Link>
    </div>
  );
}
