import { keccak256, stringToHex, type Hex } from "viem";

export type SkuFingerprintInput = {
  year: string;
  set: string;
  player: string;
  cardNo: string;
  parallel: string;
  grade: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeSkuId(input: SkuFingerprintInput): Hex {
  const canonical = JSON.stringify({
    year: normalize(input.year),
    set: normalize(input.set),
    player: normalize(input.player),
    cardNo: normalize(input.cardNo),
    parallel: normalize(input.parallel),
    grade: normalize(input.grade),
  });

  return keccak256(stringToHex(canonical));
}
