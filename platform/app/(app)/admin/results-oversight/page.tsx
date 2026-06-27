import { Suspense } from 'react'
import ResultsOversightContent from './content'

export default function ResultsOversightPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ResultsOversightContent />
    </Suspense>
  )
}
