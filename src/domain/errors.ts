export type DomainErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'DRAFT_ALREADY_STARTED'
  | 'DRAFT_NOT_STARTED'
  | 'DRAFT_COMPLETE'
  | 'DRAFT_PAUSED'
  | 'DRAFT_NOT_PAUSED'
  | 'OWNER_NOT_FOUND'
  | 'PLAYER_NOT_FOUND'
  | 'SLOT_NOT_FOUND'
  | 'SLOT_ALREADY_FILLED'
  | 'NOT_YOUR_SLOT'
  | 'SLOT_NOT_AVAILABLE'
  | 'OLDEST_OWED_FIRST'
  | 'PLAYER_ALREADY_DRAFTED'
  | 'CONFERENCE_ALREADY_USED'
  | 'WRITE_IN_DUPLICATE'
  | 'PLAYER_ID_ALREADY_EXISTS';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
