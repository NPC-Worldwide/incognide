import React, { createContext, useContext } from 'react';

export const StudioContentContext = createContext<React.MutableRefObject<Record<string, any>> | null>(null);

export function useStudioContentData() {
  return useContext(StudioContentContext);
}
