import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { PageSkeleton } from './components/ui/primitives';

// Each page is its own chunk so the first load stays small.
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const WorkoutsPage = lazy(() => import('./pages/Workouts').then((m) => ({ default: m.WorkoutsPage })));
const NutritionPage = lazy(() => import('./pages/Nutrition').then((m) => ({ default: m.NutritionPage })));
const BodyMetricsPage = lazy(() => import('./pages/BodyMetrics').then((m) => ({ default: m.BodyMetricsPage })));
const AnalyticsPage = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.AnalyticsPage })));
const AchievementsPage = lazy(() => import('./pages/Achievements').then((m) => ({ default: m.AchievementsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFoundPage })));

const page = (el: ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>;

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<DashboardPage />)} />
        <Route path="workouts" element={page(<WorkoutsPage />)} />
        <Route path="nutrition" element={page(<NutritionPage />)} />
        <Route path="body" element={page(<BodyMetricsPage />)} />
        <Route path="analytics" element={page(<AnalyticsPage />)} />
        <Route path="achievements" element={page(<AchievementsPage />)} />
        <Route path="settings" element={page(<SettingsPage />)} />
        <Route path="*" element={page(<NotFoundPage />)} />
      </Route>
    </Routes>
  );
}
