import { differenceInDays, addMonths, format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export function daysBetween(date1: Date, date2: Date): number {
  return differenceInDays(date2, date1)
}

export function addMonthsToDate(date: Date, months: number): Date {
  return addMonths(date, months)
}

export function formatDate(date: Date | string | null | undefined, formatStr: string = 'yyyy-MM-dd'): string {
  if (!date) return '-'

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date

    // Invalid Date 체크
    if (isNaN(dateObj.getTime())) {
      console.warn('날짜 포맷 실패: Invalid Date', date)
      return '-'
    }

    return format(dateObj, formatStr, { locale: ko })
  } catch (error) {
    console.warn('날짜 포맷 실패:', date, error)
    return '-'
  }
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
    const trimmed = dateString.trim()

    // 2자리 연도 형식 처리 (22-9-29, 24-10-30 등)
    if (/^\d{2}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
      const [yy, mm, dd] = trimmed.split('-')
      const year = parseInt(yy!, 10)
      // 50보다 작으면 2000년대, 크거나 같으면 1900년대
      const fullYear = year < 50 ? 2000 + year : 1900 + year
      const fullDate = `${fullYear}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`
      return parseISO(fullDate)
    }

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
