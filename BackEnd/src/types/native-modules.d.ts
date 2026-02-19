// Déclarations de modules natifs optionnels (installés en production/Docker)
// Ces modules sont lourds et nécessitent des outils natifs pour compiler sur
// certaines machines. On les déclare ici pour éviter les erreurs TypeScript.

declare module 'pdf-lib' {
  export class PDFDocument {
    static load(bytes: Uint8Array | ArrayBuffer | string): Promise<PDFDocument>;
    getPageCount(): number;
    getPage(index: number): any;
  }
}

declare module 'pdfjs-dist/legacy/build/pdf' {
  export const GlobalWorkerOptions: { workerSrc: any };
  export function getDocument(params: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNum: number): Promise<any>;
    }>;
  };
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.entry' {
  const content: any;
  export default content;
}

declare module 'canvas' {
  export function createCanvas(width: number, height: number): {
    getContext(type: '2d'): any;
    toBuffer(format: string): Buffer;
    width: number;
    height: number;
  };
}
