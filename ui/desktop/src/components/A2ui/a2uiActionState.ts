import { createContext } from 'react';

/** True while an action from this surface is waiting for the server's reply. */
export const A2uiActionPending = createContext(false);
