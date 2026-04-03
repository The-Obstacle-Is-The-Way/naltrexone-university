import 'server-only';

export async function awaitRequestBoundary() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const { connection } = await import('next/server');
  await connection();
}
