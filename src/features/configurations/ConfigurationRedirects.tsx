import { Navigate } from 'react-router-dom';

export function UniverseConfigurationRedirect() {
  return <Navigate to="/strategy-configurations?tab=universe" replace />;
}

export function RankingConfigurationRedirect() {
  return <Navigate to="/strategy-configurations?tab=ranking" replace />;
}
