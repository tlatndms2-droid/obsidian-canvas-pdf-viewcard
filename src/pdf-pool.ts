import { App, loadPdfJs, TFile } from "obsidian";

interface Entry { refs: number; task?: any; promise: Promise<any> }
// One document/worker per file revision, shared by cards and the popup.
export class PdfPool {
  private entries = new Map<string, Entry>();
  constructor(private app: App) {}
  acquire(file: TFile): { document: Promise<any>; release: () => void } {
    const key = `${file.path}\0${file.stat.mtime}\0${file.stat.size}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { refs: 0, promise: Promise.resolve() };
      const current = entry;
      current.promise = (async () => {
        const [pdfjs, bytes] = await Promise.all([loadPdfJs(), this.app.vault.readBinary(file)]);
        current.task = pdfjs.getDocument({data: new Uint8Array(bytes), isEvalSupported: false});
        return await current.task.promise;
      })();
      this.entries.set(key, current);
      void current.promise.catch(() => {
        if(this.entries.get(key)===current)this.entries.delete(key);
      });
    }
    entry.refs++;
    const owned = entry;
    let released = false;
    return {
      document: owned.promise,
      release: () => {
        if (released) return;
        released = true;
        if (--owned.refs === 0) {
          if(this.entries.get(key)===owned)this.entries.delete(key);
          void owned.promise.catch(() => {}).then(() => owned.task?.destroy()).catch(() => {});
        }
      },
    };
  }
}
