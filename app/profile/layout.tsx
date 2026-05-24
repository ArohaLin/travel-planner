import { ToastProvider } from '@/components/ui/Toast'

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
