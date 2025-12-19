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
  category: string // 구분 (B열) - 자동 넘버링
  building: string // 동 (C열)
  unit: string // 동-호 (E열)
  buyer: string // 계약자 (F열)
  contractDate?: Date // 계약일 (G열)

  // 결제 정보 (단위: 천원)
  downPayment2Date?: Date // 계약금 2차 일자 (I열)
  downPayment2: number // 계약금 2차 금액 (J열)

  interimPayment1Date?: Date // 중도금 1차 일자 (K열)
  interimPayment1: number // 중도금 1차 금액 (L열)

  interimPayment2Date?: Date // 중도금 2차 일자 (M열)
  interimPayment2: number // 중도금 2차 금액 (N열)

  interimPayment3Date?: Date // 중도금 3차 일자 (O열)
  interimPayment3: number // 중도금 3차 금액 (P열)

  finalPaymentDate?: Date // 잔금 일자 (Q열)
  finalPayment: number // 잔금 금액 (R열)
  totalAmount: number // 합계 (S열)

  // 추가 정보
  contractFormat: string // 계약형식 (T열)
  bondTransfer: string // 채권양도 (U열)
  status: 'active' | 'completed' // 진행중/종결
  notes: string // 비고 (V열에 "종결 (note text)" 형식으로 저장)

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
