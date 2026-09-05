import LabSubNav from '@/components/lab/LabSubNav'
import MessagesPane from '@/components/lab/MessagesPane'

export const dynamic = 'force-dynamic'

export default function MessagesPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <LabSubNav />
      <MessagesPane />
    </div>
  )
}
