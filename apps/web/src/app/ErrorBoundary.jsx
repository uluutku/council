import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Council UI error', {
      name: error.name,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="centered-page" role="alert">
          <section className="status-card">
            <p className="eyebrow">Application error</p>
            <h1>Council could not render this page.</h1>
            <p>Reload the page. If the problem continues, report the time and page address.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
