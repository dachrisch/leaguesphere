export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="share-error" role="alert">
      {message}
    </div>
  );
}
