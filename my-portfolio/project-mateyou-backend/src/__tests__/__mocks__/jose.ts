/**
 * jose 패키지 모킹
 * Jest가 ESM 모듈을 처리하지 못하므로 모킹
 */

export const compactDecrypt = jest.fn();
export const compactEncrypt = jest.fn();
export const CompactEncrypt = jest.fn();
export const CompactDecrypt = jest.fn();

export default {
  compactDecrypt,
  compactEncrypt,
  CompactEncrypt,
  CompactDecrypt,
};

