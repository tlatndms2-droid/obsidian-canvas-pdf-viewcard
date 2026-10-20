import { Keymap, Menu, Scope, setIcon, TFile } from "obsidian";
import { clampPage, fitScale, isContinuous, isSpread, Layout, layouts, pageRows, ViewState } from "./model";
import { PdfPool } from "./pdf-pool";

type Size = { width: number; height: number };
interface Slot { page: number; el: HTMLDivElement; canvas?: HTMLCanvasElement; task?: any; scale: number; pending: boolean }
export interface ViewerOptions {
  popup: boolean;
  state: ViewState;
  pool: PdfPool;
  file: TFile;
  active: () => boolean;
  changed: (state: ViewState) => void;
  open?: () => void;
  keymap: Keymap;
  parentScope: Scope;
}
export class PdfViewer {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly toolbar: HTMLDivElement;
  state: ViewState;
  private input: HTMLInputElement;
  private total: HTMLSpanElement;
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;
  private layoutButton?: HTMLButtonElement;
  private fitButton?: HTMLButtonElement;
  private zoomLabel?: HTMLSpanElement;
  private status: HTMLDivElement;
  private doc: any;
  private lease?: ReturnType<PdfPool["acquire"]>;
  private slots: Slot[] = [];
  private sizes = new Map<number, Size>();
  private fallback: Size = {width: 595, height: 842};
  private resize: ResizeObserver;
  private disposed = false;
  private generation = 0;
  private resizeTimer?: number;
  private frame = 0;
  private lastWidth = 0;
  private lastHeight = 0;
  private navigating = false;
  private navTimer?: number;
  private menu?: Menu;
  private jobs = 0;
  private win: Window;
  private keyScope: Scope;
  private scopeActive = false;
  private reading = false;
  private readingHint?: HTMLDivElement;
  private outside = (event: PointerEvent) => {
    if (!this.root.contains(event.target as Node) && !(event.target as Element).closest(".menu")) this.exitReading();
  };

  constructor(parent: HTMLElement, private options: ViewerOptions) {
    this.win = parent.ownerDocument.defaultView!;
    this.state = {...options.state};
    this.root = parent.createDiv({cls: `cpv-viewer ${options.popup ? "cpv-popup-viewer" : "cpv-card-viewer"}`});
    this.root.setAttribute("aria-label", `${options.file.name} PDF 보기`);
    this.toolbar = this.root.createDiv({cls: "cpv-toolbar"});
    this.toolbar.setAttribute("role", "toolbar");
    this.prev = this.button(this.toolbar, "chevron-left", "이전 페이지", () => this.go(this.state.page - (isSpread(this.state.layout) ? 2 : 1)));
    this.input = this.toolbar.createEl("input", {cls:"cpv-page-input", type:"number", attr: {"aria-label":"페이지 번호", min:"1", value:String(this.state.page)}});
    this.input.addEventListener("change", () => this.go(Number(this.input.value)));
    this.input.addEventListener("keydown", e => { e.stopPropagation(); if(e.key === "Enter") {this.go(Number(this.input.value));this.viewport.focus({preventScroll:true});} });
    this.total = this.toolbar.createSpan({cls:"cpv-page-total",text:"/ …"});
    this.next = this.button(this.toolbar, "chevron-right", "다음 페이지", () => this.go(this.state.page + (isSpread(this.state.layout) ? 2 : 1)));
    this.toolbar.createDiv({cls:"cpv-toolbar-space"});
    if (options.popup) {
      this.layoutButton = this.textButton(this.toolbar, layouts[this.state.layout], "페이지 배치", () => this.showLayout());
      this.fitButton = this.textButton(this.toolbar, this.fitLabel(), "크기 맞춤", () => this.showFit());
      this.button(this.toolbar, "minus", "축소", () => this.zoomBy(1 / 1.2));
      this.zoomLabel = this.toolbar.createSpan({cls:"cpv-zoom-label"});
      this.button(this.toolbar, "plus", "확대", () => this.zoomBy(1.2));
    } else {
      this.textButton(this.toolbar, "보기", "보기", () => this.showCardMenu());
      this.button(this.toolbar, "maximize", "크게 보기", () => options.open?.());
    }
    this.viewport = this.root.createDiv({cls:"cpv-viewport"});
    this.reading = options.popup;
    this.viewport.tabIndex = options.popup ? 0 : -1;
    if(!options.popup) {
      this.readingHint=this.root.createDiv({cls:"cpv-reading-hint",text:"Enter 읽기 · Ctrl+Enter 미리보기"});
      this.readingHint.setAttribute("role","status");
      this.readingHint.setAttribute("aria-live","polite");
    }
    this.viewport.setAttribute("aria-label", "PDF 페이지");
    // Handle reading keys in Obsidian's keymap, before Canvas's nudge bindings.
    // A DOM keydown listener runs too late to stop those bindings.
    this.keyScope = new Scope(options.parentScope);
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"]) {
      this.keyScope.register(null, key, event => {
        if (!this.reading || !this.root.contains(this.root.ownerDocument.activeElement)) return;
        // Keep number-input editing native while preventing Canvas shortcuts.
        if (event.target instanceof this.input.ownerDocument.defaultView!.HTMLInputElement) {
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          if (key === "ArrowUp" || key === "ArrowDown") {
            this.viewport.scrollBy({top: key === "ArrowDown" ? 80 : -80});
          } else {
            this.go(this.state.page + (key === "ArrowRight" || key === "PageDown" ? 1 : -1));
          }
        }
        return false;
      });
    }
    if(!options.popup) this.keyScope.register(null,"Escape",event=>{
      event.stopPropagation();this.exitReading();return false;
    });
    this.root.addEventListener("focusin", event => {
      if(!this.reading && this.toolbar.contains(event.target as Node)) this.enterReading(false);
      if (this.reading && !this.scopeActive) {
        options.keymap.pushScope(this.keyScope);
        this.scopeActive = true;
      }
    });
    this.root.addEventListener("focusout", () => {
      queueMicrotask(() => {
        if (!this.root.contains(this.root.ownerDocument.activeElement)) this.releaseKeyScope();
      });
    });
    // Toolbar controls retain their direct actions; body clicks only select
    // or drag the card. Enter explicitly switches to reading.
    this.root.addEventListener("pointerdown", event => {
      if(event.button!==0)return;
      if((event.target as Element).closest(".cpv-toolbar")) this.enterReading();
      if (this.reading && !(event.target as Element).closest("input")) {
        this.viewport.focus({preventScroll: true});
      }
    }, true);
    this.status = this.viewport.createDiv({cls:"cpv-status",text:"PDF를 불러오는 중…"});
    if (!options.popup) this.root.appendChild(this.toolbar);
    this.root.classList.toggle("cpv-reading",this.reading);
    this.root.ownerDocument.addEventListener("pointerdown",this.outside,true);
    for (const name of ["pointerdown", "mousedown", "click", "dblclick"] as const)
      this.toolbar.addEventListener(name, e => e.stopPropagation());
    this.root.addEventListener("wheel", e => {
      if (!this.reading || e.ctrlKey || e.metaKey) return;
      e.stopPropagation();
    }, {passive:true});
    this.viewport.addEventListener("pointerdown", e => {
      if(e.button!==0)return;
      if(this.reading) {e.stopPropagation();return;}
      e.preventDefault();
    });
    this.viewport.addEventListener("dblclick", e => {
      if(!options.popup) {e.preventDefault();e.stopPropagation();options.open?.();}
    });
    this.viewport.addEventListener("scroll", () => this.scheduleVisible(), {passive:true});
    this.resize = new ResizeObserver(() => {
      const w=this.viewport.clientWidth, h=this.viewport.clientHeight;
      if(w===this.lastWidth && h===this.lastHeight) return;
      this.lastWidth=w;this.lastHeight=h;
      this.win.clearTimeout(this.resizeTimer);
      this.resizeTimer=this.win.setTimeout(() => this.layout(true),100);
    });
    this.resize.observe(this.viewport);
    void this.load();
  }
  private enterReading(focus = true) {
    if(this.disposed)return;
    this.reading=true;this.root.classList.add("cpv-reading");
    this.viewport.tabIndex=0;
    if(this.readingHint)this.readingHint.textContent="읽기 중 · Enter 복귀 · Ctrl+Enter 미리보기";
    if(focus)this.viewport.focus({preventScroll:true});
  }
  toggleReading() {
    if(this.reading)this.exitReading();else this.enterReading();
  }
  exitReading() {
    if(this.options.popup)return;
    this.reading=false;this.root.classList.remove("cpv-reading");
    this.viewport.tabIndex=-1;this.releaseKeyScope();
    if(this.readingHint)this.readingHint.textContent="Enter 읽기 · Ctrl+Enter 미리보기";
    if(this.root.contains(this.root.ownerDocument.activeElement)) {
      (this.root.closest(".canvas-wrapper") as HTMLElement|null)?.focus({preventScroll:true});
    }
  }
  private button(parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
    const b=parent.createEl("button",{cls:"cpv-icon-button",attr:{"aria-label":label,title:label}});
    setIcon(b,icon);b.addEventListener("click",action);return b;
  }
  private releaseKeyScope() {
    if (this.scopeActive) {
      this.options.keymap.popScope(this.keyScope);
      this.scopeActive = false;
    }
  }
  private textButton(parent:HTMLElement,text:string,label:string,action:()=>void):HTMLButtonElement {
    const b=parent.createEl("button",{cls:"cpv-text-button",attr:{"aria-label":label}});
    b.createSpan({text});setIcon(b.createSpan({cls:"cpv-chevron"}),"chevron-down");b.addEventListener("click",action);return b;
  }
  private fitLabel() {return this.state.zoom !== null ? "사용자 배율" : this.state.fit==="page"?"페이지 전체":"너비 맞춤";}
  private positionMenu(menu: Menu, anchor: HTMLElement) {
    this.menu?.hide();this.menu=menu;
    const r=anchor.getBoundingClientRect();menu.showAtPosition({x:r.left,y:r.bottom});
  }
  private addLayouts(menu: Menu) {
    for(const [layout,label] of Object.entries(layouts)) menu.addItem(item => item.setTitle(label).setChecked(this.state.layout===layout).onClick(() => {
      this.state.layout=layout as Layout;this.changed();this.layout(true);
    }));
  }
  private addFits(menu: Menu) {
    for(const [fit,label] of [["page","페이지 전체 맞춤"],["width","너비 맞춤"]] as const) menu.addItem(item => item.setTitle(label).setChecked(this.state.fit===fit && this.state.zoom===null).onClick(() => {
      this.state.fit=fit;this.state.zoom=null;this.changed();this.layout(true);
    }));
  }
  private showLayout() {const menu=new Menu();this.addLayouts(menu);this.positionMenu(menu,this.layoutButton!);}
  private showFit() {const menu=new Menu();this.addFits(menu);this.positionMenu(menu,this.fitButton!);}
  private showCardMenu() {
    const menu=new Menu();this.addLayouts(menu);menu.addSeparator();this.addFits(menu);
    this.positionMenu(menu,this.toolbar.querySelector(".cpv-text-button")!);
  }
  private async load() {
    const generation=++this.generation;
    this.lease?.release();this.lease=this.options.pool.acquire(this.options.file);
    try {
      const doc=await this.lease.document;
      if(this.disposed||generation!==this.generation) return;
      this.doc=doc;
      const first=await doc.getPage(clampPage(this.state.page,doc.numPages));
      if(this.disposed||generation!==this.generation)return;
      this.fallback=first.getViewport({scale:1});
      this.sizes.set(first.pageNumber,this.fallback);
      this.state.page=clampPage(this.state.page,doc.numPages);
      this.status.remove();this.changed();this.layout(true);
    } catch(e) {if(!this.disposed&&generation===this.generation)this.showError(e);}
  }
  private showError(error: unknown) {
    this.cancelSlots();this.viewport.empty();
    this.status=this.viewport.createDiv({cls:"cpv-status"});
    this.status.createDiv({text:"PDF를 읽을 수 없습니다."});
    this.status.createDiv({cls:"cpv-error-detail",text:error instanceof Error?error.message:"파일을 확인한 뒤 다시 시도해 주세요."});
    const retry=this.status.createEl("button",{text:"다시 시도"});
    retry.addEventListener("click",()=>{this.status.setText("PDF를 불러오는 중…");void this.load();});
  }
  private changed() {
    this.input.value=String(this.state.page);
    this.total.setText(`/ ${this.doc?.numPages??"…"}`);
    this.input.max=String(this.doc?.numPages??1);
    this.prev.disabled=this.state.page<=1;
    this.next.disabled=this.state.page>=(this.doc?.numPages??1);
    this.layoutButton?.querySelector("span")?.setText(layouts[this.state.layout]);
    this.fitButton?.querySelector("span")?.setText(this.fitLabel());
    this.root.dataset.layout=this.state.layout;
    this.root.dataset.fit=this.state.zoom===null?this.state.fit:"custom";
    this.root.dataset.page=String(this.state.page);
    this.options.changed({...this.state});
  }
  go(page: number) {
    if(!this.doc)return;
    this.state.page=clampPage(page,this.doc.numPages);this.changed();
    if(isContinuous(this.state.layout)) this.scrollToPage(); else this.layout(true);
  }
  private zoomBy(factor:number) {
    const scale=this.slots.find(s=>s.page===this.state.page)?.scale??1;
    this.state.zoom=Math.max(.1,Math.min(4,scale*factor));this.changed();this.layout(true);
  }
  private cancelSlots() {
    for(const s of this.slots) {s.task?.cancel();if(s.canvas){s.canvas.width=0;s.canvas.height=0;}}
    this.slots=[];
  }
  private layout(scroll:boolean) {
    if(this.disposed||!this.doc||this.viewport.clientWidth<1||this.viewport.clientHeight<1)return;
    this.cancelSlots();this.viewport.empty();
    const rows=pageRows(this.doc.numPages,this.state);
    this.viewport.classList.toggle("cpv-continuous",isContinuous(this.state.layout));
    for(const row of rows) {
      const rowEl=this.viewport.createDiv({cls:"cpv-page-row"});
      const sizes=row.map(n=>this.sizes.get(n)??this.fallback);
      const scale=this.state.zoom??fitScale(this.viewport.clientWidth,this.viewport.clientHeight,sizes,this.state.fit);
      for(let i=0;i<row.length;i++) {
        const n=row[i], size=sizes[i];
        const el=rowEl.createDiv({cls:"cpv-page",attr:{"data-page":String(n),"aria-label":`${n}페이지`}});
        el.style.width=`${size.width*scale}px`;el.style.height=`${size.height*scale}px`;
        el.createSpan({cls:"cpv-page-placeholder",text:String(n)});
        this.slots.push({page:n,el,scale,pending:false});
      }
    }
    if(scroll)this.scrollToPage();
    this.scheduleVisible();
    const scale=this.slots.find(s=>s.page===this.state.page)?.scale??1;
    this.zoomLabel?.setText(`${Math.round(scale*100)}%`);
  }
  private scrollToPage() {
    const slot=this.slots.find(s=>s.page===this.state.page);if(!slot)return;
    this.navigating=true;this.win.clearTimeout(this.navTimer);
    this.viewport.scrollTop=slot.el.parentElement!.offsetTop-12;
    this.viewport.scrollLeft=0;
    this.navTimer=this.win.setTimeout(()=>{this.navigating=false;this.scheduleVisible();},150);
    this.scheduleVisible();
  }
  private scheduleVisible() {
    if(this.frame||this.disposed)return;
    this.frame=this.win.requestAnimationFrame(()=>{this.frame=0;this.renderVisible();});
  }
  private renderVisible() {
    if(this.disposed||!this.doc)return;
    const top=this.viewport.scrollTop,bottom=top+this.viewport.clientHeight;
    let current: Slot|undefined;
    for(const s of this.slots) {
      const y=s.el.parentElement!.offsetTop,h=s.el.offsetHeight;
      if(!current&&y+h>top+24)current=s;
      const nearby=y+h>=top-200&&y<=bottom+200;
      if(nearby && !s.canvas && !s.pending && this.jobs<2)void this.renderPage(s);
      else if(!nearby&&s.canvas){s.task?.cancel();s.canvas.width=0;s.canvas.height=0;s.canvas.remove();s.canvas=undefined;s.el.classList.remove("cpv-page-ready");}
    }
    const sameSpread=current && isSpread(this.state.layout) && Math.floor((current.page-1)/2)===Math.floor((this.state.page-1)/2);
    if(!this.navigating&&isContinuous(this.state.layout)&&current&&current.page!==this.state.page&&!sameSpread){
      this.state.page=current.page;this.changed();
    }
  }
  private async renderPage(slot:Slot) {
    slot.pending=true;this.jobs++;
    try {
      const page=await this.doc.getPage(slot.page);
      if(this.disposed||!slot.el.isConnected)return;
      const size=page.getViewport({scale:1});
      if(!this.sizes.has(slot.page)){
        this.sizes.set(slot.page,size);
        if(Math.abs(size.width-this.fallback.width)>1||Math.abs(size.height-this.fallback.height)>1){
          this.layout(true);return;
        }
      }
      const canvas=slot.el.createEl("canvas");slot.canvas=canvas;
      canvas.setAttribute("role","img");canvas.setAttribute("aria-label",`${this.options.file.name} ${slot.page}페이지`);
      // Bound backing pixels; CSS dimensions still follow fit or user zoom.
      const pixels=Math.max(1,size.width*size.height*slot.scale*slot.scale);
      const density=Math.min(this.win.devicePixelRatio||1,2,Math.sqrt(8_000_000/pixels));
      const viewport=page.getViewport({scale:slot.scale*density});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      slot.task=page.render({canvasContext:canvas.getContext("2d"),viewport,background:"rgb(255,255,255)"});
      await slot.task.promise;
      if(!this.disposed&&slot.el.isConnected&&slot.canvas===canvas)slot.el.classList.add("cpv-page-ready");
    } catch(e) {
      if((e as Error)?.name!=="RenderingCancelledException"&&!this.disposed&&slot.el.isConnected){
        slot.el.createDiv({cls:"cpv-page-error",text:"페이지 표시 실패"});
        console.error("Canvas PDF Viewcard: page render failed",e);
      }
    } finally {slot.pending=false;slot.task=undefined;this.jobs--;this.scheduleVisible();}
  }
  destroy() {
    this.disposed=true;++this.generation;
    this.root.ownerDocument.removeEventListener("pointerdown",this.outside,true);
    this.releaseKeyScope();
    this.menu?.hide();this.resize.disconnect();this.win.clearTimeout(this.resizeTimer);this.win.clearTimeout(this.navTimer);
    this.win.cancelAnimationFrame(this.frame);this.cancelSlots();this.lease?.release();this.root.remove();
  }
}
