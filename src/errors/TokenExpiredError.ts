/**
 * OAuth 토큰 만료 에러
 * 401 Unauthorized 응답 시 발생
 * 자동 로그아웃 및 로그인 페이지 리디렉션을 트리거
 */
export class TokenExpiredError extends Error {
  constructor(message: string = 'OAuth 토큰이 만료되었습니다. 다시 로그인해주세요.') {
    super(message)
    this.name = 'TokenExpiredError'

    // TypeScript에서 Error를 상속할 때 필요
    Object.setPrototypeOf(this, TokenExpiredError.prototype)
  }
}

/**
 * TokenExpiredError 타입 가드
 */
export function isTokenExpiredError(error: unknown): error is TokenExpiredError {
  return error instanceof TokenExpiredError
}
