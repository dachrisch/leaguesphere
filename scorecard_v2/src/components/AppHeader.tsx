interface AppHeaderProps {
  kicker: string;
  title: string;
  sub?: string;
}

/** Screen chrome: kicker, one title and an optional context line. */
export default function AppHeader({ kicker, title, sub }: AppHeaderProps) {
  return (
    <header className="app-header">
      <p className="kicker">{kicker}</p>
      <h1 className="app-title">{title}</h1>
      {sub === undefined ? null : <p className="app-sub">{sub}</p>}
    </header>
  );
}
