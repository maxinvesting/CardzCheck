import { createPublicClient, http } from "viem";
import { publicConfig } from "./env";

export function getPublicClient() {
  return createPublicClient({
    transport: http(publicConfig.rpcUrl),
  });
}
