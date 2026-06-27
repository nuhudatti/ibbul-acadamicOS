import { cn } from '@/lib/utils'

/** Horizontal scroll wrapper for wide data tables on mobile. */
export function TableScroll({ children, className, minWidth = '700px' }: {
  children: React.ReactNode
  className?: string
  minWidth?: string
}) {
  return (
    <div className={cn('overflow-x-auto overscroll-x-contain -mx-px', className)}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  )
}
