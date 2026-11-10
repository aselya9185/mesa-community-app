import type { Metadata } from 'next';
import { PlanForm } from '@/components/PlanForm';
import { todayMadrid } from '@/lib/time';

export const metadata: Metadata = { title: 'drop a plan · mesa' };

export default function NewPlanPage() {
  return <PlanForm defaults={{ title: '', place: '', maps: '', booking: '', date: '', time: '', plus: false }} minDate={todayMadrid()} />;
}
