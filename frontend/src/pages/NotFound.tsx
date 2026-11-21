import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/primitives';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="This page doesn’t exist"
      description="The link may be out of date."
      action={
        <Link to="/" className="text-sm font-medium text-brand hover:underline">
          Go to the dashboard
        </Link>
      }
    />
  );
}
