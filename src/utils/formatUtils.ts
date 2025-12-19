export function formatCurrency(amount: number): string {
  if (amount >= 100000000) {
    const billions = amount / 100000000
    // 소수점 2자리까지 표시, 불필요한 .00 제거
    const formatted = billions % 1 === 0 ? billions.toString() : billions.toFixed(2)
    return `${formatted}억`
  } else if (amount >= 10000) {
    const thousands = amount / 10000
    // 소수점 2자리까지 표시, 불필요한 .00 제거
    const formatted = thousands % 1 === 0 ? thousands.toString() : thousands.toFixed(2)
    return `${formatted}만`
  }
  return amount.toLocaleString()
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')

  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
  } else if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
  }

  return phone
}

export function extractSpreadsheetId(url: string): string | null {
  const patterns = [
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)\/edit/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

export function extractGid(url: string): string | null {
  // URL에서 gid 파라미터 추출
  // 예: gid=1247490017 또는 #gid=1247490017
  const gidPattern = /[?&#]gid=([0-9]+)/
  const match = url.match(gidPattern)

  if (match && match[1]) {
    return match[1]
  }

  // gid가 없으면 null 반환 (자동 탐색 모드)
  return null
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
