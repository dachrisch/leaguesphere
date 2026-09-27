export function PoweredBy({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <footer className="share-powered">
      <a
        href="https://leaguesphere.app"
        target="_blank"
        rel="noopener noreferrer"
      >
        powered by LeagueSphere
      </a>
    </footer>
  );
}
