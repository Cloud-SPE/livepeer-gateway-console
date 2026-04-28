// Chain reader — viem-backed read-only client. Surfaces:
//
//   1. Controller → BondingManager / TicketBroker / ServiceRegistry resolution.
//      The Livepeer Controller exposes `getContract(bytes32 id)` keyed by
//      keccak256(name); we call it for each registry the gateway-console
//      cares about.
//   2. BondingManager pool walk — `getFirstTranscoderInPool` /
//      `getNextTranscoderInPool` / `getDelegator`. Real implementation in
//      per-repo Plan 0001; bootstrap ships the wiring + a throwing stub so
//      the runtime can be constructed without surprising tests.
//   3. TicketBroker.getReserveInfo — sender escrow view.
//   4. ServiceRegistry.getServiceURI — per-orch row's manifest URL.
//
// Tests stub the ChainReader interface; live-RPC verification belongs in
// staging, not unit tests.

import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  type Address,
} from 'viem';

const CONTROLLER_ABI = [
  {
    type: 'function',
    name: 'getContract',
    stateMutability: 'view',
    inputs: [{ name: '_id', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const BONDING_MANAGER_ID = keccak256(toBytes('BondingManager'));
const TICKET_BROKER_ID = keccak256(toBytes('TicketBroker'));
const SERVICE_REGISTRY_ID = keccak256(toBytes('ServiceRegistry'));

export interface ChainReaderOptions {
  rpcUrl: string;
  chainId: number;
}

/**
 * Active-set entry surfaced by walking the BondingManager pool linked
 * list. Real implementation in per-repo Plan 0001; the shape is locked
 * here so handlers can be wired against the interface today.
 */
export interface BondingPoolEntry {
  address: Address;
  /** Total stake (self + delegated) in wei, decimal string. */
  totalStakeWei: string;
}

export interface ReserveInfo {
  /** TicketBroker deposit in wei, decimal string. */
  depositWei: string;
  /** TicketBroker reserve in wei, decimal string. */
  reserveWei: string;
}

export interface ChainReader {
  readonly chainId: number;
  resolveBondingManager(controllerAddress: Address): Promise<Address>;
  resolveTicketBroker(controllerAddress: Address): Promise<Address>;
  resolveServiceRegistry(controllerAddress: Address): Promise<Address>;
  /** Walk the BondingManager active-set pool. Throws stub today. */
  bondingManagerListPool(bondingManager: Address): Promise<BondingPoolEntry[]>;
  /** Read TicketBroker.getReserveInfo for `sender`. Throws stub today. */
  getReserveInfo(ticketBroker: Address, sender: Address): Promise<ReserveInfo>;
  /** Read ServiceRegistry.getServiceURI(orch). Throws stub today. */
  readServiceUri(serviceRegistry: Address, orchAddress: Address): Promise<string>;
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `ChainReader.${method} is not implemented in the bootstrap stub. ` +
        `Implement it in per-repo Plan 0001 (chain provider work).`,
    );
    this.name = 'NotImplementedError';
  }
}

export function createChainReader(options: ChainReaderOptions): ChainReader {
  const client = createPublicClient({ transport: http(options.rpcUrl) });

  const resolveByName = async (
    controllerAddress: Address,
    id: `0x${string}`,
  ): Promise<Address> => {
    return client.readContract({
      address: controllerAddress,
      abi: CONTROLLER_ABI,
      functionName: 'getContract',
      args: [id],
    });
  };

  return {
    chainId: options.chainId,
    async resolveBondingManager(controllerAddress) {
      return resolveByName(controllerAddress, BONDING_MANAGER_ID);
    },
    async resolveTicketBroker(controllerAddress) {
      return resolveByName(controllerAddress, TICKET_BROKER_ID);
    },
    async resolveServiceRegistry(controllerAddress) {
      return resolveByName(controllerAddress, SERVICE_REGISTRY_ID);
    },
    async bondingManagerListPool(_bondingManager) {
      throw new NotImplementedError('bondingManagerListPool');
    },
    async getReserveInfo(_ticketBroker, _sender) {
      throw new NotImplementedError('getReserveInfo');
    },
    async readServiceUri(_serviceRegistry, _orchAddress) {
      throw new NotImplementedError('readServiceUri');
    },
  };
}
