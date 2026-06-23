export function RouteSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading section">
      <span className="shell-skeleton-line shell-skeleton-line--short" />
      <span className="shell-skeleton-block" />
    </div>
  );
}
