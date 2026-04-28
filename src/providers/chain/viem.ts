// Chain reader — viem-backed read-only client. Surfaces:
//
//   1. Controller → BondingManager / TicketBroker / ServiceRegistry
//      resolution. The Livepeer Controller exposes
//      `getContract(bytes32 id)` keyed by keccak256(name); we call it
//      for each registry the gateway-console cares about.
//   2. BondingManager pool walk —
//      `getFirstTranscoderInPool` / `getNextTranscoderInPool` /
//      `getDelegator`. Used by the routing dashboard's active-set + stake
//      column.
//   3. TicketBroker.getSenderInfo — sender deposit + reserve view.
//   4. ServiceRegistry.getServiceURI — per-orch row's manifest URL.
//
// Tests stub the viem client by passing a fake `ChainContractReader`
// into `createChainReader`. Live-RPC verification belongs in staging,
// not unit tests (Plan 0001 §2).

import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  type Address,
  type PublicClient,
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

const BONDING_MANAGER_ABI = [
  {
    type: 'function',
    name: 'getFirstTranscoderInPool',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getNextTranscoderInPool',
    stateMutability: 'view',
    inputs: [{ name: '_transcoder', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getDelegator',
    stateMutability: 'view',
    inputs: [{ name: '_delegator', type: 'address' }],
    outputs: [
      { name: 'bondedAmount', type: 'uint256' },
      { name: 'fees', type: 'uint256' },
      { name: 'delegatedAmount', type: 'uint256' },
      { name: 'delegateAddress', type: 'address' },
      { name: 'delegatedAmountFees', type: 'uint256' },
      { name: 'startRound', type: 'uint256' },
      { name: 'lastClaimRound', type: 'uint256' },
      { name: 'nextUnbondingLockId', type: 'uint256' },
    ],
  },
] as const;

const TICKET_BROKER_ABI = [
  {
    type: 'function',
    name: 'getSenderInfo',
    stateMutability: 'view',
    inputs: [{ name: '_sender', type: 'address' }],
    outputs: [
      {
        name: 'sender',
        type: 'tuple',
        components: [
          { name: 'deposit', type: 'uint256' },
          { name: 'withdrawRound', type: 'uint256' },
        ],
      },
      {
        name: 'reserve',
        type: 'tuple',
        components: [
          { name: 'fundsRemaining', type: 'uint256' },
          { name: 'claimedInCurrentRound', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

const SERVICE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getServiceURI',
    stateMutability: 'view',
    inputs: [{ name: '_addr', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

const BONDING_MANAGER_ID = keccak256(toBytes('BondingManager'));
const TICKET_BROKER_ID = keccak256(toBytes('TicketBroker'));
const SERVICE_REGISTRY_ID = keccak256(toBytes('ServiceRegistry'));

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POOL_WALK_SAFETY_LIMIT = 1000;

export interface ChainReaderOptions {
  rpcUrl: string;
  chainId: number;
}

export interface BondingPoolEntry {
  address: Address;
  /** delegatedAmount from BondingManager.getDelegator (raw wei, decimal string). */
  totalStakeWei: string;
}

export interface ReserveInfo {
  /** TicketBroker sender deposit (wei, decimal string). */
  depositWei: string;
  /** TicketBroker reserve fundsRemaining (wei, decimal string). */
  reserveWei: string;
}

export interface ChainReader {
  readonly chainId: number;
  resolveBondingManager(controllerAddress: Address): Promise<Address>;
  resolveTicketBroker(controllerAddress: Address): Promise<Address>;
  resolveServiceRegistry(controllerAddress: Address): Promise<Address>;
  bondingManagerListPool(bondingManager: Address): Promise<BondingPoolEntry[]>;
  getReserveInfo(ticketBroker: Address, sender: Address): Promise<ReserveInfo>;
  readServiceUri(serviceRegistry: Address, orchAddress: Address): Promise<string>;
  /** Native wallet balance in wei (decimal string). */
  getBalance(address: Address): Promise<string>;
}

/**
 * Test seam — `createChainReader` accepts an optional reader matching the
 * subset of `PublicClient` we use. Tests pass a stub; production passes
 * the real viem client.
 */
export type ChainContractReader = Pick<PublicClient, 'readContract' | 'getBalance'>;

export function createChainReader(
  options: ChainReaderOptions,
  reader?: ChainContractReader,
): ChainReader {
  const client: ChainContractReader =
    reader ?? createPublicClient({ transport: http(options.rpcUrl) });

  const resolveByName = (
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

    async bondingManagerListPool(bondingManager) {
      const out: BondingPoolEntry[] = [];
      let addr = (await client.readContract({
        address: bondingManager,
        abi: BONDING_MANAGER_ABI,
        functionName: 'getFirstTranscoderInPool',
      })) as Address;

      let steps = 0;
      while (addr.toLowerCase() !== ZERO_ADDRESS) {
        if (++steps > POOL_WALK_SAFETY_LIMIT) {
          throw new Error(
            `BondingManager pool walk exceeded ${POOL_WALK_SAFETY_LIMIT} entries; ` +
              `aborting (likely a corrupt linked list).`,
          );
        }
        const delegator = (await client.readContract({
          address: bondingManager,
          abi: BONDING_MANAGER_ABI,
          functionName: 'getDelegator',
          args: [addr],
        })) as readonly [bigint, bigint, bigint, Address, bigint, bigint, bigint, bigint];
        const delegatedAmount = delegator[2];
        out.push({ address: addr, totalStakeWei: delegatedAmount.toString(10) });

        addr = (await client.readContract({
          address: bondingManager,
          abi: BONDING_MANAGER_ABI,
          functionName: 'getNextTranscoderInPool',
          args: [addr],
        })) as Address;
      }
      return out;
    },

    async getReserveInfo(ticketBroker, sender) {
      const [senderInfo, reserveInfo] = (await client.readContract({
        address: ticketBroker,
        abi: TICKET_BROKER_ABI,
        functionName: 'getSenderInfo',
        args: [sender],
      })) as readonly [
        { deposit: bigint; withdrawRound: bigint },
        { fundsRemaining: bigint; claimedInCurrentRound: bigint },
      ];
      return {
        depositWei: senderInfo.deposit.toString(10),
        reserveWei: reserveInfo.fundsRemaining.toString(10),
      };
    },

    async readServiceUri(serviceRegistry, orchAddress) {
      const uri = (await client.readContract({
        address: serviceRegistry,
        abi: SERVICE_REGISTRY_ABI,
        functionName: 'getServiceURI',
        args: [orchAddress],
      })) as string;
      return uri;
    },

    async getBalance(address) {
      const balance = await client.getBalance({ address });
      return balance.toString(10);
    },
  };
}
