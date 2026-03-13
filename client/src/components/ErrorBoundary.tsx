import {
  ErrorBoundary as SolidErrorBoundary,
  type JSX,
  type ParentProps,
} from 'solid-js'

type FallbackProps = {
  error: Error
  reset: () => void
}

type Props = ParentProps<{
  fallback?: (error: Error, reset: () => void) => JSX.Element
}>

export function DefaultErrorFallback({ error, reset }: FallbackProps) {
  return (
    <div style={{ padding: '1rem', 'font-family': 'system-ui, sans-serif' }}>
      <h2>Something went wrong</h2>
      <pre style={{ 'white-space': 'pre-wrap' }}>{error.message}</pre>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  )
}

export default function ErrorBoundary(props: Props) {
  return (
    <SolidErrorBoundary fallback={props.fallback ?? DefaultErrorFallback}>
      {props.children}
    </SolidErrorBoundary>
  )
}
