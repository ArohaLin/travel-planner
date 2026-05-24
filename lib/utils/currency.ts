import type { Money } from '@/lib/types/itinerary'

const LOCALE = 'zh-TW'

export function formatMoney(money: Money): string {
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(money.amount)

  return money.isEstimate ? `約 ${formatted}` : formatted
}

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const CURRENCY_NAMES: Record<string, string> = {
  TWD: '台幣',
  JPY: '日圓',
  USD: '美元',
  EUR: '歐元',
  GBP: '英鎊',
  KRW: '韓元',
  CNY: '人民幣',
  THB: '泰銖',
  SGD: '新加坡元',
  HKD: '港幣',
  AUD: '澳幣',
  CAD: '加幣',
}

export function getCurrencyName(code: string): string {
  return CURRENCY_NAMES[code] ?? code
}

export const COMMON_CURRENCIES = [
  'TWD', 'JPY', 'USD', 'EUR', 'KRW', 'CNY', 'THB', 'SGD', 'HKD',
]
