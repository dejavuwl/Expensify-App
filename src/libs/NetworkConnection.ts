import NetInfo from '@react-native-community/netinfo';
import throttle from 'lodash/throttle';
import Onyx from 'react-native-onyx';
import CONFIG from '@src/CONFIG';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import * as NetworkActions from './actions/Network';
import AppStateMonitor from './AppStateMonitor';
import Log from './Log';

let isOffline = false;
let hasPendingNetworkCheck = false;

// Holds all of the callbacks that need to be triggered when the network reconnects
let callbackID = 0;
const reconnectionCallbacks: Record<string, () => void> = {};

/**
 * Loop over all reconnection callbacks and fire each one
 */
const triggerReconnectionCallbacks = throttle(
    (reason) => {
        Log.info(`[NetworkConnection] Firing reconnection callbacks because ${reason}`);
        Object.values(reconnectionCallbacks).forEach((callback) => {
            callback();
        });
    },
    5000,
    {trailing: false},
);

/**
 * Called when the offline status of the app changes and if the network is "reconnecting" (going from offline to online)
 * then all of the reconnection callbacks are triggered
 */
function setOfflineStatus(isCurrentlyOffline: boolean): void {
    NetworkActions.setIsOffline(isCurrentlyOffline);

    // When reconnecting, ie, going from offline to online, all the reconnection callbacks
    // are triggered (this is usually Actions that need to re-download data from the server)
    if (isOffline && !isCurrentlyOffline) {
        NetworkActions.setIsBackendReachable(true);
        triggerReconnectionCallbacks('offline status changed');
    }

    isOffline = isCurrentlyOffline;
}

// Update the offline status in response to changes in shouldForceOffline
let shouldForceOffline = false;
Onyx.connect({
    key: ONYXKEYS.NETWORK,
    callback: (network) => {
        if (!network) {
            return;
        }
        const currentShouldForceOffline = Boolean(network.shouldForceOffline);
        if (currentShouldForceOffline === shouldForceOffline) {
            return;
        }
        shouldForceOffline = currentShouldForceOffline;
        if (shouldForceOffline) {
            setOfflineStatus(true);
        } else {
            // If we are no longer forcing offline fetch the NetInfo to set isOffline appropriately
            NetInfo.fetch().then((state) => setOfflineStatus(state.isInternetReachable === false));
        }
    },
});

/**
 * Set up the event listener for NetInfo to tell whether the user has
 * internet connectivity or not. This is more reliable than the Pusher
 * `disconnected` event which takes about 10-15 seconds to emit.
 */
function subscribeToNetInfo() {
    let backendReachabilityCheckInterval: NodeJS.Timeout;
    // Note: We are disabling the reachability check when using the local web API since requests can get stuck in a 'Pending' state and are not reliable indicators for "offline".
    // If you need to test the "recheck" feature then switch to the production API proxy server.
    if (!CONFIG.IS_USING_LOCAL_WEB) {
        // Set interval to (re)check current state every 60 seconds
        backendReachabilityCheckInterval = setInterval(() => {
            // Offline status also implies backend unreachability
            if (isOffline) {
                return;
            }
            // Using the API url ensures reachability is tested over internet
            fetch(`${CONFIG.EXPENSIFY.DEFAULT_API_ROOT}api?command=Ping`, {
                method: 'GET',
                cache: 'no-cache',
            })
                .then((response) => {
                    if (!response.ok) {
                        return Promise.resolve(false);
                    }
                    return response
                        .json()
                        .then((json) => Promise.resolve(json.jsonCode === 200))
                        .catch(() => Promise.resolve(false));
                })
                .then(NetworkActions.setIsBackendReachable)
                .catch(() => NetworkActions.setIsBackendReachable(false));
        }, CONST.NETWORK.REACHABILITY_TIMEOUT_MS);
    }

    // Subscribe to the state change event via NetInfo so we can update
    // whether a user has internet connectivity or not.
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        Log.info('[NetworkConnection] NetInfo state change', false, {...state});
        if (shouldForceOffline) {
            Log.info('[NetworkConnection] Not setting offline status because shouldForceOffline = true');
            return;
        }
        setOfflineStatus(state.isInternetReachable === false);
    });

    return () => {
        clearInterval(backendReachabilityCheckInterval);
        unsubscribeNetInfo();
    };
}

function listenForReconnect() {
    Log.info('[NetworkConnection] listenForReconnect called');

    AppStateMonitor.addBecameActiveListener(() => {
        triggerReconnectionCallbacks('app became active');
    });
}

/**
 * Register callback to fire when we reconnect
 * @returns unsubscribe method
 */
function onReconnect(callback: () => void): () => void {
    const currentID = callbackID;
    callbackID++;
    reconnectionCallbacks[currentID] = callback;
    return () => delete reconnectionCallbacks[currentID];
}

/**
 * Delete all queued reconnection callbacks
 */
function clearReconnectionCallbacks() {
    Object.keys(reconnectionCallbacks).forEach((key) => delete reconnectionCallbacks[key]);
}

/**
 * Refresh NetInfo state.
 */
function recheckNetworkConnection() {
    if (hasPendingNetworkCheck) {
        return;
    }

    Log.info('[NetworkConnection] recheck NetInfo');
    hasPendingNetworkCheck = true;
    NetInfo.refresh().finally(() => (hasPendingNetworkCheck = false));
}

export default {
    clearReconnectionCallbacks,
    setOfflineStatus,
    listenForReconnect,
    onReconnect,
    triggerReconnectionCallbacks,
    recheckNetworkConnection,
    subscribeToNetInfo,
};
