import { authService } from './authService'
import { mockSheetsService } from './mockSheetsService'

export interface SheetRange {
  range: string
  majorDimension?: 'ROWS' | 'COLUMNS'
  values?: any[][]
}

export class SheetsService {
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets'

  private isDevMode(): boolean {
    return import.meta.env.VITE_DEV_MODE === 'true'
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = authService.getAccessToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Sheets API error')
    }

    return response
  }

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.getSpreadsheetMetadata(spreadsheetId)
    }

    const url = `${this.baseUrl}/${spreadsheetId}`
    const response = await this.fetchWithAuth(url)
    return response.json()
  }

  async readRange(spreadsheetId: string, range: string): Promise<any[][]> {
    if (this.isDevMode()) {
      return mockSheetsService.readRange(spreadsheetId, range)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`
    const response = await this.fetchWithAuth(url)
    const data = await response.json()
    return data.values || []
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.writeRange(spreadsheetId, range, values, valueInputOption)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`
    const response = await this.fetchWithAuth(url, {
      method: 'PUT',
      body: JSON.stringify({ values })
    })
    return response.json()
  }

  async appendRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.appendRow(spreadsheetId, range, values, valueInputOption)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}`
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify({ values: [values] })
    })
    return response.json()
  }

  async updateRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.updateRow(spreadsheetId, range, values, valueInputOption)
    }

    return this.writeRange(spreadsheetId, range, [values], valueInputOption)
  }

  async batchUpdate(spreadsheetId: string, requests: any[]): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.batchUpdate(spreadsheetId, requests)
    }

    const url = `${this.baseUrl}/${spreadsheetId}:batchUpdate`
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify({ requests })
    })
    return response.json()
  }

  async getSheetNames(spreadsheetId: string): Promise<string[]> {
    if (this.isDevMode()) {
      return mockSheetsService.getSheetNames(spreadsheetId)
    }

    const metadata = await this.getSpreadsheetMetadata(spreadsheetId)
    return metadata.sheets?.map((sheet: any) => sheet.properties.title) || []
  }

  async clearRange(spreadsheetId: string, range: string): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.clearRange(spreadsheetId, range)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`
    const response = await this.fetchWithAuth(url, {
      method: 'POST'
    })
    return response.json()
  }
}

export const sheetsService = new SheetsService()
