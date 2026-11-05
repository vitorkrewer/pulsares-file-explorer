export interface Location {
  provider: string;
  root: string;
  path: string;
}

export interface Attrs {
  hidden: boolean;
  system: boolean;
  readOnly: boolean;
}

export type Kind = 'file' | 'dir' | 'symlink' | 'other';

export interface Entry {
  name: string;
  location: Location;
  kind: Kind;
  size: number;
  modTime: string;
  attrs: Attrs;
  target?: Location;
}

export type Tri = 'yes' | 'no' | 'unknown';

export interface TreeNode {
  name: string;
  location: Location;
  hasChildren: Tri;
  isLink: boolean;
  hidden: boolean;
}

export interface DriveInfo {
  path: string;
  label: string;
  freeBytes?: number;
  totalBytes?: number;
  isRemovable?: boolean;
}

export interface InitialState {
  systemLanguage: string;
  homeDir: string;
  drives: DriveInfo[];
  language: string;
  theme: string;
  sessionData?: string;
}

export interface ListingBatchEvent {
  requestId: string;
  entries: Entry[];
}

export interface ListingDoneEvent {
  requestId: string;
  total: number;
  error?: string;
}

// Declaração de objetos injetados pelo Wails runtime
declare global {
  interface Window {
    go?: {
      app: {
        App: {
          GetInitialState: () => Promise<InitialState>;
          ListDirectory: (tabId: string, requestId: string, path: string) => Promise<void>;
          CancelListing: (tabId: string) => Promise<void>;
          TreeRoots: () => Promise<TreeNode[]>;
          TreeChildren: (path: string, showHidden: boolean) => Promise<TreeNode[]>;
          SaveSession: (data: string) => Promise<void>;
          LoadSession: () => Promise<string>;
          OpenPath: (path: string) => Promise<void>;
          GetDrives: () => Promise<DriveInfo[]>;
          GetSetting: (key: string) => Promise<string>;
          SetSetting: (key: string, val: string) => Promise<void>;
        };
      };
    };
    runtime?: {
      EventsOn: (eventName: string, callback: (data: unknown) => void) => () => void;
      EventsOff: (eventName: string) => void;
    };
  }
}

export const isWailsAvailable = (): boolean => {
  return typeof window !== 'undefined' && !!window.go?.app?.App;
};

export async function getInitialState(): Promise<InitialState> {
  if (isWailsAvailable()) {
    return window.go!.app.App.GetInitialState();
  }
  return {
    systemLanguage: navigator.language || 'en',
    homeDir: '/',
    drives: [{ path: '/', label: '/' }],
    language: 'auto',
    theme: 'system',
    sessionData: '',
  };
}

export async function listDirectory(tabId: string, requestId: string, path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ListDirectory(tabId, requestId, path);
  }
  console.warn('[Wails Mock] listDirectory', { tabId, requestId, path });
}

export async function cancelListing(tabId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CancelListing(tabId);
  }
}

export async function treeRoots(): Promise<TreeNode[]> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TreeRoots();
  }
  return [
    {
      name: '/',
      location: { provider: 'local', root: '/', path: '/' },
      hasChildren: 'yes',
      isLink: false,
      hidden: false,
    },
  ];
}

export async function treeChildren(path: string, showHidden: boolean): Promise<TreeNode[]> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TreeChildren(path, showHidden);
  }
  return [];
}

export async function saveSession(data: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SaveSession(data);
  }
}

export async function loadSession(): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.LoadSession();
  }
  return '';
}

export async function openPath(path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.OpenPath(path);
  }
  console.log('[Wails Mock] OpenPath', path);
}

export async function saveSetting(key: string, val: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SetSetting(key, val);
  }
}

export function subscribeEvent<T>(eventName: string, callback: (data: T) => void): () => void {
  if (typeof window !== 'undefined' && window.runtime?.EventsOn) {
    return window.runtime.EventsOn(eventName, (data: unknown) => {
      callback(data as T);
    });
  }
  return () => {};
}
