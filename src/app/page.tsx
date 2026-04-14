import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">Wiki</h1>
      <p className="text-gray-600 mb-8">
        A wiki application with full-text search, markdown editing, and version history.
      </p>
      <Link
        href="/articles"
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Browse Articles
      </Link>
    </main>
  );
}
