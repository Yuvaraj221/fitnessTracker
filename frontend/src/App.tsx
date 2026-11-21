import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AchievementsPage } from './pages/Achievements';
import { AnalyticsPage } from './pages/Analytics';
import { BodyMetricsPage } from './pages/BodyMetrics';
import { DashboardPage } from './pages/Dashboard';
import { NotFoundPage } from './pages/NotFound';
import { NutritionPage } from './pages/Nutrition';
import { SettingsPage } from './pages/Settings';
import { WorkoutsPage } from './pages/Workouts';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="nutrition" element={<NutritionPage />} />
        <Route path="body" element={<BodyMetricsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
