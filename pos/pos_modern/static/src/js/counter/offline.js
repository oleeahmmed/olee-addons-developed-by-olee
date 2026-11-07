import { ConnectionAbortedError, ConnectionLostError } from "@web/core/network/rpc";

/**
 * Offline sales: when the server cannot be reached (internet or load-shedding cut while
 * the counter is open), a paid order is kept in this browser and sent again later.
 * The server saves an order once per client uuid, so sending it twice is harmless.
 *
 * The counter must have been opened while online (products and prices are in memory).
 */
const KEY = "pos_modern.offline_queue";

export function isConnectionError(error) {
    return (
        error instanceof ConnectionLostError ||
        error instanceof ConnectionAbortedError ||
        error?.name === "ConnectionLostError" ||
        (typeof navigator !== "undefined" && navigator.onLine === false)
    );
}

export function readQueue() {
    try {
        return JSON.parse(window.localStorage.getItem(KEY) || "[]");
    } catch {
        return [];
    }
}

function writeQueue(queue) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(queue));
    } catch {
        // storage full or private window: nothing more we can do
    }
}

export function queueOrder(configId, payload, receipt) {
    const queue = readQueue().filter((e) => e.payload.uuid !== payload.uuid);
    queue.push({ configId, payload, receipt, at: new Date().toISOString(), error: "" });
    writeQueue(queue);
    return queue.length;
}

export function dropQueued(uuid) {
    writeQueue(readQueue().filter((e) => e.payload.uuid !== uuid));
}

let flushing = false;

/** Send the queued orders; returns { sent, left, errors }. */
export async function flushQueue(orm) {
    if (flushing) {
        return { sent: 0, left: readQueue().length, errors: [] };
    }
    flushing = true;
    let sent = 0;
    const errors = [];
    try {
        for (const entry of readQueue()) {
            try {
                await orm.silent.call("pos.config", "pos_modern_create_order", [[entry.configId], entry.payload]);
                dropQueued(entry.payload.uuid);
                sent++;
            } catch (error) {
                if (isConnectionError(error)) {
                    break;
                }
                // refused by the server (session closed, product archived…): keep it, show why
                const queue = readQueue();
                const item = queue.find((e) => e.payload.uuid === entry.payload.uuid);
                if (item) {
                    item.error = error?.data?.message || error?.message || String(error);
                    writeQueue(queue);
                }
                errors.push(entry.payload.uuid);
            }
        }
    } finally {
        flushing = false;
    }
    return { sent, left: readQueue().length, errors };
}
