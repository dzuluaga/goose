import { useEffect, useState } from 'react';
import { acpReadConfig } from '../../acp/config';

export const A2UI_FLAG_KEY = 'GOOSE_EXPERIMENTAL_A2UI';

let flagRead: Promise<boolean> | null = null;

/** Every tool call asks; the config is read from the server once per app session. */
function readA2uiFlag(): Promise<boolean> {
  flagRead ??= acpReadConfig(A2UI_FLAG_KEY).then(
    (value) => value === true || value === 'true',
    () => false
  );
  return flagRead;
}

export function resetA2uiFlagForTests() {
  flagRead = null;
}

export function useA2uiEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    readA2uiFlag().then((value) => {
      if (active) {
        setEnabled(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return enabled;
}
