import Link from 'next/link'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">帳號申請</h1>
        <p className="text-gray-500 mb-6 leading-relaxed">
          此系統不開放自助註冊。<br />
          請聯絡管理員為您建立帳號。
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center w-full py-3 px-4 bg-purple-600 text-white rounded-2xl font-medium hover:bg-purple-700 transition-colors"
        >
          返回登入
        </Link>
      </div>
    </div>
  )
}
