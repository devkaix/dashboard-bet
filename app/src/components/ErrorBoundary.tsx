import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          background: '#0b1120',
          color: '#f1f5f9',
          minHeight: '100vh',
          fontFamily: 'Inter, sans-serif'
        }}>
          <h1 style={{ color: '#ef4444', fontSize: '24px', marginBottom: '16px' }}>
            Errore nell'applicazione
          </h1>
          <pre style={{
            background: '#111827',
            padding: '16px',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '13px',
            color: '#f1f5f9',
            border: '1px solid #1e293b'
          }}>
            {this.state.error?.message}\n{this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
