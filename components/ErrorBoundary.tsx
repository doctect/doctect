import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    error: Error | null;
}

// Catches otherwise-uncaught render/lifecycle errors anywhere below it in the tree so one bad
// component (e.g. a user-authored generator script feeding bad data into the canvas) shows a
// recoverable message instead of leaving the whole app blank. Must be a class component —
// React only supports error boundaries via getDerivedStateFromError/componentDidCatch, there
// is no hook equivalent.
export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unhandled UI error:', error, info.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-md w-full text-center bg-white border rounded-xl shadow-lg p-8">
                        <div className="text-3xl mb-3">⚠️</div>
                        <h1 className="text-lg font-bold text-slate-800 mb-2">Something went wrong</h1>
                        <p className="text-sm text-slate-500 mb-1">The app hit an unexpected error and couldn't continue.</p>
                        <p className="text-xs text-slate-400 mb-6 font-mono break-words">{this.state.error.message}</p>
                        <div className="flex gap-2 justify-center">
                            <button onClick={this.handleReload} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
                                Reload
                            </button>
                            <button onClick={this.handleGoHome} className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700">
                                Go home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
