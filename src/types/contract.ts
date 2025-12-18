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

// 매도현황 (Sales Contract) 인터페이스
export interface SaleContract {
  id: string
  sheetId: string
  rowIndex: number

  // 기본 정보
  category: string // 구분
  building: string // 동 (예: 108)
  unit: string // 동-호 (예: 108-407)
  buyer: string // 계약자
  contractDate?: Date // 계약일

  // 결제 정보 (단위: 천원)
  downPayment: number // 계약금 (H열)
  interimPayment: number // 중도금 (P열)
  finalPayment: number // 잔금 (R열)
  finalPaymentDate?: Date // 잔금일자 (Q열)
  totalAmount: number // 합계 (S열)

  // 추가 정보
  contractFormat: string // 계약형식 (T열)
  status: 'active' | 'completed' // 진행중/종결
  notes: string // 비고

  metadata: {
    createdAt: Date
    updatedAt: Date
    deletedAt?: Date
  }
}

// Union type for both contract types
export type Contract = RentalContract | SaleContract

// Type guards
export function isRentalContract(contract: Contract): contract is RentalContract {
  return 'tenant' in contract
}

export function isSaleContract(contract: Contract): contract is SaleContract {
  return 'buyer' in contract
}
