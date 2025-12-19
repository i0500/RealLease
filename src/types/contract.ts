export interface RentalContract {
  id: string
  sheetId: string
  rowIndex: number

  // A열: 공란
  // B열: 번호 (자동 넘버링)
  number: string

  // C열: 동
  building: string

  // D열: 호
  unit: string

  // E열: 계약자이름
  tenantName: string

  // F열: 연락처
  phone: string

  // G열: 연락처2 (일부 "갱신/신규" 텍스트)
  phone2OrContractType: string

  // H열: 계약유형
  contractType: string

  // I열: 주민번호
  idNumber: string

  // J열: 전용면积
  exclusiveArea: string

  // K열: 공급면적
  supplyArea: string

  // L열: 임대보증금 (232,000,000 형태)
  deposit: number

  // M열: 월세 (945,000 형태)
  monthlyRent: number

  // N열: 계약서작성일
  contractWrittenDate?: Date

  // O열: 시작일 (24-10-25 형태)
  startDate?: Date

  // P열: 종료일 (26/05/26(화) 형태)
  endDate?: Date

  // Q열: 실제퇴거일
  actualMoveOutDate?: Date

  // R열: 계약기간 (1, 2 = 년, "4개월" = 개월)
  contractPeriod: string

  // S열: 보증보험 시작일 (24-7-9 형태)
  hugStartDate?: Date

  // T열: 보증보험 종료일 (26-7-8 형태, 3개월 전 알림)
  hugEndDate?: Date

  // U, V, W, X열: 갱신/퇴거/고민중/보증보험 내용 등
  additionalInfo1: string // U열
  additionalInfo2: string // V열
  additionalInfo3: string // W열
  additionalInfo4: string // X열

  // Y열: 기타사항/비고
  notes: string

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
