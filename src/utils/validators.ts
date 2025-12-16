export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/
  return phoneRegex.test(phone.replace(/\s/g, ''))
}

export function validateSpreadsheetUrl(url: string): boolean {
  return url.includes('docs.google.com/spreadsheets')
}

export function validateRequired(value: any): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return value !== null && value !== undefined
}

export function validateNumberRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}
