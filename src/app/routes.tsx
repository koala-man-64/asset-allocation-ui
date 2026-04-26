import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '@/app/components/common/PageLoader';
import { APP_ROUTE_REGISTRY, DEFAULT_APP_ROUTE_PATH } from '@/app/routeRegistry';

const ROUTE_COMPONENTS = Object.fromEntries(
  APP_ROUTE_REGISTRY.map((route) => [route.key, lazy(route.load)])
) as Record<string, ReturnType<typeof lazy>>;

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader text="Loading workspace..." variant="panel" />}>
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_APP_ROUTE_PATH} replace />} />
        {APP_ROUTE_REGISTRY.map((route) => {
          const RouteComponent = ROUTE_COMPONENTS[route.key];
          return <Route key={route.key} path={route.path} element={<RouteComponent />} />;
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
