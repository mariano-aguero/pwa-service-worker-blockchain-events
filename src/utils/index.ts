import {Contract, ethers} from "ethers";
import { unwrap } from 'idb';

/**
 * Get logs and extract information
 * @param provider
 * @param contract
 * @param fromBlock
 * @param toBlock
 * @param topics
 */
const getLogs = async (provider: ethers.providers.AlchemyProvider, contract: ethers.Contract, fromBlock : number, toBlock: number | string, topics: string[]) => {
    const rawLogs = await provider.getLogs({
        fromBlock,
        toBlock,
        address: contract.address,
        topics,
    });

    const parsedLogsPromises = rawLogs.map(async(log) => {
        const { args } = contract.interface.parseLog(log);
        const [ dst, src, amount ] = args;

        return { dst, src, amount: ethers.utils.formatUnits(amount, 18), trx: log.transactionHash };
    });

    return Promise.all(parsedLogsPromises);
};

/**
 * Main function to obtain past events between a range of blocks
 * @param contract
 * @param eventName
 * @param additionalTopics
 * @param fromBlock
 * @param toBlock
 * @param provider
 * @param blockChunk
 */
export const getPastEvents = async (contract: ethers.Contract, eventName: string, additionalTopics = [], fromBlock : number, toBlock: number | string, provider: ethers.providers.AlchemyProvider, blockChunk = 2000) => {
    const eventTopic: string = ethers.utils.id(eventName);
    const topics = [eventTopic, ...additionalTopics];
    return getChunks(
        fromBlock,
        toBlock,
        blockChunk,
        provider,
        contract,
        topics
    );
};

/**
 * Obtain chunks of logs between a range of blocks
 * @param fromBlock
 * @param toBlock
 * @param blockChunk
 * @param provider
 * @param contract
 * @param topics
 */
const getChunks = async (
    fromBlock: number,
    toBlock: number | string,
    blockChunk: number,
    provider: ethers.providers.AlchemyProvider,
    contract: Contract,
    topics: string[]
) => {
    let chunks = [{fromBlock, toBlock}];
    if (fromBlock) {
        const from = fromBlock;
        const to = toBlock === 'latest' ? (await provider.getBlock('latest')).number : toBlock as number;
        if (to - from > blockChunk) {
            chunks = [];
            let block = from;
            while (block + blockChunk < to) {
                chunks.push({fromBlock: block, toBlock: (block += blockChunk)});
                block++;
            }
            if (block < to) {
                chunks.push({fromBlock: block, toBlock});
            }
        }
    }

    const chunksPromises = chunks.map(async({fromBlock, toBlock}) => getLogs(provider, contract, fromBlock, toBlock, topics));
    return Promise.all(chunksPromises);
};

/**
 * Just map over an object like an array
 * @param obj
 * @param fn
 */
export const objectMap = (obj: any, fn: any) =>
    Object.fromEntries(
        Object.entries(obj).map(
            ([k, v], i) => [k, fn(v, k, i)]
        )
    );

/**
 * Manage error when saving on the store
 * @param promise
 */
export const  preventTransationCloseOnError = (promise: any) => {
    const request = unwrap(promise);
    // @ts-ignore
    request?.addEventListener('error', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
    });
    return promise;
}
