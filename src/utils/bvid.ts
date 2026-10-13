// https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/bvid_desc.html
// 新版 aid 可超过 2^53 附近的安全整数范围，计算统一使用 BigInt。
const XOR_CODE = BigInt('23442827791579')
const MAX_AID = BigInt(1) << BigInt(51)
const BASE = BigInt(58)
const ALPHABET = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf'

export function av2bv(aid: number | string | bigint): string {
  const bytes = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0']
  let index = bytes.length - 1
  let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE
  while (tmp > 0) {
    bytes[index] = ALPHABET[Number(tmp % BASE)]
    tmp = tmp / BASE
    index--
  }
  ;[bytes[3], bytes[9]] = [bytes[9], bytes[3]]
  ;[bytes[4], bytes[7]] = [bytes[7], bytes[4]]
  return bytes.join('')
}
