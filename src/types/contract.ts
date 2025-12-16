export interface RentalContract {
  id: string
  sheetId: string
  rowIndex: number

  tenant: {
    name: string
    phone: string
    email?: string
    idNumber?: string
  }

  property: {
    address: string
    type: string
    unit?: string
  }

  contract: {
    type: 'jeonse' | 'wolse'
    deposit: number
    monthlyRent?: number
    startDate: Date
    endDate: Date
    status: 'active' | 'expired' | 'terminated'
    contractType: 'new' | 'renewal' | 'change'
  }

  hug?: {
    guaranteed: boolean
    startDate: Date
    endDate: Date
    amount: number
    insuranceNumber?: string
  }

  realtor?: {
    name: string
    phone: string
    address?: string
    fee?: number
  }

  metadata: {
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
  }
}

export type ContractFormData = Omit<RentalContract, 'id' | 'metadata'>
