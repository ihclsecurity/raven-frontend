/**
 * Raven Loading Skeleton Primitive
 *
 * Lightweight visual placeholder for async panels. It intentionally has no
 * fetching logic and can be dropped into existing query branches safely.
 */
interface LoadingSkeletonProps {
  rows?: number
  className?: string
}

export function LoadingSkeleton({ rows = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`raven-skeleton-stack${className ? ` ${className}` : ''}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className="raven-skeleton-line" />
      ))}
    </div>
  )
}
