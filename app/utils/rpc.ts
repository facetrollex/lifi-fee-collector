import { BigNumber, ethers } from 'ethers'; // please use ethers v5 to ensure compatibility
import { FeeCollector__factory } from 'lifi-contract-types';
import { BlockTag } from '@ethersproject/abstract-provider';

interface ParsedFeeCollectedEvents {
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  token: string; // the address of the token that was collected
  integrator: string; // the integrator that triggered the fee collection
  integratorFee: BigNumber; // the share collector for the integrator
  lifiFee: BigNumber; // the share collected for lifi
}

class Rpc {
  private feeCollectorContract: ethers.Contract;

  constructor(contractAddress: string, rpcUrl: string) {
    this.feeCollectorContract = new ethers.Contract(
        contractAddress, 
        FeeCollector__factory.createInterface(), 
        new ethers.providers.JsonRpcProvider(rpcUrl)
    );
  }

  /**
   * For a given block range all `FeesCollected` events are loaded from the Polygon FeeCollector
   * @param fromBlock
   * @param toBlock
  */
  public async loadFeeCollectorEvents(fromBlock: BlockTag, toBlock: BlockTag): Promise<ethers.Event[]> {
    const filter = this.feeCollectorContract.filters.FeesCollected();
    return this.feeCollectorContract.queryFilter(filter, fromBlock, toBlock);
  }

  /**
   * Takes a list of raw events and parses them into ParsedFeeCollectedEvents
   * @param events
  */
  public async parseFeeCollectorEvents(events: ethers.Event[]): Promise<ParsedFeeCollectedEvents[]> {
    return events.map(event => {
      const parsedEvent = this.feeCollectorContract.interface.parseLog(event);
      return {
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        token: parsedEvent.args[0],
        integrator: parsedEvent.args[1],
        integratorFee: BigNumber.from(parsedEvent.args[2]),
        lifiFee: BigNumber.from(parsedEvent.args[3]),
      };
    });
  }
  
  // TODO: NEED TO move this at the top of collector initiation, just to verify that the chain
  // is reachable and the contract address is valid.
  /**
   * Verify the RPC is reachable and the contract address is valid.
   * Throws if either check fails.
   */
  public async testConnection(): Promise<void> {
    const provider = this.feeCollectorContract.provider;

    await provider.getBlockNumber();

    const code = await provider.getCode(this.feeCollectorContract.address);
    if (code === '0x') {
      throw new Error(`No contract deployed at ${this.feeCollectorContract.address}`);
    }
  }

  public async getMaxBlock(): Promise<number> {
    return await this.feeCollectorContract.provider.getBlockNumber();
  }
}

export {
    Rpc,
    type ParsedFeeCollectedEvents
};