import { buildPlanetTiling, type PlanetWorldData, type PlanetTiling } from '../modules/planet/tiles';

// Define the incoming message format
export type TilingWorkerRequest = {
    type: 'BUILD_TILING';
    world: PlanetWorldData;
};

// Define the outgoing message format
export type TilingWorkerResponse = {
    type: 'TILING_COMPLETE';
    tiling: PlanetTiling;
} | {
    type: 'TILING_ERROR';
    error: string;
};

self.onmessage = (e: MessageEvent<TilingWorkerRequest>) => {
    if (e.data.type === 'BUILD_TILING') {
        try {
            const tiling = buildPlanetTiling(e.data.world);

            const response: TilingWorkerResponse = {
                type: 'TILING_COMPLETE',
                tiling
            };

            // Post the structured tiling back to the main thread
            self.postMessage(response);
        } catch (error) {
            console.error("Worker Tiling Error: ", error);
            const response: TilingWorkerResponse = {
                type: 'TILING_ERROR',
                error: error instanceof Error ? error.message : "Unknown worker error"
            };
            self.postMessage(response);
        }
    }
};
