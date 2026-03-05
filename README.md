# CardzCheck Pegged Market (Prototype)

End-to-end buy-only prototype that hard-pegs each card SKU to an oracle-signed aggregate of recent sold comps.

## Monorepo Layout

- `contracts/`: Foundry contracts + tests + deploy script
- `apps/web/`: Next.js 14 app (marketplace, admin, SKU detail)
- `apps/oracle/`: Oracle module + CLI to compute median and sign EIP-712 `PriceUpdate`
- `supabase/migrations/0001_peg_market.sql`: prototype schema for `skus`, `sold_comps`, `peg_updates`

## What Is Implemented

- `PegOracle.sol`
  - Approved signer mapping (1-of-N in v1 with `requiredSigners` placeholder)
  - EIP-712 `PriceUpdate` verification
  - Monotonic nonce per SKU
  - Expiry + observedAt sanity checks
  - Circuit breaker + SKU halt windows
- `InventoryVault.sol`
  - Minimal ERC-1155 inventory
  - Owner minting
- `PegMarket.sol`
  - Buy-only at exact current peg
  - `maxTotal` slippage guard
  - USDC transfer to treasury + ERC1155 transfer to buyer
- `MockUSDC.sol`
  - 6-decimal ERC-20 with owner mint

## Contract Note (Circuit Breaker)

A triggered halt cannot both persist state **and** revert in the same EVM transaction. This implementation persists halt state and emits `Halted`, then skips peg update. Calls while halted revert with `PegHaltedOrTriggered`.

## Quick Start

1. Install dependencies

```bash
corepack pnpm install
```

2. Configure env files

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/oracle/.env.example apps/oracle/.env
```

Set required values in `apps/web/.env.local` and `apps/oracle/.env`.

3. Start Supabase (local or hosted)

- Local example:

```bash
supabase start
supabase db reset
```

- Apply migration if needed:

```bash
supabase db push
```

4. Start local chain

```bash
anvil
```

5. Run contracts tests

If `forge`/`anvil` are missing, install Foundry once:

```bash
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup
```

```bash
cd contracts
forge test -vv
```

6. Deploy contracts

Set env for deploy script (`PRIVATE_KEY`, `ORACLE_SIGNER`, `TREASURY`, `RPC_URL`), then:

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast
```

7. Fill deployed contract addresses into `apps/web/.env.local`

- `NEXT_PUBLIC_MARKET_ADDRESS`
- `NEXT_PUBLIC_PEG_ORACLE_ADDRESS`
- `NEXT_PUBLIC_INVENTORY_VAULT_ADDRESS`
- `NEXT_PUBLIC_USDC_ADDRESS`
- `NEXT_PUBLIC_ADMIN_ADDRESS`

8. Run web app

```bash
corepack pnpm --filter @cardzcheck/web dev
```

Open [http://localhost:3000](http://localhost:3000).

## Admin Flow (End-to-End)

1. Go to `/admin` with admin wallet.
2. Create SKU in Supabase.
3. Optionally compute `skuId` from normalized fields using fingerprint helper.
4. Mint inventory to market via `InventoryVault.mint(market, tokenId, qty)`.
5. Add sold comps in Supabase.
6. Click **Compute + Sign Peg** (calls `/api/oracle/sign`, uses `apps/oracle` logic).
7. Click **Submit Peg Update On-Chain**.
8. Go to `/` and buy from marketplace at exact peg.

## Oracle CLI Example

```bash
corepack pnpm --filter @cardzcheck/oracle oracle:sign -- \
  --skuId 0x...bytes32 \
  --n 7 \
  --windowSeconds 2592000 \
  --chainId 31337 \
  --verifyingContract 0x...PegOracle
```

CLI output:

```json
{
  "update": {
    "skuId": "0x...",
    "pegPrice": "1250000",
    "method": "1",
    "n": "7",
    "windowSeconds": "2592000",
    "salesHash": "0x...",
    "observedAt": "1710100000",
    "expiry": "1710100300",
    "nonce": "4"
  },
  "signature": "0x..."
}
```

## Base Readiness

- Web config already accepts arbitrary chain ID + RPC URL.
- EIP-712 domain includes dynamic `chainId` and verifying contract.
- Switch `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, and deploy addresses to target Base network.
