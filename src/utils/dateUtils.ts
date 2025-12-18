import { differenceInDays, addMonths, format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export function daysBetween(date1: Date, date2: Date): number {
  return differenceInDays(date2, date1)
}

export function addMonthsToDate(date: Date, months: number): Date {
  return addMonths(date, months)
}

export function formatDate(date: Date | string, formatStr: string = 'yyyy-MM-dd'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, formatStr, { locale: ko })
}

export function formatKoreanDate(date: Date | string): string {
  return formatDate(date, 'yyyy년 MM월 dd일')
}

export function getDaysLeft(targetDate: Date): number {
  const today = new Date()
  return daysBetween(today, targetDate)
}

export function isExpiringSoon(targetDate: Date, thresholdDays: number = 90): boolean {
  const daysLeft = getDaysLeft(targetDate)
  return daysLeft > 0 && daysLeft <= thresholdDays
}

export function parseDate(dateString: string | undefined | null): Date {
  if (!dateString || typeof dateString !== 'string') {
    return new Date()
  }

  try {
    // ISO 형식 (YYYY-MM-DD)
    if (dateString.includes('-')) {
      return parseISO(dateString)
    }

    // 한국 날짜 형식 (YYYY.MM.DD 또는 YYYY/MM/DD)
    const cleaned = dateString.replace(/[./]/g, '-')
    return parseISO(cleaned)
  } catch (error) {
    console.warn('날짜 파싱 실패, 현재 날짜 사용:', dateString, error)
    return new Date()
  }
}
