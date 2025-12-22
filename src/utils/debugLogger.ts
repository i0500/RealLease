/**
 * Debug Logger Utility
 *
 * 콘솔 로그를 캡처하여 앱 내에서 확인할 수 있도록 합니다.
 * 설정 페이지의 디버그 모드에서 로그를 확인할 수 있습니다.
 */

export interface LogEntry {
  timestamp: Date
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: any
}

class DebugLogger {
  private logs: LogEntry[] = []
  private maxLogs: number = 500
  private isEnabled: boolean = false
  private originalConsole: {
    log: typeof console.log
    info: typeof console.info
    warn: typeof console.warn
    error: typeof console.error
    debug: typeof console.debug
  }

  constructor() {
    // 원본 console 메서드 저장
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    }

    // 저장된 설정 로드
    this.loadSettings()
  }

  private loadSettings(): void {
    try {
      const enabled = localStorage.getItem('debug_logger_enabled')
      this.isEnabled = enabled === 'true'

      if (this.isEnabled) {
        this.enable()
      }
    } catch (e) {
      // 설정 로드 실패 시 무시
    }
  }

  /**
   * 디버그 로거 활성화
   * console 메서드를 가로채서 로그를 저장합니다
   */
  enable(): void {
    if (this.isEnabled) return

    this.isEnabled = true
    localStorage.setItem('debug_logger_enabled', 'true')

    // console 메서드 오버라이드
    console.log = (...args: any[]) => {
      this.capture('log', args)
      this.originalConsole.log(...args)
    }

    console.info = (...args: any[]) => {
      this.capture('info', args)
      this.originalConsole.info(...args)
    }

    console.warn = (...args: any[]) => {
      this.capture('warn', args)
      this.originalConsole.warn(...args)
    }

    console.error = (...args: any[]) => {
      this.capture('error', args)
      this.originalConsole.error(...args)
    }

    console.debug = (...args: any[]) => {
      this.capture('debug', args)
      this.originalConsole.debug(...args)
    }

    this.originalConsole.log('🔧 [DebugLogger] Debug logging enabled')
  }

  /**
   * 디버그 로거 비활성화
   */
  disable(): void {
    if (!this.isEnabled) return

    this.isEnabled = false
    localStorage.setItem('debug_logger_enabled', 'false')

    // 원본 console 메서드 복원
    console.log = this.originalConsole.log
    console.info = this.originalConsole.info
    console.warn = this.originalConsole.warn
    console.error = this.originalConsole.error
    console.debug = this.originalConsole.debug

    this.originalConsole.log('🔧 [DebugLogger] Debug logging disabled')
  }

  /**
   * 로그 캡처
   */
  private capture(level: LogEntry['level'], args: any[]): void {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message
    }

    this.logs.push(entry)

    // 최대 로그 수 제한
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  /**
   * 모든 로그 조회
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * 최근 로그 조회
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count)
  }

  /**
   * 레벨별 로그 필터링
   */
  getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level)
  }

  /**
   * 로그 초기화
   */
  clear(): void {
    this.logs = []
    this.originalConsole.log('🔧 [DebugLogger] Logs cleared')
  }

  /**
   * 로그를 텍스트로 내보내기
   */
  exportLogs(): string {
    return this.logs.map(log => {
      const time = log.timestamp.toISOString()
      return `[${time}] [${log.level.toUpperCase()}] ${log.message}`
    }).join('\n')
  }

  /**
   * 로거 활성화 상태 확인
   */
  isLoggerEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * 로그 개수 조회
   */
  getLogCount(): number {
    return this.logs.length
  }
}

// 싱글톤 인스턴스
export const debugLogger = new DebugLogger()

// 전역에서 접근 가능하도록 window에 추가 (개발용)
if (typeof window !== 'undefined') {
  (window as any).__debugLogger = debugLogger
}
