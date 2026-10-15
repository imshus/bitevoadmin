import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/useApi.js';
import { EmptyState } from '../components/ui.jsx';
import { Alert } from '../components/Icons.jsx';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <section className="card">
      <EmptyState icon={<Alert />} title="Page not found" text="This page doesn’t exist in the admin panel."
        action={<Link to="/" className="btn btn--primary">Back to dashboard</Link>} />
    </section>
  );
}
