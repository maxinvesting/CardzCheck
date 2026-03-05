"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        className="rounded-md bg-brand-900 px-3 py-2 text-sm font-medium text-white"
        onClick={() => disconnect()}
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  const injectedConnector = connectors[0];
  const disabled = !injectedConnector;

  return (
    <button
      className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => {
        if (injectedConnector) {
          connect({ connector: injectedConnector });
        }
      }}
      disabled={disabled}
      type="button"
    >
      {disabled ? "No Wallet Found" : "Connect Wallet"}
    </button>
  );
}
