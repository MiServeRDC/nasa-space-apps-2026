import React from 'react';

export interface WebGlErrorBoundaryProps {
  fallback: (errorMsg: string) => React.ReactNode;
  children: React.ReactNode;
}

export interface WebGlErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

export class WebGlErrorBoundary extends React.Component<
  WebGlErrorBoundaryProps,
  WebGlErrorBoundaryState
> {
  constructor(props: WebGlErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error): WebGlErrorBoundaryState {
    return { hasError: true, errorMsg: error?.message || 'WebGL pipeline fault' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      '[ARES-Health UI] Isolated WebGL boundary caught fault; 2D clinical controls preserved:',
      error.message,
      errorInfo.componentStack
    );
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback(this.state.errorMsg);
    }
    return this.props.children;
  }
}
