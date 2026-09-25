/* window.api：由 electron/preload.js 通过 contextBridge 注入 */
export interface ElectronApi {
  onMenu(handler: (channel: string) => void): void;
  saveText(text: string): Promise<boolean>;
}

declare global {
  interface Window {
    api?: ElectronApi;
  }
}
