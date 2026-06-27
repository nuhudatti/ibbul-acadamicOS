import { cn, getGradeColor } from '@/lib/utils'

interface GradeChipProps {
  grade: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function GradeChip({ grade, size = 'md', className }: GradeChipProps) {
  const label = grade?.trim().toUpperCase() || '—'
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-bold border rounded-lg tabular-nums',
        size === 'sm' && 'min-w-[1.75rem] h-7 px-2 text-xs',
        size === 'md' && 'min-w-[2rem] h-8 px-2.5 text-sm',
        size === 'lg' && 'min-w-[2.25rem] h-9 px-3 text-base',
        label !== '—' ? getGradeColor(label) : 'text-slate-500 bg-slate-50 border-slate-200',
        className,
      )}
    >
      {label}
    </span>
  )
}
