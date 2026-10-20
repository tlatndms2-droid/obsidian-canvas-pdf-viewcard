import { KeymapEventHandler, Modal, Notice, Plugin, Scope, TFile, WorkspaceLeaf } from "obsidian";
import { cardInitial, cardKey, defaultPopup, normalizeState, Settings } from "./model";
import { PdfPool } from "./pdf-pool";
import { PdfViewer } from "./viewer";

// Canvas has no public card-renderer API. Keep the small adapter guarded and
// restore the native embed on unload; never write to Canvas node data.
interface CanvasNode {
  id: string; nodeEl: HTMLElement; containerEl: HTMLElement; contentEl: HTMLElement;
  child?: {load():void;unload():void};
  unloadChild?:()=>void;
  canvas?: {markDirty(node:CanvasNode):void};
  file?: TFile; subpath?: string; destroyed?:boolean;
  getData(): {type:string;file?:string;subpath?:string};
}
interface CanvasView {
  file?: TFile; contentEl: HTMLElement;
  scope: Scope;
  canvas?: {nodes: Map<string,CanvasNode>;selection:Set<CanvasNode>;};
}
interface Mounted { node:CanvasNode; viewer:PdfViewer; file:TFile; stamp:number; key:string; subpath:string; child?:CanvasNode["child"]; dispose:()=>void }

export default class CanvasPdfViewcard extends Plugin {
  settings: Settings = {cards:{},popup:{...defaultPopup}};
  pool!: PdfPool;
  private mounted=new Map<CanvasNode,Mounted>();
  private observers=new Map<CanvasView,MutationObserver>();
  private enterBindings=new Map<CanvasView,KeymapEventHandler>();
  private popups=new Set<Modal>();
  private scanTimer?:number;
  private saveTimer?:number;
  private saving=Promise.resolve();
  private stopped=false;
  async onload() {
    const data=await this.loadData();
    const {page: _page, ...popup}=normalizeState({...defaultPopup,...data?.popup});
    this.settings={cards:data?.cards&&typeof data.cards==="object"?data.cards:{},popup};
    this.pool=new PdfPool(this.app);
    this.app.workspace.onLayoutReady(()=>this.scan());
    this.registerEvent(this.app.workspace.on("layout-change",()=>this.schedule()));
    this.registerEvent(this.app.workspace.on("file-open",()=>this.schedule()));
    this.registerEvent(this.app.vault.on("modify",file=>{if(file instanceof TFile&&file.extension.toLowerCase()==="pdf")this.schedule();}));
    this.registerEvent(this.app.vault.on("rename",(file,oldPath)=>{
      for(const [key,state] of Object.entries(this.settings.cards)){
        try {
          const [canvas,id]=JSON.parse(key);
          if(canvas===oldPath||canvas.startsWith(oldPath+"/")){
            delete this.settings.cards[key];this.settings.cards[cardKey(file.path+canvas.slice(oldPath.length),id)]=state;
          }
          if(state.file===oldPath||state.file.startsWith(oldPath+"/"))state.file=file.path+state.file.slice(oldPath.length);
        } catch {/* Ignore an invalid legacy key. */}
      }
      this.persist();this.schedule();
    }));
    this.registerInterval(window.setInterval(()=>this.scan(),1500));
  }
  private schedule() {
    if(this.stopped||this.scanTimer!==undefined)return;
    this.scanTimer=window.setTimeout(()=>{this.scanTimer=undefined;this.scan();},60);
  }
  private scan() {
    if(this.stopped)return;
    const views=new Set(this.app.workspace.getLeavesOfType("canvas").map((l:WorkspaceLeaf)=>l.view as unknown as CanvasView));
    const live=new Set<CanvasNode>();
    for(const [view,observer] of this.observers)if(!views.has(view)){
      observer.disconnect();this.observers.delete(view);
      const binding=this.enterBindings.get(view);if(binding)view.scope.unregister(binding);
      this.enterBindings.delete(view);
    }
    for(const view of views) {
      const canvas=view.canvas;
      if(!canvas?.nodes||!view.file)continue;
      if(!this.observers.has(view)){
        const observer=new MutationObserver(records=>{
          if(records.some(r=>!(r.target as Element).closest?.(".cpv-viewer")))this.schedule();
        });
        observer.observe(view.contentEl,{childList:true,subtree:true});this.observers.set(view,observer);
        // A wildcard binding can fall through for every unrelated Canvas action.
        const binding=view.scope.register(null,null,event=>{
          if(event.key!=="Enter"||event.altKey||event.shiftKey||event.metaKey)return;
          const target=event.target as HTMLElement;
          if(target.closest("input,textarea,[contenteditable=true]"))return;
          if(canvas.selection.size!==1)return;
          const node=canvas.selection.values().next().value;
          const mounted=node&&this.mounted.get(node);if(!mounted)return;
          event.preventDefault();event.stopPropagation();
          if(!event.repeat){
            if(event.ctrlKey){mounted.viewer.exitReading();this.openPopup(mounted.file,mounted.viewer.state.page);}
            else mounted.viewer.toggleReading();
          }
          return false;
        });
        // Canvas may have a catch-all handler before custom bindings.
        const keys=(view.scope as Scope & {keys:KeymapEventHandler[]}).keys;
        keys.splice(keys.indexOf(binding),1);keys.unshift(binding);
        this.enterBindings.set(view,binding);
      }
      for(const node of canvas.nodes.values()){
        const data=node.getData?.();
        if(data?.type!=="file"||!data.file?.toLowerCase().endsWith(".pdf")||!node.containerEl?.isConnected||node.destroyed)continue;
        const file=this.app.vault.getAbstractFileByPath(data.file);
        if(!(file instanceof TFile))continue;
        live.add(node);
        const key=cardKey(view.file.path,node.id),subpath=data.subpath??"";
        const existing=this.mounted.get(node);
        if(existing&&(existing.key!==key||existing.file.path!==file.path||existing.stamp!==file.stat.mtime||existing.subpath!==subpath||!existing.viewer.root.isConnected)){
          this.unmount(node);
        }
        if(!this.mounted.has(node))this.mount(view,node,file,key,subpath);
        const m=this.mounted.get(node);
        if(m&&node.child&&node.child!==m.child){m.child=node.child;node.child.unload();}
      }
    }
    for(const node of this.mounted.keys())if(!live.has(node))this.unmount(node);
  }
  private mount(view:CanvasView,node:CanvasNode,file:TFile,key:string,subpath:string) {
    node.nodeEl.classList.add("cpv-managed");
    const child=node.child;child?.unload();
    const open=()=>this.openPopup(file,viewer.state.page);
    const viewer=new PdfViewer(node.containerEl,{
      file,pool:this.pool,popup:false,
      keymap:this.app.keymap,parentScope:view.scope,
      state:cardInitial(this.settings.cards[key],file.path,subpath),
      active:()=>view.canvas?.selection.has(node)??false,
      changed:state=>{this.settings.cards[key]={...state,file:file.path,subpath};this.persist();},
      open,
    });
    const dblclick=(event:MouseEvent)=>{
      if((event.target as Element).closest(".cpv-toolbar"))return;
      if(!(event.target as Element).closest(".cpv-viewer,.canvas-node-content,.canvas-node-content-blocker"))return;
      event.preventDefault();event.stopImmediatePropagation();viewer.exitReading();open();
    };
    node.nodeEl.addEventListener("dblclick",dblclick,true);
    this.mounted.set(node,{node,viewer,file,stamp:file.stat.mtime,key,subpath,child,dispose:()=>node.nodeEl.removeEventListener("dblclick",dblclick,true)});
  }
  private unmount(node:CanvasNode) {
    const m=this.mounted.get(node);if(!m)return;
    m.dispose();m.viewer.destroy();node.nodeEl.classList.remove("cpv-managed");
    if(!node.destroyed&&node.nodeEl.isConnected){
      node.unloadChild?.();
      node.canvas?.markDirty(node);
    }
    this.mounted.delete(node);
  }
  private openPopup(file:TFile,page:number) {
    if(this.stopped||this.popups.size)return;
    const modal=new Modal(this.app);
    modal.scope.register([],"Enter",event=>{
      if((event.target as HTMLElement).closest("input,textarea,[contenteditable=true]"))return;
      event.preventDefault();event.stopPropagation();if(!event.repeat)modal.close();return false;
    });
    let viewer:PdfViewer|undefined;
    modal.onOpen=()=>{
      modal.modalEl.classList.add("cpv-modal");modal.setTitle(file.name);
      viewer=new PdfViewer(modal.contentEl,{
        file,pool:this.pool,popup:true,state:{...this.settings.popup,page},active:()=>true,
        keymap:this.app.keymap,parentScope:modal.scope,
        changed:state=>{const {page:_,...settings}=state;this.settings.popup=settings;this.persist();},
      });
      modal.contentEl.createDiv({cls:"cpv-popup-footer",text:"Enter 또는 Esc로 복귀 · 팝업에서 읽은 페이지는 카드에 반영되지 않습니다."});
    };
    modal.onClose=()=>{viewer?.destroy();this.popups.delete(modal);};
    this.popups.add(modal);modal.open();
  }
  private persist() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer=window.setTimeout(()=>this.flush(),250);
  }
  private flush() {
    const snapshot=JSON.parse(JSON.stringify(this.settings));
    this.saving=this.saving.then(()=>this.saveData(snapshot)).catch(e=>{
      console.error("Canvas PDF Viewcard: settings save failed",e);
      new Notice("PDF 보기 설정을 저장하지 못했습니다. 저장 공간을 확인해 주세요.");
    });
  }
  onunload() {
    this.stopped=true;window.clearTimeout(this.scanTimer);window.clearTimeout(this.saveTimer);
    for(const observer of this.observers.values())observer.disconnect();this.observers.clear();
    for(const [view,binding] of this.enterBindings)view.scope.unregister(binding);
    this.enterBindings.clear();
    for(const modal of this.popups)modal.close();
    for(const node of this.mounted.keys())this.unmount(node);
    this.flush();
  }
}
