export class GolfEngineError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GolfEngineError';
    this.code = code;
  }
}
