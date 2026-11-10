import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PlanForm } from '@/components/PlanForm';
import { requireMember } from '@/lib/auth';
import { getPlan } from '@/lib/plans';
import { todayMadrid, utcToMadridFields } from '@/lib/time';
import { updatePlanAction } from '../../actions';

export const metadata: Metadata = { title: 'edit plan · mesa' };

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const plan = await getPlan(id);
  if (!plan) notFound();
  if (plan.host_id !== me.id || plan.status !== 'active') redirect(`/plans/${id}`);
  const { date, time } = utcToMadridFields(plan.starts_at);
  return (
    <PlanForm
      heading="edit plan"
      mode="edit"
      submitLabel="save changes"
      action={updatePlanAction.bind(null, id)}
      cancelHref={`/plans/${id}`}
      minDate={todayMadrid()}
      defaults={{ title: plan.title, place: plan.place_name, maps: plan.maps_url ?? '', booking: plan.booking_url ?? '', date, time, plus: plan.free_plus_one }}
    />
  );
}
