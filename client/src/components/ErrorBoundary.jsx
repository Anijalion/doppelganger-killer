import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="fixed top-2 right-2 z-50 bg-red-900/90 text-red-100 text-xs px-3 py-2 rounded-xl shadow-lg border border-red-500">
          ⚠️ UI更新エラーが発生しましたがゲームは継続中です
        </div>
      );
    }
    return this.props.children;
  }
}
