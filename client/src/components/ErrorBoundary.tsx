import { ErrorBoundary as SolidErrorBoundary, type JSX } from 'solid-js';

type FallbackProps = {
  error: Error;
  reset: () => void;
};

export function DefaultErrorFallback(props: FallbackProps) {
  return (
    <div
      style={{
        display: 'flex',
        'min-height': '100vh',
        'align-items': 'center',
        'justify-content': 'center',
        padding: '24px',
        'background-color': '#0f172a',
        color: '#e2e8f0',
      }}
    >
      <div
        style={{
          width: '100%',
          'max-width': '480px',
          padding: '24px',
          'border-radius': '16px',
          'background-color': '#111827',
          'box-shadow': '0 20px 45px rgba(15, 23, 42, 0.35)',
        }}
      >
        <h1 style={{ margin: '0 0 12px', 'font-size': '24px', 'font-weight': 700 }}>
          Something went wrong
        </h1>
        <p style={{ margin: '0 0 16px', 'line-height': 1.5, color: '#cbd5e1' }}>
          The application hit an unexpected error. You can retry without reloading the page.
        </p>
        <pre
          style={{
            overflow: 'auto',
            padding: '12px',
            'border-radius': '12px',
            'background-color': '#020617',
            color: '#f8fafc',
            'font-size': '12px',
            'white-space': 'pre-wrap',
          }}
        >
          {props.error.message}
        </pre>
        <button
          type="button"
          onClick={props.reset}
          style={{
            margin: '16px 0 0',
            padding: '10px 16px',
            border: 'none',
            'border-radius': '999px',
            'background-color': '#38bdf8',
            color: '#082f49',
            'font-weight': 700,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

type ErrorBoundaryProps = {
  children: JSX.Element;
  fallback: (error: Error, reset: () => void) => JSX.Element;
};

export default function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <SolidErrorBoundary fallback={props.fallback}>
      {props.children}
    </SolidErrorBoundary>
  );
}
