import { notFound } from 'next/navigation'
import { getReport } from '@/lib/reports'
import { ReportReader } from '@/components/admin/ReportReader'

export default function ReportPage({ params }: { params: { slug: string } }) {
  const report = getReport(params.slug)
  if (!report) notFound()
  return <ReportReader report={report} />
}
