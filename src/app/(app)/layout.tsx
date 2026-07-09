export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">{children}</main>;
}
