export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1 && page === 0) return null;
  return (
    <nav className="pagination" aria-label="Result pages">
      <button
        className="button secondary"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page + 1} of {Math.max(1, totalPages)}
      </span>
      <button
        className="button secondary"
        disabled={page + 1 >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
