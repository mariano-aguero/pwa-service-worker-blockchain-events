import { ethers } from 'ethers';
import { openDB } from 'idb';
import { TOKEN_ABI_ERC20 } from '../contracts_abis/erc20';
import { ALCHEMY_API, TOKEN_ADDRESS, FROM_BLOCK } from "../constants";
import {getPastEvents, objectMap, preventTransationCloseOnError} from "../utils";

const provider: ethers.providers.AlchemyProvider = new ethers.providers.AlchemyProvider(
    'homestead',
    ALCHEMY_API
);

const EVENT_TRANSFER_SIGNATURE: string = "Transfer(address,address,uint256)";

const tokenContract = new ethers.Contract(
    TOKEN_ADDRESS,
    TOKEN_ABI_ERC20,
    provider
);

export const run = (self: ServiceWorkerGlobalScope) => {
    self.addEventListener('install', event => {
        const asyncInstall = async () => {
            console.log('Waiting to fetch events.');
            const currentBlock = await provider.getBlockNumber();
            console.log(`Block number range: ${FROM_BLOCK} - ${currentBlock}.`);
            const chunks = await getPastEvents(tokenContract, EVENT_TRANSFER_SIGNATURE, [], FROM_BLOCK, currentBlock, provider, 10 );
            const amountOfEvents = chunks.reduce(
                (accumulator, currentValue) => accumulator + currentValue.length,
                0
            );

            const chunksFlattened = chunks.flat().reduce( (r, a) => {
                r[a.trx] = r[a.trx] || [];
                r[a.trx].push(a);
                return r;
            }, Object.create(null));

            console.log(`Chunks flattened ${Object.keys(chunksFlattened).length}.`);
            console.log(`Amount of events ${amountOfEvents}.`);

            // Start saving logs with indexedDB
            const db = await openDB('Events', 1, {
                upgrade(db) {
                    // Create a store of objects
                    db.createObjectStore('events', {
                        // The 'index' property of the object will be the key.
                        keyPath: 'trx',
                    });
                },
            });

            const tx = db.transaction('events', 'readwrite');
            const logsToStore = objectMap(chunksFlattened,async (value: any, key: any) => {
                const keyExist = await tx.store.get(key);
                if(keyExist) return Promise.resolve();
                return tx.store.add(value, key);
            });

            await Promise.all([
                ...Object.values(logsToStore).map((value) => preventTransationCloseOnError(value)),
                tx.done,
            ]);
            console.log('Events saved.');
        };

        event.waitUntil(asyncInstall());
    });

    self.addEventListener('activate', event => {
        console.log("Activate run.");
    });

}
