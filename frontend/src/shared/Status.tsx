export function Status({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="status error" role="alert">
        <p>{error}</p>
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="status" role="status">
        Finding the details for you…
      </div>
    );
  return null;
}
