import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  adminOnly?: boolean;
  masterOnly?: boolean;
}

export function ProtectedRoute({ children, adminOnly, masterOnly }: Props) {
  const { isAuthenticated, isAdmin, isMaster } = useAuthStore();

  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin()) return <Navigate to="/dashboard" replace />;
  if (masterOnly && !isMaster()) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
