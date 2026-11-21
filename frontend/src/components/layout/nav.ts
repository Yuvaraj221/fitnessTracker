import { ChartLine, Dumbbell, LayoutDashboard, Scale, Settings, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react';

export const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { to: '/body', label: 'Body Metrics', icon: Scale },
  { to: '/analytics', label: 'Progress & Analytics', icon: ChartLine },
  { to: '/achievements', label: 'Achievements', icon: Trophy },
  { to: '/settings', label: 'Settings', icon: Settings },
];
