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
export interface PaymentStage {
  date?: Date
  amount: number
}

export interface SaleContract {
  id: string
  sheetId: string
  rowIndex: number

  // 기본 정보
  category: string // 구분
  unit: string // 동-호 (예: 108-407)
  buyer: string // 계약자

  // 결제 단계
  downPayment1?: PaymentStage // 계약금(1차)
  downPayment2?: PaymentStage // 계약금(2차)
  interimPayment1?: PaymentStage // 중도금(1차)
  interimPayment2?: PaymentStage // 중도금(2차)
  interimPayment3?: PaymentStage // 중도금(3차)/임대보증금대체
  finalPayment?: PaymentStage // 잔금

  totalAmount: number // 합계

  // 추가 정보
  contractFormat: string // 계약형식 (예: 임대일부말소)
  bondTransfer: string // 채권양도 (예: 없음, 있음)
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
