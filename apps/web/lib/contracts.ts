export const pegOracleAbi = [
  {
    type: "function",
    name: "getState",
    stateMutability: "view",
    inputs: [{ name: "skuId", type: "bytes32" }],
    outputs: [
      {
        name: "state",
        type: "tuple",
        components: [
          { name: "pegPrice", type: "uint256" },
          { name: "observedAt", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "halted", type: "bool" },
          { name: "haltUntil", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPeg",
    stateMutability: "view",
    inputs: [{ name: "skuId", type: "bytes32" }],
    outputs: [
      { name: "pegPrice", type: "uint256" },
      { name: "observedAt", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "submitPriceUpdate",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "u",
        type: "tuple",
        components: [
          { name: "skuId", type: "bytes32" },
          { name: "pegPrice", type: "uint256" },
          { name: "method", type: "uint256" },
          { name: "n", type: "uint256" },
          { name: "windowSeconds", type: "uint256" },
          { name: "salesHash", type: "bytes32" },
          { name: "observedAt", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const inventoryVaultAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const pegMarketAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "skuId", type: "bytes32" },
      { name: "qty", type: "uint256" },
      { name: "maxTotal", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const mockUsdcAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
